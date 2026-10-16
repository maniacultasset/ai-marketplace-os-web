/**
 * Variants and media (hi-fi p10) for one saved product (`?product=`).
 *
 * Variants: the API can only create them through a CSV import with parent_style_id
 * (./variants-model.ts), so "Save variants" uploads the matrix as a spreadsheet to
 * POST /products/bulk and opens its check step (/add/bulk?import=…); "Download spreadsheet"
 * gives the same file to edit offline.
 * Images: POST /images/upload-url → PUT → POST /images/upload (or multipart), then
 * GET /images/{id}/report for the per-marketplace checks. Images attach to the product; per-colour
 * images need `colourway_id`, which no endpoint exposes yet, so the card says so.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { api, unwrap } from '@/api/client'
import { describeError, isApiError } from '@/api/errors'
import { idempotencyHeader, newIdempotencyKey, useIntentKey } from '@/api/idempotency'
import { Page, PageHeader } from '@/components/app/page-header'
import { Banner, CardHead, DashedCard, FooterBar, Icon, LaCard, StatusChip, VariantCell } from '@/components/la'
import { EmptyState } from '@/components/states/empty-state'
import { ErrorState } from '@/components/states/error-state'
import { ReferenceId } from '@/components/states/reference-id'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { imageIdFromKey, marketplaceReports, SLOT_LABEL, validateImageFile, type ImageSlot } from '@/features/analytics-images/images/report'
import { uploadImage } from '@/features/analytics-images/images/upload'
import { useImportHistory } from '@/features/imports/history'
import { markJobLive } from '@/features/imports/use-import-job'
import { useProduct } from '@/features/products/api'
import { useCapability } from '@/hooks/use-capabilities'
import { useKeys } from '@/lib/query-keys'
import { cn } from '@/lib/utils'
import { useAllProducts } from './catalog'
import type { Marketplace } from './catalog-model'
import { serializeListOn } from './list-on'
import {
  addTag,
  buildFamilyCsv,
  buildVariants,
  cellKey,
  emptyVariants,
  SIZE_SYSTEMS,
  validateVariants,
  type Commercial,
  type VariantErrors,
  type VariantsState,
} from './variants-model'

function download(name: string, text: string) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function TagInput({ id, label, values, onChange, placeholder, error }: { id: string; label: string; values: string[]; onChange: (v: string[]) => void; placeholder: string; error?: string }) {
  const [draft, setDraft] = useState('')
  const commit = () => {
    if (!draft.trim()) return
    onChange(addTag(values, draft))
    setDraft('')
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Backspace' && !draft && values.length) onChange(values.slice(0, -1))
  }
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1.5 block text-small font-bold text-ink">
        {label}
      </label>
      <div
        className={cn(
          'flex min-h-10 flex-wrap items-center gap-1.5 rounded-control border bg-surface px-2 py-1.5 focus-within:border-brand focus-within:shadow-focus',
          error ? 'border-danger' : 'border-line-strong',
        )}
      >
        {values.map((v) => (
          <span key={v} className="inline-flex h-[26px] items-center gap-1 rounded-full border border-line-strong bg-surface pr-1 pl-2.5 text-caption font-semibold text-ink">
            {v}
            <button
              type="button"
              className="focus-ring inline-flex size-5 items-center justify-center rounded-full text-ink-2 hover:bg-subtle"
              aria-label={`Remove ${v}`}
              onClick={() => onChange(values.filter((x) => x !== v))}
            >
              <Icon name="x" size={12} />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={commit}
          placeholder={values.length ? '+ add' : placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-hint`}
          className="h-[26px] min-w-20 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-ink-3"
        />
      </div>
      <p id={`${id}-hint`} className={cn('mt-1.5 text-caption', error ? 'font-semibold text-danger' : 'text-ink-3')}>
        {error ?? 'Press Enter after each one.'}
      </p>
    </div>
  )
}

function MoneyInput({ id, label, value, onChange, error }: { id: string; label: string; value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <div className="min-w-0">
      <div className="relative">
        <span aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-small text-ink-2">
          ₹
        </span>
        <Input id={id} aria-label={label} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={error ? true : undefined} className="h-8 pl-6 text-small" />
      </div>
      {error ? <p className="mt-1 text-caption font-semibold text-danger">{error}</p> : null}
    </div>
  )
}

/* ---------------------------------------------------------------------------------------------- */
/* Images                                                                                          */
/* ---------------------------------------------------------------------------------------------- */

interface Upload {
  id: string
  file: File
  preview: string
  slot: ImageSlot
  state: { kind: 'uploading' } | { kind: 'failed'; error: unknown } | { kind: 'invalid'; message: string } | { kind: 'accepted'; imageId: string }
}

function ReportChip({ imageId, label }: { imageId: string; label: string }) {
  const keys = useKeys()
  const q = useQuery({
    queryKey: keys.images.report(imageId),
    queryFn: () => unwrap(api.GET('/images/{image_id}/report', { params: { path: { image_id: imageId } } })),
    refetchInterval: (query) => (query.state.data?.compliance_status === 'pending' ? 10_000 : false),
    refetchIntervalInBackground: false,
  })
  if (q.isPending) return <StatusChip status="working">{label}: loading check…</StatusChip>
  if (q.error) return <StatusChip status="error">{label}: check unavailable</StatusChip>
  const r = q.data
  if (r.compliance_status === 'pending') return <StatusChip status="working">{label}: queued for checks</StatusChip>
  if (r.compliance_status === 'passed') return <StatusChip status="live">{label}: passes the checks</StatusChip>
  const issue = marketplaceReports(r).flatMap((m) => m.issues ?? [])[0]
  return <StatusChip status="error">{label}: {issue ? issue.suggestion : 'fails a check'}</StatusChip>
}

function useImageUploads(productId: string) {
  const qc = useQueryClient()
  const keys = useKeys()
  const [uploads, setUploads] = useState<Upload[]>([])
  const urls = useRef(new Set<string>())
  useEffect(() => {
    const set = urls.current
    return () => set.forEach((u) => URL.revokeObjectURL(u))
  }, [])
  const patch = (id: string, state: Upload['state']) => setUploads((l) => l.map((u) => (u.id === id ? { ...u, state } : u)))
  /**
   * One Idempotency-Key per upload (`u.id`, minted once in add()). A retry sends the same key, so
   * if the first attempt reached the server and only the response was lost, the server replays it
   * instead of storing the image twice (routers/images.py requires the key).
   */
  const send = (u: Upload) => {
    patch(u.id, { kind: 'uploading' })
    uploadImage({ file: u.file, productId, slot: u.slot, multipartKey: u.id })
      .then((res) => {
        patch(u.id, { kind: 'accepted', imageId: res.image_id })
        void qc.invalidateQueries({ queryKey: keys.products.detail(productId) })
      })
      .catch((error: unknown) => patch(u.id, { kind: 'failed', error }))
  }
  const add = (files: File[], slotFor: (i: number) => ImageSlot) => {
    const created = files.map((file, i): Upload => {
      const preview = URL.createObjectURL(file)
      urls.current.add(preview)
      const problem = validateImageFile(file)
      return { id: newIdempotencyKey(), file, preview, slot: slotFor(i), state: problem ? { kind: 'invalid', message: problem } : { kind: 'uploading' } }
    })
    setUploads((l) => [...l, ...created])
    created.filter((u) => u.state.kind === 'uploading').forEach((u) => send(u))
  }
  return { uploads, add, retry: (u: Upload) => send(u) }
}

function ImagesCard({ productId, existing, canUpload }: { productId: string; existing: string[]; canUpload: boolean }) {
  const { uploads, add, retry } = useImageUploads(productId)
  const input = useRef<HTMLInputElement>(null)
  const galleryUploads = uploads.filter((u) => u.slot !== 'size_chart')
  const existingIds = existing.map(imageIdFromKey).filter((x): x is string => !!x)
  const sessionIds = new Set(galleryUploads.flatMap((u) => (u.state.kind === 'accepted' ? [u.state.imageId] : [])))
  const stored = existingIds.filter((id) => !sessionIds.has(id))
  const count = stored.length + galleryUploads.length
  return (
    <LaCard>
      <CardHead title="Images for this product" sub="Per-colour images are not available yet; these apply to every variant." />
      <div className="mt-4 flex flex-wrap gap-2.5">
        {stored.map((id, i) => (
          <span key={id} className="relative flex size-[84px] items-center justify-center rounded-lg border border-line bg-subtle text-ink-3">
            <Icon name="image" size={24} />
            <span className="absolute bottom-1 left-1 rounded bg-surface px-1 text-[11px] font-semibold text-ink">Image {i + 1}</span>
          </span>
        ))}
        {galleryUploads.map((u) => (
          <span key={u.id} className="relative size-[84px] overflow-hidden rounded-lg border border-line bg-subtle">
            <img src={u.preview} alt="" className="size-full object-cover" />
            <span className="absolute bottom-1 left-1 rounded bg-surface px-1 text-[11px] font-semibold text-ink">{SLOT_LABEL[u.slot]}</span>
            {u.state.kind === 'uploading' ? (
              <span className="absolute inset-0 flex items-center justify-center bg-surface/70">
                <Spinner />
                <span className="sr-only">Uploading…</span>
              </span>
            ) : null}
          </span>
        ))}
        {canUpload ? (
          <>
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="focus-ring flex size-[84px] items-center justify-center rounded-lg border-[1.5px] border-dashed border-line-strong text-ink-2 hover:border-brand hover:text-brand"
              aria-label="Add images"
            >
              <Icon name="plus" size={22} />
            </button>
            <input
              ref={input}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              hidden
              onChange={(e) => {
                const files = [...(e.target.files ?? [])]
                e.target.value = ''
                add(files, (i) => (count === 0 && i === 0 ? 'main' : 'secondary'))
              }}
            />
          </>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2" aria-live="polite">
        {stored.map((id, i) => (
          <ReportChip key={id} imageId={id} label={`Image ${i + 1}`} />
        ))}
        {galleryUploads.map((u) =>
          u.state.kind === 'accepted' ? (
            <ReportChip key={u.id} imageId={u.state.imageId} label={SLOT_LABEL[u.slot]} />
          ) : u.state.kind === 'invalid' ? (
            <StatusChip key={u.id} status="error">
              {u.file.name}: {u.state.message}
            </StatusChip>
          ) : u.state.kind === 'failed' ? (
            <span key={u.id} className="inline-flex items-center gap-2">
              <StatusChip status="error">
                {u.file.name}: {describeError(u.state.error)}
              </StatusChip>
              <Button variant="ghost" size="xs" onClick={() => retry(u)}>
                Retry
              </Button>
            </span>
          ) : null,
        )}
      </div>
      {count === 0 ? <p className="mt-2 text-small text-ink-2">No images yet. The first one you add becomes the main image.</p> : null}
    </LaCard>
  )
}

function SizeChartCard({ productId, canUpload }: { productId: string; canUpload: boolean }) {
  const { uploads, add, retry } = useImageUploads(productId)
  const input = useRef<HTMLInputElement>(null)
  const last = uploads.at(-1)
  return (
    <DashedCard className="flex flex-col items-center justify-center text-center">
      <Icon name="upload" size={22} className="text-ink-2" />
      <h3 className="mt-2 font-display text-[15px] font-bold text-ink">Size chart</h3>
      <p className="mt-1 max-w-[34ch] text-small text-ink-2">Upload your brand’s chart for this style. It is checked like any other image.</p>
      {canUpload ? (
        <>
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => input.current?.click()} disabled={last?.state.kind === 'uploading'}>
            {last?.state.kind === 'uploading' ? <Spinner data-icon="inline-start" /> : null}
            Upload
          </Button>
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) add([f], () => 'size_chart')
            }}
          />
        </>
      ) : null}
      {last ? (
        <div className="mt-3">
          {last.state.kind === 'accepted' ? (
            <ReportChip imageId={last.state.imageId} label="Size chart" />
          ) : last.state.kind === 'invalid' ? (
            <StatusChip status="error">{last.state.message}</StatusChip>
          ) : last.state.kind === 'failed' ? (
            <span className="inline-flex items-center gap-2">
              <StatusChip status="error">{describeError(last.state.error)}</StatusChip>
              <Button variant="ghost" size="xs" onClick={() => retry(last)}>
                Retry
              </Button>
            </span>
          ) : null}
        </div>
      ) : null}
    </DashedCard>
  )
}

/* ---------------------------------------------------------------------------------------------- */

function ProductPicker({ listOn }: { listOn: Marketplace[] }) {
  const on = serializeListOn(listOn)
  const navigate = useNavigate()
  const all = useAllProducts()
  const styles = (all.data?.rows ?? []).filter((p) => !p.parent_product_id)
  return (
    <Page>
      <PageHeader title="Variants and media" description="Choose the product to add sizes, colours and images to." />
      <LaCard className="max-w-xl">
        {all.isPending ? (
          <Skeleton className="h-10 w-full" />
        ) : all.error ? (
          <ErrorState error={all.error} compact onRetry={() => void all.refetch()} />
        ) : styles.length === 0 ? (
          <EmptyState
            title="No products yet"
            description="Save a product with the guided form first."
            actions={
              <Button size="sm" asChild>
                <Link to="/add/guided">Open the guided form</Link>
              </Button>
            }
            compact
          />
        ) : (
          <>
            <label htmlFor="v-product" className="mb-1.5 block text-small font-bold text-ink">
              Product
            </label>
            <Select onValueChange={(id) => void navigate({ to: '/add/variants', search: { product: id, ...(on ? { on } : {}) } })}>
              <SelectTrigger id="v-product" className="w-full">
                <SelectValue placeholder="Choose a product…" />
              </SelectTrigger>
              <SelectContent>
                {styles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.sku} · {p.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </LaCard>
    </Page>
  )
}

const PREVIEW_ROWS = 4

/** `listOn` is the p08 "List on" choice, carried through to the check-and-send step. */
export function VariantsPage({ productId, listOn = [] }: { productId: string | null; listOn?: Marketplace[] }) {
  if (!productId) return <ProductPicker listOn={listOn} />
  return <VariantsEditor productId={productId} listOn={listOn} />
}

function VariantsEditor({ productId, listOn }: { productId: string; listOn: Marketplace[] }) {
  const on = serializeListOn(listOn)
  const navigate = useNavigate()
  const q = useProduct(productId)
  const all = useAllProducts()
  const imagesLive = useCapability('images')
  const history = useImportHistory()
  const intent = useIntentKey()
  const [s, setS] = useState<VariantsState>(() => ({ ...emptyVariants(), sizes: [...SIZE_SYSTEMS[0]!.sizes] }))
  const [errors, setErrors] = useState<VariantErrors>({})
  const [showAll, setShowAll] = useState(false)

  const p = q.data
  const existingVariants = useMemo(() => (all.data?.rows ?? []).filter((x) => x.parent_product_id === productId), [all.data, productId])
  const rows = useMemo(() => (p ? buildVariants(p.sku, s) : []), [p, s])

  const upload = useMutation({
    meta: { toast: false },
    mutationFn: (csv: string) => {
      const fd = new FormData()
      fd.append('file', new File([csv], `${p!.sku}-variants.csv`, { type: 'text/csv' }))
      return unwrap(api.POST('/products/bulk', { params: { header: idempotencyHeader(intent.get()) }, body: fd as never }))
    },
    onSuccess: (res, csvText) => {
      intent.reset()
      markJobLive(res.job_id, res.import_id)
      history.add({ import_id: res.import_id, job_id: res.job_id, filename: `${p!.sku}-variants.csv`, size: new Blob([csvText]).size, created_at: new Date().toISOString() })
      void navigate({ to: '/add/bulk', search: { import: res.import_id, job: res.job_id, ...(on ? { on } : {}) } })
    },
    onError: (err) => {
      if (isApiError(err) && err.type === 'IDEMPOTENCY_KEY_REUSED') intent.reset()
    },
  })

  const change = (next: Partial<VariantsState>) => {
    intent.reset()
    setS((x) => ({ ...x, ...next }))
    setErrors({})
  }
  const setCommercial = (key: string, patch: Partial<Commercial>) =>
    change({ commercial: { ...s.commercial, [key]: { mrp: '', price: '', identifier: '', ...s.commercial[key], ...patch } } })

  if (q.isPending)
    return (
      <Page>
        <Skeleton className="mb-6 h-8 w-72" />
        <Skeleton className="h-64 rounded-card" />
      </Page>
    )
  if (q.error || !p)
    return (
      <Page>
        <LaCard pad="none">
          <ErrorState error={q.error} title="Couldn’t load this product" onRetry={() => void q.refetch()} />
        </LaCard>
      </Page>
    )
  if (p.parent_product_id)
    return (
      <Page>
        <PageHeader title="Variants and media" description={`${p.title} · ${p.sku}`} />
        <Banner tone="attention" title="This product is a variant" action={<Button size="sm" variant="secondary" asChild><Link to="/add/variants" search={{ product: p.parent_product_id, ...(on ? { on } : {}) }}>Open its style</Link></Button>}>
          Sizes and colours are added to the style, not to one of its variants.
        </Banner>
      </Page>
    )

  const validate = () => {
    const e = validateVariants(p.sku, s)
    setErrors(e)
    return Object.keys(e).length === 0
  }
  const csv = () => buildFamilyCsv({ sku: p.sku, title: p.title, category: p.category }, s)
  const visible = showAll ? rows : rows.slice(0, PREVIEW_ROWS)
  const first = rows[0]

  return (
    <div className="flex min-h-[calc(100svh-56px)] flex-col">
      <Page className="flex-1">
        <PageHeader
          title="Variants and media"
          description={
            <>
              <Link to="/products/$productId" params={{ productId: p.id }} className="hover:underline">
                {p.title}
              </Link>{' '}
              · {p.sku}
            </>
          }
          actions={upload.isPending ? <StatusChip status="working">Uploading…</StatusChip> : <StatusChip status="draft">Not saved yet</StatusChip>}
        />
        {existingVariants.length ? (
          <Banner tone="info" className="mb-4">
            This style already has {existingVariants.length} {existingVariants.length === 1 ? 'variant' : 'variants'}. Saving adds the ones you list and updates any with the same SKU; it never removes one.
          </Banner>
        ) : null}

        <div className="grid gap-4 md:grid-cols-3">
          <TagInput id="v-colours" label="Colours" values={s.colours} onChange={(colours) => change({ colours })} placeholder="Black, Off white…" error={errors.colours} />
          <TagInput id="v-sizes" label="Sizes" values={s.sizes} onChange={(sizes) => change({ sizes })} placeholder="S, M, L…" error={errors.sizes} />
          <div className="min-w-0">
            <label htmlFor="v-system" className="mb-1.5 block text-small font-bold text-ink">
              Size system
            </label>
            <Select value={s.sizeSystem} onValueChange={(v) => change({ sizeSystem: v })}>
              <SelectTrigger id="v-system" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SIZE_SYSTEMS.map((x) => (
                  <SelectItem key={x.value} value={x.value}>
                    {x.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <LaCard className="mt-4">
          <CardHead title="Which combinations do you make?" action={<span className="hidden text-small text-ink-3 sm:inline">Select a cell to mark it not made</span>} />
          {s.colours.length || s.sizes.length ? (
            <div className="mt-4 overflow-x-auto">
              <div
                className="grid min-w-max items-center gap-1.5"
                style={{ gridTemplateColumns: `100px repeat(${Math.max(s.sizes.length, 1)}, minmax(84px, 1fr))` }}
              >
                <span />
                {(s.sizes.length ? s.sizes : ['—']).map((z) => (
                  <b key={z} className="text-center text-body text-ink">
                    {z}
                  </b>
                ))}
                {(s.colours.length ? s.colours : ['—']).map((c) => (
                  <div key={c} className="contents">
                    <b className="truncate text-body text-ink">{c}</b>
                    {(s.sizes.length ? s.sizes : ['—']).map((z) => {
                      const key = cellKey(s.colours.length ? c : '', s.sizes.length ? z : '')
                      const off = s.unavailable.includes(key)
                      const row = rows.find((r) => r.key === key)
                      return (
                        <VariantCell
                          key={z}
                          unavailable={off}
                          label={`${c} ${z}: ${off ? 'not made' : 'made'}`}
                          onToggle={() => change({ unavailable: off ? s.unavailable.filter((k) => k !== key) : [...s.unavailable, key] })}
                        >
                          {row?.sku.slice(p.sku.length + 1) || row?.sku}
                        </VariantCell>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-3 text-small text-ink-2">Add colours or sizes above to build the matrix.</p>
          )}
          <p className="mt-3 text-small text-ink-3">
            {rows.length} {rows.length === 1 ? 'variant' : 'variants'} will be created. We never add one you did not list.
          </p>
          {errors.form ? <p className="mt-1 text-small font-semibold text-danger">{errors.form}</p> : null}
        </LaCard>

        {rows.length ? (
          <LaCard pad="none" className="mt-4 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-small" aria-label="Variant prices and identifiers">
                <thead>
                  <tr className="h-[38px] bg-canvas text-left text-caption font-bold text-ink-2">
                    <th className="px-4">Variant SKU</th>
                    <th className="w-[130px] px-2">MRP (incl. tax)</th>
                    <th className="w-[130px] px-2">Price</th>
                    <th className="px-2">Identifier</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => {
                    const c = s.commercial[r.key] ?? { mrp: '', price: '', identifier: '' }
                    return (
                      <tr key={r.key} className="border-t border-line align-top">
                        <td className="px-4 py-2">
                          <Input
                            aria-label={`SKU for ${[r.colour, r.size].filter(Boolean).join(' ')}`}
                            value={s.skus[r.key] ?? r.sku}
                            onChange={(e) => change({ skus: { ...s.skus, [r.key]: e.target.value } })}
                            aria-invalid={errors[`${r.key}.sku`] ? true : undefined}
                            className="h-8 text-small"
                          />
                          {errors[`${r.key}.sku`] ? <p className="mt-1 text-caption font-semibold text-danger">{errors[`${r.key}.sku`]}</p> : null}
                        </td>
                        <td className="px-2 py-2">
                          <MoneyInput id={`mrp-${r.sku}`} label={`MRP for ${r.sku}`} value={c.mrp} onChange={(v) => setCommercial(r.key, { mrp: v })} error={errors[`${r.key}.mrp`]} />
                        </td>
                        <td className="px-2 py-2">
                          <MoneyInput id={`price-${r.sku}`} label={`Price for ${r.sku}`} value={c.price} onChange={(v) => setCommercial(r.key, { price: v })} error={errors[`${r.key}.price`]} />
                        </td>
                        <td className="px-2 py-2">
                          <Input
                            aria-label={`GTIN for ${r.sku}`}
                            placeholder="GTIN, or blank if exempt"
                            inputMode="numeric"
                            value={c.identifier}
                            onChange={(e) => setCommercial(r.key, { identifier: e.target.value })}
                            aria-invalid={errors[`${r.key}.identifier`] ? true : undefined}
                            className="h-8 text-small"
                          />
                          {errors[`${r.key}.identifier`] ? <p className="mt-1 text-caption font-semibold text-danger">{errors[`${r.key}.identifier`]}</p> : null}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5">
              {rows.length > PREVIEW_ROWS ? (
                <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? 'Show fewer' : `${rows.length - PREVIEW_ROWS} more variants`}
                </Button>
              ) : (
                <span />
              )}
              <Button
                variant="secondary"
                size="sm"
                disabled={!first}
                onClick={() => {
                  if (!first) return
                  const src = s.commercial[first.key] ?? { mrp: '', price: '', identifier: '' }
                  // Identifiers are unique per variant, so only the prices are copied.
                  const commercial = { ...s.commercial }
                  for (const r of rows) commercial[r.key] = { identifier: commercial[r.key]?.identifier ?? '', mrp: src.mrp, price: src.price }
                  change({ commercial })
                }}
              >
                Apply first row’s prices to all
              </Button>
            </div>
          </LaCard>
        ) : null}

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          {imagesLive ? (
            <>
              <ImagesCard productId={p.id} existing={(p.images ?? []) as string[]} canUpload />
              <SizeChartCard productId={p.id} canUpload />
            </>
          ) : (
            <LaCard className="lg:col-span-2">
              <CardHead title="Images" />
              <p className="mt-2 text-small text-ink-2">Image upload is not available on this server yet.</p>
            </LaCard>
          )}
        </div>

        {upload.error ? (
          <Banner tone="danger" role="alert" className="mt-4" title="Couldn’t save the variants">
            {isApiError(upload.error) && upload.error.type === 'IMPORT_FAILED'
              ? (upload.error.errorReport?.errors ?? []).map((x) => x.message).join(' ') || upload.error.message
              : describeError(upload.error)}
            {isApiError(upload.error) ? <ReferenceId id={upload.error.correlationId} className="mt-1" /> : null}
          </Banner>
        ) : null}
      </Page>
      <FooterBar status="Saved as a spreadsheet upload you check first.">
        <Button variant="ghost" asChild>
          <Link to="/products/$productId" params={{ productId: p.id }}>
            Skip for now
          </Link>
        </Button>
        <Button variant="secondary" onClick={() => validate() && download(`${p.sku}-variants.csv`, csv())} data-testid="variants-download">
          <Icon name="download" size={16} />
          Download spreadsheet
        </Button>
        <Button disabled={upload.isPending} onClick={() => validate() && upload.mutate(csv())} data-testid="variants-save">
          {upload.isPending ? <Spinner data-icon="inline-start" /> : null}
          Save {rows.length || ''} {rows.length === 1 ? 'variant' : 'variants'}
        </Button>
      </FooterBar>
    </div>
  )
}
