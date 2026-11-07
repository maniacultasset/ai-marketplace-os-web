/**
 * Images for a product that is not saved yet (guided form, "Images" section).
 *
 * The main image goes straight to the store under a minted product id (`stageImageForNewProduct`)
 * and is attached in the same POST /products. Other images wait in the browser and upload right
 * after the save (`uploadImage`), because the backend can attach only one image before the
 * product exists. Files are never kept in the draft, and the section says so.
 */
import { useEffect, useRef, useState } from 'react'
import { useDropzone, type FileRejection } from 'react-dropzone'
import { describeError } from '@/api/errors'
import { Banner, Icon, Segmented } from '@/components/la'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import {
  IMAGE_CONTENT_TYPES,
  MAX_IMAGE_BYTES,
  SLOT_LABEL,
  type ImageSlot,
} from '@/features/analytics-images/images/report'
import type { PendingImage, PendingStage } from './new-images-model'
import { cn } from '@/lib/utils'

/** Slots for a new product (standalone, so a size chart is allowed). Packaging label stays on the Media tab. */
const NEW_SLOTS: readonly ImageSlot[] = ['main', 'secondary', 'lifestyle', 'size_chart']

export function NewProductImages({
  images,
  onAdd,
  onRemove,
  onRetry,
  error,
  locked,
}: {
  images: readonly PendingImage[]
  onAdd: (files: File[], slot: ImageSlot) => void
  onRemove: (localId: string) => void
  onRetry: (localId: string) => void
  error?: string
  /** Saving: no changes until it is done. */
  locked?: boolean
}) {
  const hasMain = images.some((i) => i.slot === 'main' && i.stage.kind !== 'invalid')
  const [slot, setSlot] = useState<ImageSlot>(hasMain ? 'secondary' : 'main')
  const prevMain = useRef(hasMain)
  useEffect(() => {
    if (hasMain && !prevMain.current) setSlot('secondary')
    prevMain.current = hasMain
  }, [hasMain])

  const dz = useDropzone({
    onDrop: (files: File[], rejected: FileRejection[]) => {
      const all = [...files, ...rejected.map((r) => r.file)]
      if (all.length) onAdd(slot === 'main' ? all.slice(0, 1) : all, slot)
    },
    multiple: slot !== 'main',
    accept: Object.fromEntries(IMAGE_CONTENT_TYPES.map((t) => [t, []])),
    maxSize: MAX_IMAGE_BYTES,
    disabled: locked,
  })

  const ordered = [...images].sort((a, b) => NEW_SLOTS.indexOf(a.slot) - NEW_SLOTS.indexOf(b.slot))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className="text-small font-bold text-ink">Add as</span>
        <Segmented
          label="Image type"
          value={slot}
          onChange={setSlot}
          options={NEW_SLOTS.map((s) => ({ value: s, label: SLOT_LABEL[s] }))}
        />
      </div>
      <div
        {...dz.getRootProps({
          className: cn(
            'focus-ring group flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-card border-[1.5px] border-dashed border-line-strong bg-field px-4 py-6 text-center shadow-inset-sm',
            'transition-[border-color,background-color] duration-150 hover:border-edge-hover',
            dz.isDragActive && 'border-brand bg-brand-bg',
            locked && 'cursor-not-allowed opacity-60',
          ),
          'aria-label': `Add ${SLOT_LABEL[slot].toLowerCase()} image`,
        })}
        data-testid="new-image-dropzone"
      >
        <input {...dz.getInputProps({ 'aria-label': 'Image files' })} />
        <span className="flex size-10 items-center justify-center rounded-tile bg-surface text-ink-2 shadow-raised-sm">
          <Icon name="upload" size={18} />
        </span>
        <p className="text-body font-semibold text-ink">
          {dz.isDragActive ? `Drop to add as ${SLOT_LABEL[slot].toLowerCase()}` : (
            <>
              Drop {slot === 'main' ? 'the main photo' : 'photos'} here, or <span className="text-brand">choose</span>
            </>
          )}
        </p>
        <p className="text-caption text-ink-3">
          {slot === 'main' && hasMain ? 'A new main photo replaces the current one.' : 'JPEG, PNG or WebP, up to 10 MB each. Checked against Amazon and Flipkart rules.'}
        </p>
      </div>

      {error ? <Banner tone="danger" role="alert">{error}</Banner> : null}

      {ordered.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4" aria-label="Chosen images" data-testid="new-images">
          {ordered.map((img) => (
            <PendingTile key={img.localId} img={img} locked={locked} onRemove={() => onRemove(img.localId)} onRetry={() => onRetry(img.localId)} />
          ))}
        </ul>
      ) : null}

      <p className="flex items-start gap-1.5 text-caption text-ink-3">
        <Icon name="info" size={14} className="mt-[calc((1lh-14px)/2)] shrink-0" />
        Photos are not kept in the draft. If you leave this page before saving, add them again.
      </p>
    </div>
  )
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
          {SLOT_LABEL[img.slot]}
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
