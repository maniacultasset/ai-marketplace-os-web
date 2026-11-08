/**
 * SI12 structured photos (client wireframe, 8 Nov): a large Front tile, then Back, Close-up and Size
 * chart. Each tile is its own drop zone and holds one photo; a new photo replaces the tile's photo.
 * Used by the guided form (before the product exists) and the Media tab.
 */
import { useState, type ReactNode } from 'react'
import { useDropzone, type FileRejection } from 'react-dropzone'
import { Icon } from '@/components/la/icons'
import { Spinner } from '@/components/ui/spinner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { IMAGE_CONTENT_TYPES, MAX_IMAGE_BYTES, type PhotoSlotDef } from './report'

export type TileTone = 'muted' | 'ok' | 'busy' | 'bad'

export interface TileState {
  /** A photo is in the tile (uploaded, staged or chosen). */
  filled: boolean
  /** A local preview, when this visit chose the photo. */
  previewUrl?: string
  /** One short line under the label: "Ready", "Uploading…", "Checked". */
  status?: string
  tone?: TileTone
}

export function PhotoSlotGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('grid w-full max-w-[520px] grid-cols-3 gap-2.5 sm:gap-3', className)} data-testid="photo-slots">
      {children}
    </div>
  )
}

export function PhotoTile({
  def,
  state,
  onFiles,
  onRemove,
  disabled,
  large,
}: {
  def: PhotoSlotDef
  state: TileState
  onFiles: (files: File[]) => void
  onRemove?: () => void
  disabled?: boolean
  /** The Front tile: full width, 4:3. */
  large?: boolean
}) {
  const [loaded, setLoaded] = useState(false)
  const dz = useDropzone({
    onDrop: (files: File[], rejected: FileRejection[]) => {
      const all = [...files, ...rejected.map((r) => r.file)]
      if (all.length) onFiles(all.slice(0, 1))
    },
    multiple: false,
    accept: Object.fromEntries(IMAGE_CONTENT_TYPES.map((t) => [t, []])),
    maxSize: MAX_IMAGE_BYTES,
    disabled,
  })
  const name = def.label.toLocaleLowerCase('en')
  const tone = state.tone ?? 'muted'
  return (
    <div
      className={cn('relative min-w-0', large ? 'col-span-3' : 'col-span-1')}
      data-testid={`photo-slot-${def.id}`}
      data-filled={state.filled || undefined}
    >
      <div
        {...dz.getRootProps({
          className: cn(
            'focus-ring group relative flex w-full cursor-pointer flex-col overflow-hidden rounded-card border text-left',
            'transition-[border-color,background-color,box-shadow] duration-150 motion-reduce:transition-none',
            large ? 'aspect-[4/3]' : 'aspect-square',
            state.filled
              ? 'border-line bg-sunken shadow-raised-sm hover:border-line-strong'
              : 'border-[1.5px] border-dashed border-line-strong bg-field shadow-inset-sm hover:border-edge-hover',
            dz.isDragActive && 'border-brand bg-brand-bg',
            disabled && 'cursor-not-allowed opacity-60',
          ),
          'aria-label': state.filled ? `Replace ${name} photo` : `Add ${name} photo`,
        })}
      >
        <input {...dz.getInputProps({ 'aria-label': `${def.label} photo file` })} />
        {state.filled && state.previewUrl ? (
          <img
            src={state.previewUrl}
            alt=""
            onLoad={() => setLoaded(true)}
            onError={() => setLoaded(true)}
            className={cn('absolute inset-0 size-full object-cover transition-opacity duration-200 motion-reduce:transition-none', loaded ? 'opacity-100' : 'opacity-0')}
          />
        ) : (
          <span className={cn('absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-2 text-center', !large && 'pb-7')}>
            <span
              className={cn(
                'flex items-center justify-center rounded-tile bg-surface text-ink-2 shadow-raised-sm',
                large ? 'size-11' : 'size-8',
                state.filled && 'text-success',
              )}
            >
              <Icon name={state.filled ? 'check' : dz.isDragActive ? 'upload' : large ? 'upload' : 'plus'} size={large ? 20 : 16} />
            </span>
            {large ? (
              <>
                <span className="text-body font-semibold text-ink">
                  {dz.isDragActive ? 'Drop to add the front photo' : state.filled ? 'Front photo added' : (
                    <>
                      Drop the front photo, or <span className="text-brand">choose</span>
                    </>
                  )}
                </span>
                <span className="hidden max-w-xs text-caption text-ink-3 sm:block">{def.hint}</span>
              </>
            ) : null}
          </span>
        )}
        <span className="absolute bottom-2 left-2 max-w-[calc(100%-1rem)] truncate rounded-md border border-line bg-surface/95 px-1.5 py-0.5 text-caption font-semibold text-ink shadow-raised-sm">
          {def.label}
        </span>
      </div>
      {onRemove && state.filled ? (
        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          className="absolute top-2 right-2"
          aria-label={`Remove ${name} photo`}
          disabled={disabled}
          onClick={onRemove}
        >
          <Icon name="x" size={16} />
        </Button>
      ) : null}
      <p
        className={cn(
          'mt-1.5 flex min-h-[1lh] min-w-0 items-center gap-1 text-caption',
          tone === 'ok' ? 'text-success-ink' : tone === 'bad' ? 'text-danger' : 'text-ink-3',
        )}
        role={tone === 'bad' ? 'alert' : undefined}
        aria-live={tone === 'bad' ? undefined : 'polite'}
      >
        {tone === 'busy' ? <Spinner className="size-3 shrink-0" aria-hidden /> : null}
        <span className="line-clamp-2">{state.status ?? (state.filled ? '' : def.required ? 'Required' : 'Recommended')}</span>
      </p>
    </div>
  )
}
