/**
 * SI12 structured photos (client wireframe, 8 Nov): a large Front tile, then Back, Close-up and Size
 * chart. Each tile is its own drop zone and holds one photo; a new photo replaces the tile's photo.
 * Used by the guided form (before the product exists) and the Media tab.
 */
import type { ReactNode } from 'react'
import { useDropzone, type FileRejection } from 'react-dropzone'
import { Icon } from '@/components/la/icons'
import { SavedPhoto } from '@/components/la/saved-photo'
import { Spinner } from '@/components/ui/spinner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { IMAGE_CONTENT_TYPES, MAX_IMAGE_BYTES, type PhotoQaWarning, type PhotoSlotDef } from './report'

export type TileTone = 'muted' | 'ok' | 'busy' | 'bad' | 'warn'

export interface TileState {
  /** A photo is in the tile (uploaded, staged or chosen). */
  filled: boolean
  /** A local preview when this visit chose the photo, else the saved photo's signed view. */
  previewUrl?: string
  /** One short line under the label: "Ready", "Uploading…", "Checked". */
  status?: string
  tone?: TileTone
  /** SI14 photo QA warnings (never blocking). */
  warnings?: readonly PhotoQaWarning[]
  /** Feedback 8: the view is met without a photo (a size chart the seller saved), so no level chip. */
  satisfied?: boolean
}

/**
 * Calm chips for the photo QA warnings: a suggestion, never a failure. Nothing renders when there
 * are none, which is always the case while the backend's photo QA switch is off.
 */
export function PhotoQaChips({ warnings, className }: { warnings: readonly PhotoQaWarning[] | undefined; className?: string }) {
  if (!warnings?.length) return null
  return (
    <ul className={cn('flex flex-wrap gap-1', className)} aria-label="Photo suggestions" data-testid="photo-qa">
      {warnings.map((w) => (
        <li
          key={w.check}
          className="inline-flex max-w-full items-center gap-1 rounded-md border border-line-strong bg-subtle px-1.5 py-0.5 text-caption text-ink-2"
          title={w.suggestion ?? undefined}
          data-check={w.check}
        >
          <Icon name="info" size={12} className="shrink-0 text-ink-3" aria-hidden />
          <span className="truncate">{w.label}</span>
          {w.suggestion ? <span className="sr-only">: {w.suggestion}</span> : null}
        </li>
      ))}
    </ul>
  )
}

export function PhotoSlotGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('grid w-full max-w-[520px] grid-cols-3 gap-2.5 sm:gap-3', className)} data-testid="photo-slots">
      {children}
    </div>
  )
}

/** The caption over the Back, Close-up and Size chart row, so its meaning never borrows the Front tile's. */
export function PhotoSlotRowCaption() {
  return (
    <p className="col-span-3 mt-1 -mb-1 text-caption font-semibold text-ink-2" data-testid="photo-slots-recommended">
      Recommended
    </p>
  )
}

export function PhotoTile({
  def,
  state,
  onFiles,
  onRemove,
  disabled,
  large,
  onPreviewError,
  showLevel,
}: {
  def: PhotoSlotDef
  state: TileState
  onFiles: (files: File[]) => void
  onRemove?: () => void
  disabled?: boolean
  /** The preview failed to load (a saved photo's link may have expired). */
  onPreviewError?: () => void
  /** The Front tile: full width, 4:3. */
  large?: boolean
  /**
   * Feedback 7: the tiles come from the category checklist, so an empty tile names its own level
   * (Recommended, Optional) instead of the row caption. Required shows either way.
   */
  showLevel?: boolean
}) {
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
          <SavedPhoto
            src={state.previewUrl}
            alt={`${def.label} photo`}
            onError={onPreviewError}
            // The whole photo, never cropped: the seller checks its framing here.
            fit="contain"
            iconSize={large ? 22 : 18}
            testId="photo-slot-image"
            className="absolute inset-0 size-full bg-sunken text-ink-3"
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
        <span className="absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] items-center gap-1">
          <span className="truncate rounded-md border border-line bg-surface/95 px-1.5 py-0.5 text-caption font-semibold text-ink shadow-raised-sm">{def.label}</span>
          {def.required && !state.filled && !state.satisfied ? (
            <span className="shrink-0 rounded-md border border-attention-line bg-attention-bg px-1.5 py-0.5 text-caption font-semibold text-attention" data-testid="photo-slot-required">
              Required
            </span>
          ) : showLevel && !def.required && !state.filled && !state.satisfied ? (
            <span className="shrink-0 rounded-md border border-line bg-surface/95 px-1.5 py-0.5 text-caption text-ink-2" data-testid="photo-slot-level">
              {def.requirement === 'recommended' ? 'Recommended' : 'Optional'}
            </span>
          ) : null}
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
      {state.status ? (
      <p
        className={cn(
          'mt-1.5 flex min-h-[1lh] min-w-0 items-center gap-1 text-caption',
          tone === 'ok' ? 'text-success-ink' : tone === 'bad' ? 'text-danger' : tone === 'warn' ? 'text-attention-ink' : 'text-ink-3',
        )}
        role={tone === 'bad' ? 'alert' : undefined}
        aria-live={tone === 'bad' ? undefined : 'polite'}
      >
        {tone === 'busy' ? <Spinner className="size-3 shrink-0" aria-hidden /> : null}
        <span className="line-clamp-2">{state.status}</span>
      </p>
      ) : null}
      <PhotoQaChips warnings={state.warnings} className="mt-1" />
    </div>
  )
}

/**
 * Feedback 7: what the category needs at a glance, with the why behind each view one click away.
 * `gaps` are the required views still missing (blocking approval) and the recommended ones.
 */
export function PhotoChecklistNote({
  needed,
  recommended,
  rows,
}: {
  /** Labels approval still needs. */
  needed: readonly string[]
  /** Labels recommended and still missing. */
  recommended: readonly string[]
  /** Every view of the checklist with its level and why, for the disclosure. */
  rows: readonly { label: string; requirement: 'required' | 'recommended' | 'optional'; why: string }[]
}) {
  const level = { required: 'Required', recommended: 'Recommended', optional: 'Optional' } as const
  return (
    <div className="flex flex-col gap-1.5" data-testid="photo-checklist">
      {needed.length ? (
        <p className="flex items-start gap-1.5 text-small text-attention-ink" data-testid="photo-needed">
          <Icon name="alert" size={14} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            Needed before approval: {needed.join(', ')}. You can still start a draft.
          </span>
        </p>
      ) : null}
      {recommended.length ? (
        <p className="text-small text-ink-2" data-testid="photo-recommended">
          Recommended: {recommended.join(', ')}.
        </p>
      ) : null}
      <details className="group text-small">
        <summary className="focus-ring w-fit cursor-pointer rounded-sm font-semibold text-brand marker:content-none">
          Why these photos
        </summary>
        <ul className="mt-1.5 flex flex-col gap-1">
          {rows.map((r) => (
            <li key={r.label} className="text-caption text-ink-2">
              <b className="text-ink">{r.label}</b> · {level[r.requirement]}. {r.why}
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}
