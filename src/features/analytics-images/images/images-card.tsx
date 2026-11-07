import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useDropzone, type FileRejection } from 'react-dropzone'
import { api, unwrap } from '@/api/client'
import { describeError, isApiError, isNotFound } from '@/api/errors'
import { newIdempotencyKey } from '@/api/idempotency'
import { Icon, type IconName } from '@/components/la/icons'
import { MarketplaceTile } from '@/components/la/marketplace'
import { ErrorState } from '@/components/states/error-state'
import { ReferenceId } from '@/components/states/reference-id'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { BUILT } from '@/api/capabilities'
import { useCapability, useCapabilityProbe } from '@/hooks/use-capabilities'
import { useJobPolling } from '@/hooks/use-job-polling'
import { MARKETPLACE_META } from '@/features/marketplaces/meta'
import { useDeleteImage } from '@/features/products/api'
import { useKeys } from '@/lib/query-keys'
import { OP_ACTION, useCan } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import {
  checkRows,
  defaultSlot,
  formatBytes,
  IMAGE_CONTENT_TYPES,
  imageIdFromKey,
  marketplaceReports,
  MAX_IMAGE_BYTES,
  SLOT_LABEL,
  slotsFor,
  tally,
  validateImageFile,
  type CheckOutcome,
  type ImageReport,
  type ImageSlot,
  type UploadStage,
} from './report'
import { ALL_COLOURS, colourGroups, colourHasMain, type ColourGroup, type ColourSource } from './colour-groups'
import { uploadImage } from './upload'

interface ProductLike extends ColourSource {
  id: string
  images?: string[]
  parent_product_id?: string | null
}

interface SessionUpload {
  localId: string
  file: File
  previewUrl: string
  slot: ImageSlot
  /** The colour it is filed under, or null for every colour. */
  colourwayId: string | null
  multipartKey: string
  stage: UploadStage
}

/** One image's compliance report. Shared by the card (to land badges together) and each row. */
function reportQuery(keys: ReturnType<typeof useKeys>, imageId: string, live: boolean) {
  return {
    queryKey: keys.images.report(imageId),
    queryFn: () => unwrap(api.GET('/images/{image_id}/report', { params: { path: { image_id: imageId } } })),
    enabled: live,
    staleTime: 30_000,
  }
}

/** Images card on product detail: drop-to-upload plus each image's compliance report. */
export function ProductImagesCard({ product }: { product: ProductLike }) {
  const keys = useKeys()
  const qc = useQueryClient()
  const can = useCan()
  const live = useCapability('images')
  // Until the capability probe answers we do not know whether uploads are open: hold the drop
  // zone's place instead of flashing "No images yet" and then the drop zone.
  const probe = useCapabilityProbe({ enabled: BUILT.images })
  const capPending = BUILT.images && probe.isPending
  const canUpload = live && can(OP_ACTION['POST /images/upload']) && can(OP_ACTION['POST /images/upload-url'])
  const listed = product.images ?? []
  const slots = slotsFor(!!product.parent_product_id)
  const [slot, setSlot] = useState<ImageSlot>(defaultSlot(listed.length))
  const [uploads, setUploads] = useState<SessionUpload[]>([])
  // Per-colour photos: only a style with colourways offers the choice. A size chart is the style's.
  const groups = colourGroups(product)
  const byColour = (product.colourways ?? []).length > 0
  const [colour, setColour] = useState<string>(ALL_COLOURS)
  const colourwayId = byColour && slot !== 'size_chart' && colour !== ALL_COLOURS ? colour : null

  // Object URLs live as long as the card.
  const urls = useRef(new Set<string>())
  useEffect(() => {
    const set = urls.current
    return () => set.forEach((u) => URL.revokeObjectURL(u))
  }, [])

  const patch = (localId: string, next: Partial<SessionUpload>) =>
    setUploads((list) => list.map((u) => (u.localId === localId ? { ...u, ...next } : u)))

  const mutation = useMutation({ meta: { toast: false }, mutationFn: uploadImage })
  const del = useDeleteImage(product.id)
  const canDelete = live && can(OP_ACTION['DELETE /images/{image_id}'])
  const onDelete = async (imageId: string) => {
    await del.mutateAsync(imageId)
    setUploads((list) => list.filter((u) => !(u.stage.kind === 'accepted' && u.stage.imageId === imageId)))
  }

  const start = (u: SessionUpload) => {
    patch(u.localId, { stage: { kind: 'uploading' } })
    mutation
      .mutateAsync({ file: u.file, productId: product.id, slot: u.slot, colourwayId: u.colourwayId, multipartKey: u.multipartKey })
      .then((res) => {
        patch(u.localId, { stage: { kind: 'accepted', imageId: res.image_id, jobId: res.job_id } })
        void qc.invalidateQueries({ queryKey: keys.products.detail(product.id) })
        void qc.invalidateQueries({ queryKey: keys.images.report(res.image_id) })
      })
      .catch((error: unknown) => {
        // A reused key with a different body is a client bug: the next retry gets a fresh key.
        if (isApiError(error) && error.type === 'IDEMPOTENCY_KEY_REUSED') patch(u.localId, { multipartKey: newIdempotencyKey() })
        patch(u.localId, { stage: { kind: 'failed', error } })
      })
  }

  const add = (files: File[], rejected: FileRejection[]) => {
    const all = [...files, ...rejected.map((r) => r.file)]
    // One main image per product: a second main would replace the first straight away.
    const take = slot === 'main' ? all.slice(0, 1) : all
    const created = take.map((file): SessionUpload => {
      const previewUrl = URL.createObjectURL(file)
      urls.current.add(previewUrl)
      const problem = validateImageFile(file)
      return {
        localId: newIdempotencyKey(),
        file,
        previewUrl,
        slot,
        colourwayId,
        multipartKey: newIdempotencyKey(),
        stage: problem ? { kind: 'invalid', message: problem } : { kind: 'uploading' },
      }
    })
    setUploads((list) => [...created, ...list])
    created.filter((u) => u.stage.kind === 'uploading').forEach(start)
    if (slot === 'main' && created.some((u) => u.stage.kind !== 'invalid')) setSlot('secondary')
  }

  const dismiss = (localId: string) => setUploads((list) => list.filter((u) => u.localId !== localId))

  const listedIds = new Set(listed.map(imageIdFromKey).filter((x): x is string => !!x))
  const sessionById = new Map<string, SessionUpload>()
  for (const u of uploads) if (u.stage.kind === 'accepted') sessionById.set(u.stage.imageId, u)
  const notYetListed = uploads.filter((u) => u.stage.kind === 'accepted' && !listedIds.has(u.stage.imageId))
  const inFlight = uploads.filter((u) => u.stage.kind !== 'accepted')
  const count = listed.length + notYetListed.length

  // Every listed image's report, read here too (same key and fetcher as the rows, so one request
  // each): the rows' badges stay placeholders until all have answered, then land together.
  const rowIds = [
    ...notYetListed.flatMap((u) => (u.stage.kind === 'accepted' ? [u.stage.imageId] : [])),
    ...listed.map(imageIdFromKey).filter((x): x is string => !!x),
  ]
  const reportsQ = useQueries({ queries: rowIds.map((id) => reportQuery(keys, id, live)) })
  const reportsSettled = !live || reportsQ.every((r) => !r.isPending)

  const listedRow = (key: string) => {
    const id = imageIdFromKey(key)
    return id ? (
      <ImageRow
        key={key}
        imageId={id}
        storageKey={key}
        upload={sessionById.get(id)}
        live={live}
        productId={product.id}
        settled={reportsSettled}
        onDelete={canDelete ? onDelete : undefined}
      />
    ) : (
      <li key={key} className="truncate px-5 py-3 font-mono text-xs text-muted-foreground" title={key}>
        {key}
      </li>
    )
  }

  return (
    <Card className="gap-0 py-0" data-testid="product-images">
      <CardHeader className="flex h-12 flex-row items-center justify-between gap-3 border-b py-0 [.border-b]:pb-0">
        <CardTitle>Images</CardTitle>
        {count ? <span className="text-xs text-muted-foreground tabular-nums">{count}</span> : null}
      </CardHeader>

      {capPending ? (
        <div className="flex flex-col gap-3 p-4 sm:p-5" aria-busy="true" aria-label="Loading uploads">
          <Skeleton className="h-9 w-40 rounded-control" />
          <Skeleton className="min-h-28 rounded-lg" />
        </div>
      ) : canUpload ? (
        <Dropzone
          slot={slot}
          slots={slots}
          onSlot={setSlot}
          onFiles={add}
          hasMain={byColour ? colourHasMain(product, colourwayId) : count > 0}
          colours={byColour && slot !== 'size_chart' ? groups.filter((g) => g.key !== 'other') : null}
          colour={colour}
          onColour={setColour}
        />
      ) : null}

      {inFlight.length ? (
        <ul className="divide-y divide-border/70 border-t" aria-label="Uploads">
          {inFlight.map((u) => (
            <UploadRow key={u.localId} upload={u} onRetry={() => start(u)} onDismiss={() => dismiss(u.localId)} />
          ))}
        </ul>
      ) : null}

      {count === 0 && !canUpload && !capPending && inFlight.length === 0 ? (
        <div className="flex items-center gap-3 px-5 py-4 text-sm text-muted-foreground" data-testid="no-images">
          <Icon name="image" size={16} />
          <span>No images yet. Owners and operators can upload them here.</span>
        </div>
      ) : null}

      {byColour && (count > 0 || canUpload) ? (
        <div className="border-t" data-testid="image-list">
          {groups.map((g) => {
            const fresh = notYetListed.filter((u) => (u.colourwayId ?? ALL_COLOURS) === g.key)
            if (g.key === 'other' && !g.keys.length) return null
            return (
              <ColourSection key={g.key} group={g} count={g.keys.length + fresh.length}>
                {fresh.map((u) =>
                  u.stage.kind === 'accepted' ? (
                    <ImageRow key={u.stage.imageId} imageId={u.stage.imageId} upload={u} live={live} productId={product.id} settled={reportsSettled} onDelete={canDelete ? onDelete : undefined} />
                  ) : null,
                )}
                {g.keys.map((key) => listedRow(key))}
              </ColourSection>
            )
          })}
        </div>
      ) : count > 0 ? (
        <ul className="divide-y divide-border/70 border-t" aria-label="Product images" data-testid="image-list">
          {notYetListed.map((u) =>
            u.stage.kind === 'accepted' ? (
              <ImageRow key={u.stage.imageId} imageId={u.stage.imageId} upload={u} live={live} productId={product.id} settled={reportsSettled} onDelete={canDelete ? onDelete : undefined} />
            ) : null,
          )}
          {listed.map((key) => listedRow(key))}
        </ul>
      ) : null}
    </Card>
  )
}

/** One colour's images: a quiet heading with its count, then its rows (or a one-line empty note). */
function ColourSection({ group, count, children }: { group: ColourGroup; count: number; children: ReactNode }) {
  const empty = count === 0
  return (
    <section aria-label={`${group.label} images`} data-testid="colour-group" data-colour={group.key} className="border-b border-border/70 last:border-b-0">
      <header className="flex items-center justify-between gap-3 bg-sunken px-5 py-2">
        <h3 className="truncate font-sans text-small font-semibold text-ink">{group.label}</h3>
        <span className="text-caption text-ink-3 tabular-nums">
          {empty ? (group.colourwayId ? 'No photos yet' : 'None') : `${count} ${count === 1 ? 'image' : 'images'}`}
        </span>
      </header>
      {empty ? (
        <p className="px-5 py-3 text-small text-ink-2">
          {group.colourwayId ? 'Uses the photos for all colours until you add its own.' : 'Photos here show for every colour.'}
        </p>
      ) : (
        <ul className="divide-y divide-border/70">{children}</ul>
      )}
    </section>
  )
}

/* ---------------------------------------------------------------- Dropzone */

function Dropzone({
  slot,
  slots,
  onSlot,
  onFiles,
  hasMain,
  colours,
  colour,
  onColour,
}: {
  slot: ImageSlot
  slots: readonly ImageSlot[]
  onSlot: (s: ImageSlot) => void
  onFiles: (files: File[], rejected: FileRejection[]) => void
  /** The chosen colour (or the product) already has a main image. */
  hasMain: boolean
  /** The colours to file the upload under; null when the product has none. */
  colours: readonly ColourGroup[] | null
  colour: string
  onColour: (key: string) => void
}) {
  const colourName = colours?.find((g) => g.key === colour)?.label
  const dz = useDropzone({
    onDrop: onFiles,
    multiple: slot !== 'main',
    accept: Object.fromEntries(IMAGE_CONTENT_TYPES.map((t) => [t, []])),
    maxSize: MAX_IMAGE_BYTES,
  })
  const dragging = dz.isDragActive
  return (
    <div className="flex flex-col gap-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {colours ? (
            <label className="flex items-center gap-2 text-[0.8125rem] text-muted-foreground">
              Colour
              <Select value={colour} onValueChange={(v) => onColour(colours.find((g) => g.key === v)?.key ?? colour)}>
                <SelectTrigger size="sm" className="w-40" aria-label="Image colour" data-testid="image-colour">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {colours.map((g) => (
                    <SelectItem key={g.key} value={g.key}>
                      {g.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          ) : null}
          <label className="flex items-center gap-2 text-[0.8125rem] text-muted-foreground">
            Upload as
            <Select value={slot} onValueChange={(v) => onSlot(slots.find((s) => s === v) ?? slot)}>
              <SelectTrigger size="sm" className="w-40" aria-label="Image slot" data-testid="image-slot">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {slots.map((s) => (
                  <SelectItem key={s} value={s}>
                    {SLOT_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>
        <span className="text-xs text-muted-foreground">
          {slot === 'main' && hasMain
            ? colours && colour !== ALL_COLOURS
              ? `A new main image replaces the current one for ${colourName ?? 'this colour'}.`
              : 'A new main image replaces the current one.'
            : 'JPEG, PNG or WebP, up to 10 MB each.'}
        </span>
      </div>
      <div
        {...dz.getRootProps({
          className: cn(
            'group flex min-h-28 cursor-pointer items-center justify-center gap-3 rounded-lg border-[1.5px] border-dashed border-foreground/15 bg-muted/40 px-4 py-5 text-center outline-none',
            'transition-[border-color,background-color,box-shadow] duration-150 hover:border-foreground/30 hover:bg-muted/70',
            'focus-visible:border-brand focus-visible:ring-[3px] focus-visible:ring-brand/20',
            dragging && 'border-brand bg-brand-soft hover:border-brand hover:bg-brand-soft',
          ),
          'aria-label': 'Image drop zone',
        })}
        data-testid="image-dropzone"
        data-drag-active={dragging || undefined}
      >
        <input {...dz.getInputProps({ 'aria-label': 'Image files' })} />
        <div
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-xl bg-card text-muted-foreground shadow-elev-2 ring-1 ring-border transition-[color,transform] duration-150 group-hover:text-foreground',
            dragging && '-translate-y-0.5 text-brand group-hover:text-brand',
          )}
        >
          <Icon name="upload" size={18} />
        </div>
        <div className="text-left">
          <p className="text-sm font-medium">
            {dragging ? (
              `Drop to upload as ${SLOT_LABEL[slot].toLowerCase()}${colours && colourName && slot !== 'size_chart' ? ` for ${colourName === 'All colours' ? 'all colours' : colourName}` : ''}`
            ) : (
              <>
                Drag {slot === 'main' ? 'an image' : 'images'} here, or <span className="text-brand">click to choose</span>
              </>
            )}
          </p>
          <p className="text-xs text-muted-foreground">Each image is checked against Amazon and Flipkart image rules.</p>
        </div>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- Rows */

function Thumb({ src, alt }: { src?: string; alt: string }) {
  const [loaded, setLoaded] = useState(false)
  return src ? (
    <img
      src={src}
      alt={alt}
      width={40}
      height={40}
      onLoad={() => setLoaded(true)}
      onError={() => setLoaded(true)}
      className={cn(
        'size-10 shrink-0 rounded-md bg-muted object-cover ring-1 ring-border transition-opacity duration-200 motion-reduce:transition-none',
        loaded ? 'opacity-100' : 'opacity-0',
      )}
    />
  ) : (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground ring-1 ring-border">
      <Icon name="image" size={16} />
    </span>
  )
}

function UploadRow({ upload, onRetry, onDismiss }: { upload: SessionUpload; onRetry: () => void; onDismiss: () => void }) {
  const { stage, file } = upload
  const err = stage.kind === 'failed' ? stage.error : null
  return (
    <li className="flex items-center gap-3 px-5 py-3" data-testid="image-upload" data-stage={stage.kind}>
      <Thumb src={stage.kind === 'invalid' ? undefined : upload.previewUrl} alt="" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={file.name}>
          {file.name}
        </p>
        <p
          className={cn('truncate text-xs tabular-nums', stage.kind === 'uploading' ? 'text-muted-foreground' : 'text-destructive')}
          role={stage.kind === 'uploading' ? 'status' : 'alert'}
        >
          {SLOT_LABEL[upload.slot]} · {formatBytes(file.size)} ·{' '}
          {stage.kind === 'invalid' ? stage.message : stage.kind === 'failed' ? describeError(err) : 'Uploading…'}
        </p>
        {isApiError(err) && err.correlationId ? <ReferenceId id={err.correlationId} className="mt-0.5" /> : null}
      </div>
      {stage.kind === 'uploading' ? (
        <Skeleton className="h-1.5 w-16 rounded-full" />
      ) : (
        <div className="flex shrink-0 items-center gap-1">
          {stage.kind === 'failed' ? (
            <Button variant="outline" size="sm" onClick={onRetry}>
              <Icon name="refresh" size={16} data-icon="inline-start" />
              Retry
            </Button>
          ) : null}
          <Button variant="ghost" size="icon-sm" aria-label={`Dismiss ${file.name}`} onClick={onDismiss}>
            <Icon name="x" size={16} />
          </Button>
        </div>
      )}
    </li>
  )
}

function ImageRow({
  imageId,
  storageKey,
  upload,
  live,
  productId,
  settled = true,
  onDelete,
}: {
  imageId: string
  storageKey?: string
  upload?: SessionUpload
  live: boolean
  productId: string
  /** Every row's report has answered (the card waits, so badges land together). */
  settled?: boolean
  /** DELETE /images/{id}; absent when the person may not delete. */
  onDelete?: (imageId: string) => Promise<void>
}) {
  const keys = useKeys()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<unknown>(null)
  const remove = async () => {
    if (!onDelete) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await onDelete(imageId)
    } catch (err) {
      setDeleteError(err)
      setDeleting(false)
    }
  }
  const report = useQuery(reportQuery(keys, imageId, live))
  const jobId = upload?.stage.kind === 'accepted' ? upload.stage.jobId : null
  const polling = useJobPolling(report.data?.compliance_status === 'pending' ? jobId : null, {
    onTerminal: () => {
      void qc.invalidateQueries({ queryKey: keys.images.report(imageId) })
      void qc.invalidateQueries({ queryKey: keys.products.detail(productId) })
    },
  })
  const reports = report.data ? marketplaceReports(report.data) : []
  const slot = reports[0]?.slot ?? upload?.slot
  const title = slot ? SLOT_LABEL[slot] : 'Image'

  return (
    <li data-testid="image-row" data-image-id={imageId} data-compliance={report.data?.compliance_status}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex min-h-16 items-center gap-3 px-5 py-3">
          <Thumb src={upload?.previewUrl} alt={upload ? `${title} image ${upload.file.name}` : ''} />
          <div className="min-w-0 flex-1">
            {report.isPending && live && !slot ? (
              <Skeleton className="my-0.5 h-4 w-24" />
            ) : (
              <p className="truncate text-sm font-medium">{title}</p>
            )}
            <p className="truncate font-mono text-xs text-muted-foreground" title={storageKey ?? imageId}>
              {imageId}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {live && (report.isPending || !settled) ? (
              <Skeleton className="h-[22px] w-24 rounded-full" />
            ) : report.error ? (
              isNotFound(report.error) ? (
                <Badge variant="muted">Replaced</Badge>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => void report.refetch()} title={describeError(report.error)}>
                  <Icon name="alert" size={16} data-icon="inline-start" className="text-destructive" />
                  Retry report
                </Button>
              )
            ) : report.data ? (
              <ComplianceBadge
                status={report.data.compliance_status}
                jobStatus={polling.job?.status}
                jobKnown={!!jobId}
              />
            ) : null}
            {reports.length ? (
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={open ? 'Hide report' : 'Show report'} data-testid="image-report-toggle">
                  <Icon name="chev" size={16} className={cn('transition-transform duration-150 motion-reduce:transition-none', open && 'rotate-180')} />
                </Button>
              </CollapsibleTrigger>
            ) : report.data?.compliance_status === 'pending' && !jobId ? (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Check for results"
                title="Check for results"
                disabled={report.isFetching}
                onClick={() => void report.refetch()}
              >
                <Icon name="refresh" size={16} className={cn(report.isFetching && 'motion-safe:animate-spin')} />
              </Button>
            ) : null}
            {onDelete && !confirm ? (
              <Button variant="ghost" size="icon-sm" aria-label={`Delete ${title.toLowerCase()} image`} onClick={() => setConfirm(true)} data-testid="image-delete">
                <Icon name="trash" size={16} />
              </Button>
            ) : null}
          </div>
        </div>
        {confirm ? (
          <div className="mx-5 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-tile border border-danger-line bg-danger-bg px-3 py-2" role="alert">
            <p className="text-small text-ink">
              {deleteError ? describeError(deleteError) : 'Delete this image? A marketplace that already has it keeps its own copy.'}
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirm(false)} disabled={deleting}>
                Keep
              </Button>
              <Button variant="danger" size="sm" onClick={() => void remove()} disabled={deleting} data-testid="image-delete-confirm">
                {deleting ? 'Deleting…' : 'Delete'}
              </Button>
            </div>
          </div>
        ) : null}
        {report.error && !isNotFound(report.error) && open ? (
          <ErrorState error={report.error} compact onRetry={() => void report.refetch()} />
        ) : null}
        <CollapsibleContent>
          <div className="grid gap-3 px-5 pb-4 md:grid-cols-2" data-testid="image-report">
            {reports.map((r) => (
              <MarketplaceReport key={r.marketplace} report={r} />
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </li>
  )
}

function Dot() {
  return <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
}

function ComplianceBadge({
  status,
  jobStatus,
  jobKnown,
}: {
  status: 'pending' | 'passed' | 'failed'
  jobStatus: string | undefined
  jobKnown: boolean
}) {
  if (status === 'passed')
    return (
      <Badge variant="success" data-testid="compliance-badge">
        <Dot /> Passed
      </Badge>
    )
  if (status === 'failed')
    return (
      <Badge variant="danger" data-testid="compliance-badge">
        <Dot /> Failed
      </Badge>
    )
  if (jobKnown && jobStatus === 'running')
    return (
      <Badge variant="brand" data-testid="compliance-badge">
        <Dot /> Checking…
      </Badge>
    )
  if (jobKnown && (jobStatus === 'failed' || jobStatus === 'dead_letter'))
    return (
      <Badge variant="danger" data-testid="compliance-badge">
        <Dot /> Check failed
      </Badge>
    )
  if (jobKnown && jobStatus === 'cancelled')
    return (
      <Badge variant="muted" data-testid="compliance-badge">
        <Dot /> Check cancelled
      </Badge>
    )
  return (
    <Badge variant="muted" data-testid="compliance-badge" title="Compliance checks run in the background.">
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current motion-safe:animate-pulse" />
      Queued: processing starts soon
    </Badge>
  )
}

const OUTCOME_META: Record<CheckOutcome, { icon: IconName; className: string; label: string }> = {
  pass: { icon: 'check', className: 'text-success', label: 'Pass' },
  warn: { icon: 'alert', className: 'text-warning', label: 'Warning' },
  fail: { icon: 'x', className: 'text-destructive', label: 'Fail' },
}

function MarketplaceReport({ report }: { report: ImageReport }) {
  const meta = MARKETPLACE_META[report.marketplace]
  const rows = checkRows(report)
  const t = tally(rows)
  return (
    <section
      className="flex flex-col overflow-hidden rounded-lg ring-1 ring-border"
      aria-label={`${meta.short} report`}
      data-marketplace={report.marketplace}
    >
      <header className="flex h-11 items-center justify-between gap-2 border-b bg-muted/40 px-3">
        <span className="flex items-center gap-2 text-sm font-medium">
          <MarketplaceTile id={report.marketplace} size="xs" className="shadow-none" />
          {meta.short}
        </span>
        <span className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground tabular-nums">
            {t.pass} pass{t.warn ? ` · ${t.warn} warn` : ''}{t.fail ? ` · ${t.fail} fail` : ''}
          </span>
          <Badge variant={report.pass ? 'success' : 'danger'}>
            <Dot /> {report.pass ? 'Passes' : 'Blocked'}
          </Badge>
        </span>
      </header>
      {rows.length ? (
        <ul className="divide-y divide-border/70">
          {rows.map((r) => {
            const o = OUTCOME_META[r.outcome]
            return (
              <li key={r.check} className="flex gap-2.5 px-3 py-2" data-check={r.check} data-outcome={r.outcome}>
                <Icon name={o.icon} size={16} className={cn('mt-[calc((1lh-16px)/2)] text-sm', o.className)} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm">{r.label}</span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      {r.method === 'vision' ? <Icon name="spark" size={14} /> : null}
                      <span className="sr-only">{o.label}: </span>
                      {r.method === 'vision' ? 'AI check' : 'Automated'}
                    </span>
                  </div>
                  {r.suggestions.map((s, i) => (
                    <p key={i} className="mt-0.5 text-xs text-pretty text-muted-foreground">
                      {s}
                    </p>
                  ))}
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="px-3 py-3 text-sm text-muted-foreground">No checks recorded.</p>
      )}
    </section>
  )
}
