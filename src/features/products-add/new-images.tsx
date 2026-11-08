/**
 * Images for a product that is not saved yet (guided form, "Images" section).
 *
 * SI12: Front (required), Back, Close-up and Size chart are fixed tiles, each its own drop zone that
 * sends its slot and role; other photos sit under "More photos", collapsed.
 *
 * The Front image goes straight to the store under a minted product id (`stageImageForNewProduct`)
 * and is attached in the same POST /products. Other images wait in the browser and upload right
 * after the save (`uploadImage`), because the backend can attach only one image before the
 * product exists. Files are never kept in the draft, and the section says so.
 */
import { Fragment, useState } from 'react'
import { useDropzone, type FileRejection } from 'react-dropzone'
import { describeError } from '@/api/errors'
import { Banner, Icon, Segmented } from '@/components/la'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Spinner } from '@/components/ui/spinner'
import {
  IMAGE_CONTENT_TYPES,
  imageLabel,
  MAX_IMAGE_BYTES,
  PHOTO_SLOTS,
  photoSlotOf,
  SLOT_LABEL,
  type ImageRole,
  type ImageSlot,
} from '@/features/analytics-images/images/report'
import { PhotoSlotGrid, PhotoSlotRowCaption, PhotoTile, type TileState } from '@/features/analytics-images/images/photo-slots'
import type { PendingImage, PendingStage } from './new-images-model'
import { cn } from '@/lib/utils'

/** "More photos" for a new product. Packaging label stays on the Media tab. */
const MORE_NEW: readonly ImageSlot[] = ['secondary', 'lifestyle']

export function NewProductImages({
  images,
  onAdd,
  onRemove,
  onRetry,
  error,
  locked,
}: {
  images: readonly PendingImage[]
  onAdd: (files: File[], slot: ImageSlot, role?: ImageRole | null) => void
  onRemove: (localId: string) => void
  onRetry: (localId: string) => void
  error?: string
  /** Saving: no changes until it is done. */
  locked?: boolean
}) {
  const [moreSlot, setMoreSlot] = useState<ImageSlot>('secondary')
  const extras = images.filter((i) => photoSlotOf(i.slot, i.role) === null)
  const [moreOpen, setMoreOpen] = useState(extras.length > 0)

  const dz = useDropzone({
    onDrop: (files: File[], rejected: FileRejection[]) => {
      const all = [...files, ...rejected.map((r) => r.file)]
      if (all.length) onAdd(all, moreSlot, null)
    },
    multiple: true,
    accept: Object.fromEntries(IMAGE_CONTENT_TYPES.map((t) => [t, []])),
    maxSize: MAX_IMAGE_BYTES,
    disabled: locked,
  })

  /** The photo in a tile: the last one chosen for it. */
  const inTile = (id: string) => [...images].reverse().find((i) => photoSlotOf(i.slot, i.role) === id)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <p className="text-body text-ink-2">The same four photos for every product, so the agent reads each one the same way.</p>
      </div>
      <PhotoSlotGrid>
        {PHOTO_SLOTS.map((def) => {
          const img = inTile(def.id)
          return (
            <Fragment key={def.id}>
              {def.id === 'back' ? <PhotoSlotRowCaption /> : null}
              <PhotoTile
              def={def}
              large={def.id === 'front'}
              state={img ? tileState(img) : { filled: false }}
              onFiles={(files) => onAdd(files, def.slot, def.role)}
              onRemove={img && img.stage.kind !== 'uploading' ? () => onRemove(img.localId) : undefined}
              disabled={locked}
              />
            </Fragment>
          )
        })}
      </PhotoSlotGrid>
      {PHOTO_SLOTS.map((def) => {
        const img = inTile(def.id)
        return img?.stage.kind === 'failed' ? (
          <div key={def.id} className="-mt-2 flex flex-wrap items-center gap-2 text-caption text-danger" role="alert">
            {def.label}: {describeError(img.stage.error)}
            <Button type="button" variant="ghost" size="xs" onClick={() => onRetry(img.localId)} disabled={locked}>
              <Icon name="refresh" size={12} />
              Retry
            </Button>
          </div>
        ) : null
      })}

      {error ? <Banner tone="danger" role="alert">{error}</Banner> : null}

      <Collapsible open={moreOpen} onOpenChange={setMoreOpen} className="rounded-card border border-line bg-surface">
        <CollapsibleTrigger asChild>
          <button type="button" className="focus-ring flex w-full items-center justify-between gap-3 rounded-card px-4 py-3 text-left" data-testid="more-photos-toggle">
            <span className="flex min-w-0 flex-col">
              <span className="text-small font-bold text-ink">More photos</span>
              <span className="text-caption text-ink-3">{extras.length ? `${extras.length} added` : 'Lifestyle and other angles. Optional.'}</span>
            </span>
            <Icon name="chev" size={16} className={cn('shrink-0 text-ink-2 motion-safe:transition-transform motion-safe:duration-150', moreOpen && 'rotate-180')} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="flex flex-col gap-3 border-t border-line px-4 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-small font-bold text-ink">Add as</span>
              <Segmented label="Image type" value={moreSlot} onChange={setMoreSlot} options={MORE_NEW.map((s) => ({ value: s, label: SLOT_LABEL[s] }))} />
            </div>
            <div
              {...dz.getRootProps({
                className: cn(
                  'focus-ring group flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-card border-[1.5px] border-dashed border-line-strong bg-field px-4 py-5 text-center shadow-inset-sm',
                  'transition-[border-color,background-color] duration-150 hover:border-edge-hover',
                  dz.isDragActive && 'border-brand bg-brand-bg',
                  locked && 'cursor-not-allowed opacity-60',
                ),
                'aria-label': `Add ${SLOT_LABEL[moreSlot].toLowerCase()} images`,
              })}
              data-testid="new-image-dropzone"
            >
              <input {...dz.getInputProps({ 'aria-label': 'Image files' })} />
              <p className="text-body font-semibold text-ink">
                {dz.isDragActive ? `Drop to add as ${SLOT_LABEL[moreSlot].toLowerCase()}` : (
                  <>
                    Drop photos here, or <span className="text-brand">choose</span>
                  </>
                )}
              </p>
              <p className="text-caption text-ink-3">JPEG, PNG or WebP, up to 10 MB each.</p>
            </div>
            {extras.length ? (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="More photos chosen" data-testid="new-images">
                {extras.map((img) => (
                  <PendingTile key={img.localId} img={img} locked={locked} onRemove={() => onRemove(img.localId)} onRetry={() => onRetry(img.localId)} />
                ))}
              </ul>
            ) : null}
          </div>
        </CollapsibleContent>
      </Collapsible>

      <p className="flex items-start gap-1.5 text-caption text-ink-3">
        <Icon name="info" size={14} className="mt-[calc((1lh-14px)/2)] shrink-0" />
        JPEG, PNG or WebP, up to 10 MB each, checked against Amazon and Flipkart rules. Photos are not kept in the draft: if you leave before saving, add them again.
      </p>
    </div>
  )
}

function tileState(img: PendingImage): TileState {
  const st = stageText(img.stage)
  return { filled: img.stage.kind !== 'invalid', previewUrl: img.stage.kind === 'invalid' ? undefined : img.previewUrl, status: st.text, tone: st.tone }
}

function stageText(s: PendingStage): { text: string; tone: 'muted' | 'ok' | 'busy' | 'bad' } {
  switch (s.kind) {
    case 'invalid':
      return { text: s.message, tone: 'bad' }
    case 'staging':
      return { text: 'Uploading…', tone: 'busy' }
    case 'staged':
      return { text: 'Ready', tone: 'ok' }
    case 'queued':
      return { text: 'Uploads when you save', tone: 'muted' }
    case 'uploading':
      return { text: 'Uploading…', tone: 'busy' }
    case 'done':
      return { text: 'Uploaded', tone: 'ok' }
    case 'failed':
      return { text: describeError(s.error), tone: 'bad' }
  }
}

function PendingTile({ img, locked, onRemove, onRetry }: { img: PendingImage; locked?: boolean; onRemove: () => void; onRetry: () => void }) {
  const st = stageText(img.stage)
  const [loaded, setLoaded] = useState(false)
  return (
    <li className="flex min-w-0 flex-col overflow-hidden rounded-card border border-line bg-surface shadow-raised-sm" data-stage={img.stage.kind} data-slot={img.slot}>
      <div className="relative aspect-square bg-sunken">
        {img.stage.kind === 'invalid' ? (
          <span className="absolute inset-0 flex items-center justify-center text-ink-3">
            <Icon name="image" size={24} />
          </span>
        ) : (
          <img
            src={img.previewUrl}
            alt=""
            onLoad={() => setLoaded(true)}
            onError={() => setLoaded(true)}
            className={cn('size-full object-cover transition-opacity duration-200 motion-reduce:transition-none', loaded ? 'opacity-100' : 'opacity-0')}
          />
        )}
        <span className="absolute top-2 left-2 rounded-full bg-surface/95 px-2 py-0.5 text-caption font-semibold text-ink shadow-raised-sm">
          {imageLabel(img.slot, img.role)}
        </span>
        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          className="absolute top-2 right-2"
          aria-label={`Remove ${img.file.name}`}
          disabled={locked || img.stage.kind === 'uploading'}
          onClick={onRemove}
        >
          <Icon name="x" size={16} />
        </Button>
      </div>
      <div className="flex min-w-0 flex-col gap-0.5 px-3 py-2">
        <p className="truncate text-small font-semibold text-ink" title={img.file.name}>
          {img.file.name}
        </p>
        <p
          className={cn(
            'flex min-w-0 items-center gap-1.5 text-caption',
            st.tone === 'ok' ? 'text-success-ink' : st.tone === 'bad' ? 'text-danger' : 'text-ink-2',
          )}
          role={st.tone === 'bad' ? 'alert' : 'status'}
        >
          {st.tone === 'busy' ? <Spinner className="size-3" aria-hidden /> : st.tone === 'ok' ? <Icon name="check" size={12} /> : null}
          <span className="line-clamp-2">{st.text}</span>
        </p>
        {img.stage.kind === 'failed' ? (
          <Button type="button" variant="ghost" size="xs" className="-ml-2 self-start" onClick={onRetry} disabled={locked}>
            <Icon name="refresh" size={12} />
            Retry
          </Button>
        ) : null}
      </div>
    </li>
  )
}
