/**
 * Guided form (hi-fi p09): one product at a time, section by section.
 *
 * Real calls: POST /products (sku, title, category, attributes) and, on "Send to agent now",
 * POST /listings/generate per chosen marketplace (./generate.ts). The unsent draft is kept in this
 * browser only (localStorage, per brand) so a reload does not lose typing; nothing is stored
 * server-side until the person saves.
 *
 * Not in the API yet, shown honestly: agent classification and attribute extraction ("Agent's
 * understanding" says so), readiness percentages (shown only after the agent checks a draft).
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { format } from 'date-fns'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api, unwrap } from '@/api/client'
import { isApiError } from '@/api/errors'
import {
  AttentionCard,
  Banner,
  ComingSoon,
  FooterBar,
  Glyph,
  Icon,
  LaCard,
  LaField,
  MarketplaceName,
  SourceBadge,
  StatusChip,
  fieldHintId,
} from '@/components/la'
import { ReferenceId } from '@/components/states/reference-id'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { ATTRIBUTE_KEY_SUGGESTIONS, ATTRIBUTE_TEXT_MAX, KNOWN_CATEGORIES, SKU_MAX, TITLE_MAX } from '@/features/products/schema'
import { invalidateListingWork } from '@/features/listings/api'
import { useSession } from '@/lib/auth'
import { useCan } from '@/lib/permissions'
import { useKeys } from '@/lib/query-keys'
import { toast } from '@/lib/toast'
import { focusFirstInvalid } from '@/lib/validation'
import { cn } from '@/lib/utils'
import { useAllProducts } from './catalog'
import { humanizeSlug, type Marketplace, type Product } from './catalog-model'
import { generateMany, planGenerate } from './generate'
import {
  ATTR_FIELDS,
  emptyGuided,
  errorOrder,
  mapCreateErrors,
  missingCritical,
  SECTIONS,
  sectionOfError,
  sectionStates,
  toProductCreate,
  validateGuided,
  type GuidedErrors,
  type GuidedValues,
  type SectionId,
  type SectionState,
} from './guided-model'
import { serializeListOn } from './list-on'

const DRAFT_PREFIX = 'la.guided-draft.'

function readDraft(key: string): { values: GuidedValues; savedAt: string } | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const d = JSON.parse(raw) as { values?: GuidedValues; savedAt?: string }
    if (!d.values || typeof d.values.sku !== 'string' || !d.savedAt) return null
    return { values: { ...emptyGuided(), ...d.values, attrs: d.values.attrs ?? {}, extra: d.values.extra ?? [] }, savedAt: d.savedAt }
  } catch {
    return null
  }
}

function writeDraft(key: string, values: GuidedValues | null): string | null {
  try {
    if (!values) {
      localStorage.removeItem(key)
      return null
    }
    const savedAt = new Date().toISOString()
    localStorage.setItem(key, JSON.stringify({ values, savedAt }))
    return savedAt
  } catch {
    return null
  }
}

function SectionMark({ state }: { state: SectionState }) {
  if (state.kind === 'missing')
    return (
      <span className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full border border-attention-line bg-attention-bg px-1.5 text-caption font-bold text-attention">
        {state.count}
        <span className="sr-only"> critical facts missing</span>
      </span>
    )
  if (state.kind === 'done')
    return (
      <span className="inline-flex size-[22px] items-center justify-center rounded-full border border-success-line bg-success-bg text-success">
        <Glyph status="live" />
        <span className="sr-only">done</span>
      </span>
    )
  return (
    <span className="inline-flex size-[22px] items-center justify-center rounded-full border border-dashed border-line-strong bg-field text-ink-2 shadow-inset-sm">
      <Glyph status="not-listed" />
      <span className="sr-only">not started</span>
    </span>
  )
}

function TextField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  critical,
  placeholder,
  list,
  autoFocus,
  onBlur,
  submitCount,
  maxLength,
  code,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  error?: string
  hint?: ReactNode
  critical?: boolean
  placeholder?: string
  list?: string
  autoFocus?: boolean
  onBlur?: () => void
  submitCount?: number
  /** Generous on purpose: the error explains the limit instead of silently cutting the paste. */
  maxLength?: number
  /** A code (SKU, category slug): no spell check or auto-capitalisation. */
  code?: boolean
}) {
  const filled = value.trim() !== ''
  return (
    <LaField
      label={label}
      htmlFor={id}
      error={error}
      hint={hint}
      critical={critical}
      needsInput={critical && !filled && !error}
      source={filled ? { kind: 'you' } : undefined}
      submitCount={submitCount}
      confirmFix
    >
      <Input
        id={id}
        name={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        maxLength={maxLength}
        spellCheck={code ? false : undefined}
        autoCapitalize={code ? 'none' : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={fieldHintId(id)}
        placeholder={placeholder}
        list={list}
        autoFocus={autoFocus}
        autoComplete="off"
      />
    </LaField>
  )
}

export function GuidedForm({ listOn }: { listOn: Marketplace[] }) {
  const navigate = useNavigate()
  const keys = useKeys()
  const qc = useQueryClient()
  const can = useCan()
  const { tenantId } = useSession()
  const draftKey = `${DRAFT_PREFIX}${tenantId ?? 'none'}`
  const [initial] = useState(() => readDraft(draftKey))
  const [values, setValues] = useState<GuidedValues>(() => initial?.values ?? emptyGuided())
  const [savedAt, setSavedAt] = useState<string | null>(initial?.savedAt ?? null)
  const [section, setSection] = useState<SectionId>('identity')
  /** Errors from the last save attempt's API response, cleared per field as it is edited. */
  const [serverErrors, setServerErrors] = useState<GuidedErrors>({})
  /** Fields the person has left (blurred): their client errors show from then on. */
  const [touched, setTouched] = useState<ReadonlySet<string>>(() => new Set())
  /** Save attempts: after the first, every client error shows and re-checks on each change. */
  const [submitCount, setSubmitCount] = useState(0)
  /** Bumped to move focus to the first invalid field once its section has rendered. */
  const [focusTick, setFocusTick] = useState(0)
  const bodyRef = useRef<HTMLElement>(null)
  const [formError, setFormError] = useState<unknown>(null)
  const [created, setCreated] = useState<Product | null>(null)
  const [busy, setBusy] = useState<'next' | 'send' | null>(null)
  /**
   * The existing product behind a 409 SKU_CONFLICT. POST /products has no Idempotency-Key, so a
   * retry after a lost response (status 0) answers 409 for the product the first attempt created
   * (backend services/products.py). Linking to it keeps the person from making a second SKU.
   */
  const [conflict, setConflict] = useState<Product | null>(null)

  const products = useAllProducts()
  const categories = useMemo(
    () => [...new Set<string>([...KNOWN_CATEGORIES, ...(products.data?.rows ?? []).map((p) => p.category)])].sort(),
    [products.data],
  )

  // Autosave the unsent draft (debounced) in this browser.
  useEffect(() => {
    if (created) return
    const t = setTimeout(() => {
      const empty = !values.sku && !values.title && !values.category && !Object.values(values.attrs).some(Boolean) && values.extra.length === 0
      setSavedAt(writeDraft(draftKey, empty ? null : values))
    }, 600)
    return () => clearTimeout(t)
  }, [values, draftKey, created])

  // Client errors are re-checked on every change; one shows once its field was left or a save was
  // tried (react-hook-form's onTouched + reValidateMode onChange). Server errors win until edited.
  const clientErrors = useMemo(() => validateGuided(values), [values])
  const errors = useMemo<GuidedErrors>(() => {
    const out: GuidedErrors = {}
    for (const [k, msg] of Object.entries(clientErrors)) if (submitCount > 0 || touched.has(k)) out[k] = msg
    return { ...out, ...serverErrors }
  }, [clientErrors, serverErrors, touched, submitCount])
  const touch = (key: string) => setTouched((t) => (t.has(key) ? t : new Set(t).add(key)))
  useEffect(() => {
    if (focusTick) focusFirstInvalid(bodyRef.current)
  }, [focusTick])

  const states = useMemo(() => sectionStates(values), [values])
  const missing = useMemo(() => missingCritical(values), [values])

  const set = (patch: Partial<GuidedValues>) => {
    if ('sku' in patch) setConflict(null)
    setValues((v) => ({ ...v, ...patch }))
    setServerErrors((e) => {
      const next = { ...e }
      for (const k of Object.keys(patch)) delete next[k]
      return next
    })
  }
  const setAttr = (key: string, val: string) => {
    setValues((v) => ({ ...v, attrs: { ...v.attrs, [key]: val } }))
    setServerErrors((e) => {
      const next = { ...e }
      delete next[`attr.${key}`]
      return next
    })
  }

  const create = useMutation({
    meta: { toast: false },
    mutationFn: (v: GuidedValues) => unwrap(api.POST('/products', { body: toProductCreate(v) })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.products.list() }),
    onError: (err) => {
      if (isApiError(err) && err.status === 0) void qc.invalidateQueries({ queryKey: keys.products.list() })
    },
  })

  /** Validate and create the product once; later actions reuse it. */
  const ensureCreated = async (): Promise<Product | null> => {
    if (created) return created
    setFormError(null)
    setSubmitCount((n) => n + 1)
    const first = errorOrder(Object.keys(validateGuided(values)))[0]
    if (first) {
      setSection(sectionOfError(first))
      setFocusTick((n) => n + 1)
      return null
    }
    try {
      const p = await create.mutateAsync(values)
      setCreated(p)
      writeDraft(draftKey, null)
      setSavedAt(null)
      return p
    } catch (err) {
      if (isApiError(err) && (err.status === 422 || err.status === 409)) {
        if (err.type === 'SKU_CONFLICT') {
          const sku = values.sku.trim()
          const fresh = await products.refetch()
          setConflict(fresh.data?.rows.find((p) => p.sku === sku) ?? null)
        }
        const { fields, unmapped } = mapCreateErrors(err, values)
        setServerErrors(fields)
        const first = errorOrder(Object.keys(fields))[0]
        if (first) {
          setSection(sectionOfError(first))
          setFocusTick((n) => n + 1)
        }
        if (unmapped || !first) setFormError(err)
      } else setFormError(err)
      return null
    }
  }

  const onNext = async () => {
    setBusy('next')
    const p = await ensureCreated()
    setBusy(null)
    if (!p) return
    toast.success('Product saved', { description: `${p.sku} is in your catalog. Add its variants next.` })
    const on = serializeListOn(listOn)
    void navigate({ to: '/add/variants', search: { product: p.id, ...(on ? { on } : {}) } })
  }

  const onSend = async () => {
    setBusy('send')
    const p = await ensureCreated()
    if (!p) {
      setBusy(null)
      return
    }
    if (listOn.length && can('listing:generate')) {
      const plan = planGenerate([p], listOn, () => ({}))
      const out = await generateMany(plan.send)
      const ok = out.filter((o) => o.kind === 'accepted')
      invalidateListingWork(qc, keys, ok.flatMap((o) => (o.kind === 'accepted' && o.accepted.listing_id ? [o.accepted.listing_id] : [])))
      const failed = out.filter((o) => o.kind === 'failed')
      if (failed.length) {
        toast.error(`Saved, but ${failed.length === 1 ? 'one draft' : `${failed.length} drafts`} did not start`, {
          description: failed.map((f) => (f.kind === 'failed' ? f.message : '')).join(' '),
        })
      } else {
        toast.success('Sent to the agent', { description: `Drafting ${p.sku} for ${ok.length} ${ok.length === 1 ? 'marketplace' : 'marketplaces'}.` })
      }
    } else {
      toast.success('Product saved', {
        description: listOn.length ? 'Your role can’t start drafts. An owner or operator can.' : 'No marketplace was chosen, so no draft was started.',
      })
    }
    setBusy(null)
    void navigate({ to: '/products/$productId', params: { productId: p.id } })
  }

  const sectionLabel = SECTIONS.find((s) => s.id === section)!.label
  const idx = SECTIONS.findIndex((s) => s.id === section)
  const isPending = busy !== null

  const body = (() => {
    switch (section) {
      case 'identity':
        return (
          <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
            <TextField
              id="g-sku"
              label="SKU"
              value={values.sku}
              onChange={(sku) => set({ sku })}
              onBlur={() => touch('sku')}
              error={errors.sku}
              hint="Your seller SKU. Unique in this brand, no spaces."
              submitCount={submitCount}
              maxLength={SKU_MAX + 8}
              code
              autoFocus
            />
            <TextField
              id="g-title"
              label="Product name"
              value={values.title}
              onChange={(title) => set({ title })}
              onBlur={() => touch('title')}
              error={errors.title}
              hint="What you call it. The agent writes marketplace titles."
              submitCount={submitCount}
              maxLength={TITLE_MAX * 2}
            />
          </div>
        )
      case 'category':
        return (
          <div className="flex flex-col gap-4">
            <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
              <TextField
                id="g-category"
                label="Category"
                value={values.category}
                onChange={(category) => set({ category })}
                onBlur={() => touch('category')}
                error={errors.category}
                submitCount={submitCount}
                maxLength={64 + 8}
                code
                hint="The catalog category, for example ethnic_wear_kurta_sets."
                list="g-category-list"
              />
            </div>
            <datalist id="g-category-list">
              {categories.map((c) => (
                <option key={c} value={c}>
                  {humanizeSlug(c)}
                </option>
              ))}
            </datalist>
          </div>
        )
      case 'attributes':
      case 'care':
        return (
          <div className="flex flex-col gap-4">
            {section === 'care' ? (
              <Banner tone="info" icon="spark">
                Manufacturer, origin and consumer care come from your brand profile unless a product sets its own.{' '}
                <SourceBadge source={{ kind: 'brand-profile' }} />
              </Banner>
            ) : null}
            <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
              {ATTR_FIELDS.filter((f) => f.section === section).map((f) => (
                <TextField
                  key={f.key}
                  id={`g-attr-${f.key}`}
                  label={f.label}
                  critical={f.critical}
                  value={values.attrs[f.key] ?? ''}
                  onChange={(v) => setAttr(f.key, v)}
                  onBlur={() => touch(`attr.${f.key}`)}
                  error={errors[`attr.${f.key}`]}
                  submitCount={submitCount}
                  maxLength={ATTRIBUTE_TEXT_MAX * 2}
                  hint={f.hint}
                />
              ))}
            </div>
            {section === 'attributes' ? <ExtraAttributes values={values} setValues={setValues} errors={errors} touch={touch} submitCount={submitCount} /> : null}
            <p className="text-caption text-ink-3">★ Critical facts can block a listing. The agent never fills them.</p>
          </div>
        )
      case 'variants':
      case 'media':
        return (
          <LaCard>
            <p className="text-body text-ink">
              {section === 'variants'
                ? 'Sizes, colours and per-variant prices are set on the next step, once this product is saved.'
                : 'Images are uploaded on the next step, once this product is saved, and checked against each marketplace’s rules.'}
            </p>
            <Button className="mt-3" variant="secondary" onClick={() => void onNext()} disabled={isPending}>
              Save and go to variants and media
            </Button>
          </LaCard>
        )
      case 'price':
        return (
          <LaCard>
            <p className="text-body text-ink">MRP and selling price are set per variant on the next step.</p>
            <p className="mt-1 text-small text-ink-2">
              A single product without sizes or colours gets its price from a spreadsheet upload of its SKU. The form cannot store prices yet.
            </p>
          </LaCard>
        )
    }
  })()

  return (
    <div className="flex min-h-[calc(100svh-56px)] flex-col">
      <div className="grid flex-1 grid-cols-1 content-start lg:grid-cols-[190px_minmax(0,1fr)_290px] lg:content-stretch">
        <nav aria-label="Sections" className="border-b border-line bg-canvas px-3.5 py-4 lg:border-r lg:border-b-0 lg:py-6">
          <h2 className="mb-2 px-2.5 font-display text-[15px] font-bold text-ink">Sections</h2>
          <ul className="relative flex gap-0.5 overflow-x-auto lg:flex-col">
            {SECTIONS.map((s) => (
              <li key={s.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setSection(s.id)}
                  aria-current={s.id === section ? 'step' : undefined}
                  className={cn(
                    'focus-ring tactile flex h-10 w-full items-center justify-between gap-3 rounded-lg border px-2.5 text-left text-body text-ink active:shadow-pressed',
                    s.id === section ? 'border-line bg-surface font-bold text-brand shadow-raised-sm' : 'border-transparent hover:bg-hover',
                  )}
                >
                  {s.label}
                  <SectionMark state={states[s.id]} />
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <section ref={bodyRef} aria-labelledby="g-heading" className="flex min-w-0 flex-col gap-5 px-4 py-6 md:px-7">
          <div>
            <h1 id="g-heading" className="truncate font-display text-h1 text-ink">
              {values.title.trim() || 'New product'}
            </h1>
            <p className="mt-1 text-body text-ink-2">
              {[values.sku.trim(), values.category.trim() ? humanizeSlug(values.category.trim()) : null, sectionLabel].filter(Boolean).join(' · ')}
            </p>
          </div>
          {created ? (
            <Banner tone="success" role="status" title="Saved">
              {created.sku} is in your catalog.{' '}
              <Link to="/products/$productId" params={{ productId: created.id }} className="font-semibold underline">
                Open it
              </Link>
            </Banner>
          ) : null}
          {conflict && !created ? (
            <div data-testid="sku-conflict">
            <Banner tone="attention" role="status" title={`${conflict.sku} is already in your catalog`}>
              {conflict.title === values.title.trim()
                ? 'If you saved it a moment ago and the connection dropped, it did go through. '
                : 'Use a different SKU for a new product, or open the existing one. '}
              <Link to="/products/$productId" params={{ productId: conflict.id }} className="font-semibold underline">
                Open {conflict.sku}
              </Link>
              {conflict.title === values.title.trim() ? (
                <>
                  {' · '}
                  <button
                    type="button"
                    className="focus-ring rounded font-semibold underline"
                    onClick={() => {
                      setCreated(conflict)
                      setConflict(null)
                      setServerErrors({})
                      writeDraft(draftKey, null)
                      setSavedAt(null)
                    }}
                  >
                    Continue with it
                  </button>
                </>
              ) : null}
            </Banner>
            </div>
          ) : null}
          {formError ? (
            <Banner tone="danger" role="alert" title="Couldn’t save this product">
              {isApiError(formError) && formError.status === 0
                ? 'Can’t reach the server. Your draft is kept in this browser; try again.'
                : isApiError(formError)
                  ? formError.message
                  : 'Something went wrong. Try again.'}
              {isApiError(formError) ? <ReferenceId id={formError.correlationId} className="mt-1" /> : null}
            </Banner>
          ) : null}
          {body}
        </section>

        <aside aria-label="Agent's understanding" className="flex flex-col gap-3 border-t border-line bg-canvas px-4 py-6 lg:border-t-0 lg:border-l">
          <h2 className="font-display text-[15px] font-bold text-ink">Agent’s understanding</h2>
          <LaCard pad="sm">
            <div className="flex items-start justify-between gap-2">
              <p className="text-caption text-ink-2">Category</p>
              <ComingSoon />
            </div>
            <h3 className="mt-1 text-h3 text-ink">{values.category.trim() ? humanizeSlug(values.category.trim()) : 'Not chosen yet'}</h3>
            <p className="mt-1 text-caption text-ink-2">Classification by the agent is coming soon. Choose the category yourself for now.</p>
          </LaCard>
          {missing.length ? (
            <AttentionCard pad="sm">
              <b className="text-ink">
                {missing.length} critical {missing.length === 1 ? 'fact' : 'facts'} missing
              </b>
              <p className="mt-0.5 text-small text-attention-ink">{missing.join(', ')}</p>
            </AttentionCard>
          ) : (
            <LaCard pad="sm" emphasis="success">
              <b className="text-ink">Critical facts filled</b>
              <p className="mt-0.5 text-small text-success-ink">The agent will not guess any of them.</p>
            </LaCard>
          )}
          <LaCard pad="sm">
            <h3 className="font-display text-[15px] font-bold text-ink">Ready to list on</h3>
            {listOn.length ? (
              <ul className="mt-3 flex flex-col gap-2.5">
                {listOn.map((m) => (
                  <li key={m} className="flex items-center justify-between gap-2 text-small">
                    <MarketplaceName id={m} size="sm" />
                    <StatusChip status="draft">Not checked</StatusChip>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-small text-ink-2">
                No marketplace chosen.{' '}
                <Link to="/add" className="font-semibold text-brand hover:underline">
                  Choose on the previous step
                </Link>
                .
              </p>
            )}
            <p className="mt-3 text-caption text-ink-3">Readiness is checked against each marketplace’s rules once the agent drafts the listing.</p>
          </LaCard>
        </aside>
      </div>

      <FooterBar status={created ? `Saved ${format(new Date(created.created_at), 'HH:mm')}` : savedAt ? `Draft kept in this browser ${format(new Date(savedAt), 'HH:mm')}` : 'Nothing is saved yet.'}>
        <Button
          variant="ghost"
          disabled={isPending}
          onClick={() => {
            if (idx > 0) setSection(SECTIONS[idx - 1]!.id)
            else void navigate({ to: '/add' })
          }}
        >
          Back
        </Button>
        <Button variant="secondary" disabled={isPending} onClick={() => void onNext()} data-testid="guided-next">
          {busy === 'next' ? <Spinner data-icon="inline-start" /> : null}
          Next: Variants
        </Button>
        <Button disabled={isPending} onClick={() => void onSend()} data-testid="guided-send">
          {busy === 'send' ? <Spinner data-icon="inline-start" /> : null}
          {listOn.length ? 'Send to agent now' : 'Save product'}
        </Button>
      </FooterBar>
    </div>
  )
}

function ExtraAttributes({
  values,
  setValues,
  errors,
  touch,
  submitCount,
}: {
  values: GuidedValues
  setValues: (fn: (v: GuidedValues) => GuidedValues) => void
  errors: GuidedErrors
  touch: (key: string) => void
  submitCount: number
}) {
  const update = (i: number, patch: Partial<{ key: string; value: string }>) =>
    setValues((v) => ({ ...v, extra: v.extra.map((x, j) => (j === i ? { ...x, ...patch } : x)) }))
  const formKeys = new Set(ATTR_FIELDS.map((f) => f.key))
  const options = ATTRIBUTE_KEY_SUGGESTIONS.filter((k) => !formKeys.has(k) && k !== 'material')
  return (
    <div className="flex flex-col gap-3">
      {values.extra.map((x, i) => (
        <div key={i} className="grid items-start gap-x-5 gap-y-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <LaField label={`Attribute ${i + 1}`} htmlFor={`g-extra-${i}-key`} error={errors[`extra.${i}.key`]} submitCount={submitCount} confirmFix>
            <Input
              id={`g-extra-${i}-key`}
              name={`g-extra-${i}-key`}
              value={x.key}
              list="g-extra-keys"
              placeholder="for example occasion"
              autoComplete="off"
              spellCheck={false}
              autoCapitalize="none"
              maxLength={64 + 8}
              onChange={(e) => update(i, { key: e.target.value })}
              onBlur={() => touch(`extra.${i}.key`)}
              aria-invalid={errors[`extra.${i}.key`] ? true : undefined}
              aria-describedby={fieldHintId(`g-extra-${i}-key`)}
            />
          </LaField>
          <LaField label="Value" htmlFor={`g-extra-${i}-value`} error={errors[`extra.${i}.value`]} source={x.value.trim() ? { kind: 'you' } : undefined} submitCount={submitCount} confirmFix>
            <Input
              id={`g-extra-${i}-value`}
              name={`g-extra-${i}-value`}
              value={x.value}
              autoComplete="off"
              maxLength={ATTRIBUTE_TEXT_MAX * 2}
              onChange={(e) => update(i, { value: e.target.value })}
              onBlur={() => touch(`extra.${i}.value`)}
              aria-invalid={errors[`extra.${i}.value`] ? true : undefined}
              aria-describedby={fieldHintId(`g-extra-${i}-value`)}
            />
          </LaField>
          <Button
            variant="ghost"
            size="icon"
            className="md:mt-[22px]"
            aria-label={`Remove attribute ${i + 1}`}
            onClick={() => setValues((v) => ({ ...v, extra: v.extra.filter((_, j) => j !== i) }))}
          >
            <Icon name="x" size={16} />
          </Button>
        </div>
      ))}
      <datalist id="g-extra-keys">
        {options.map((k) => (
          <option key={k} value={k} />
        ))}
      </datalist>
      <div>
        <Button variant="secondary" size="sm" onClick={() => setValues((v) => ({ ...v, extra: [...v.extra, { key: '', value: '' }] }))}>
          <Icon name="plus" size={14} />
          Add another attribute
        </Button>
      </div>
    </div>
  )
}
