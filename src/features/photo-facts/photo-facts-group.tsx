/**
 * Product details > "From photos" (SI3): the details read from the product photos, each with how
 * sure the photo check was in plain words, and Confirm / Reject inline. The seller's own value for
 * a photo detail shows as "You": a photo never replaces it.
 *
 * Confirm and Reject are optimistic (the row changes at once) and roll back with an inline error
 * when the save fails. They are hidden without `product:import` (PATCH /products/{id}).
 */
import { useMemo } from 'react'
import { Icon, SourceBadge } from '@/components/la'
import { Button } from '@/components/ui/button'
import { SavedPhoto } from '@/components/la/saved-photo'
import type { ProductDetail } from '@/features/products/api'
import { useRefreshProductViews, viewsById } from '@/features/products/image-views'
import { OP_ACTION, useCan } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { usePhotoFactActions } from './api'
import { confidenceWords, toCheckCount, withPending, type FactRow } from './model'

/** Same columns as the card's other key-value lists, so the values line up. */
const KV_GRID = 'grid grid-cols-[minmax(96px,max-content)_minmax(0,1fr)] items-baseline gap-x-3'

type Actions = ReturnType<typeof usePhotoFactActions>

/**
 * `actions`: the product card's own confirm and reject (SI12: a field's "From photo" chip confirms
 * through the same queue, so both show the same pending state). Absent: the group makes its own.
 */
export function PhotoFactsGroup({ product, rows, actions }: { product: ProductDetail; rows: readonly FactRow[]; actions?: Actions }) {
  return actions ? <Group product={product} rows={rows} actions={actions} /> : <WithOwnActions product={product} rows={rows} />
}

function WithOwnActions({ product, rows }: { product: ProductDetail; rows: readonly FactRow[] }) {
  const actions = usePhotoFactActions(product)
  return <Group product={product} rows={rows} actions={actions} />
}

function Group({ product, rows, actions }: { product: ProductDetail; rows: readonly FactRow[]; actions: Actions }) {
  const can = useCan()
  const canAct = can(OP_ACTION['PATCH /products/{product_id}'])
  const shown = useMemo(() => withPending(rows, actions.pending), [rows, actions.pending])
  const toCheck = toCheckCount(shown)
  const factByKey = useMemo(() => new Map((product.photo_facts ?? []).map((f) => [f.key, f])), [product.photo_facts])
  // The photo each value was read from, so the seller can check it against the picture.
  const views = useMemo(() => viewsById(product), [product])
  const refreshViews = useRefreshProductViews(product.id)
  if (shown.length === 0) return null

  return (
    <section className="mt-4 border-t border-line pt-4" aria-labelledby={`photo-facts-${product.id}`} data-testid="photo-facts">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 id={`photo-facts-${product.id}`} className="font-sans text-caption font-semibold text-ink-2">
          From photos
        </h3>
        <p className="text-caption text-ink-3" aria-live="polite" data-testid="photo-facts-status">
          {toCheck ? `${toCheck} to check` : 'All checked'}
        </p>
      </div>
      <p className="mt-0.5 text-caption text-ink-3">
        {canAct && toCheck ? 'Read from your photos. Confirm what is right and reject the rest. ' : 'Read from your photos. '}
        Your own values always win.
      </p>
      <ul className="mt-2 flex flex-col">
        {shown.map((r) => {
          const fact = factByKey.get(r.key)
          const error = actions.errors[r.key]
          const busy = actions.saving.has(r.key)
          return (
            <li
              key={r.key}
              className={cn('border-b border-line py-2 text-small last:border-b-0', KV_GRID)}
              data-fact-key={r.key}
              data-fact-status={r.status}
              aria-busy={busy || undefined}
            >
              <span className="whitespace-nowrap text-ink-2">{r.label}</span>
              <div className="min-w-0">
                <div className="flex min-h-[30px] flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="min-w-0 break-words text-ink" data-testid="photo-fact-value">
                    {r.status === 'photo' && r.confidence !== undefined ? <span className="text-ink-3">{confidenceWords(r.confidence)} </span> : null}
                    {r.value}
                  </span>
                  <SourceBadge source={{ kind: r.status === 'you' ? 'you' : r.status === 'confirmed' ? 'confirmed' : 'photo' }} />
                  {busy ? <span className="sr-only">Saving…</span> : null}
                  {canAct && r.status === 'photo' && fact ? (
                    <span className="ml-auto flex shrink-0 gap-1">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void actions.confirm(fact)}
                        aria-label={`Confirm ${r.label.toLocaleLowerCase('en')}: ${r.value}`}
                        data-testid="photo-fact-confirm"
                      >
                        <Icon name="check" size={14} />
                        Confirm
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void actions.reject(fact)}
                        aria-label={`Reject ${r.label.toLocaleLowerCase('en')}: ${r.value}`}
                        data-testid="photo-fact-reject"
                      >
                        <Icon name="x" size={14} />
                        Reject
                      </Button>
                    </span>
                  ) : null}
                </div>
                {r.status === 'photo' && r.photo ? (
                  <p className="mt-0.5 flex items-center gap-2 text-caption text-ink-3" data-testid="photo-fact-source">
                    {fact && views.has(fact.image_id) ? (
                      <SavedPhoto
                        src={views.get(fact.image_id)}
                        alt={r.photo}
                        onError={refreshViews}
                        iconSize={14}
                        testId="photo-fact-photo"
                        className="size-8 rounded-md ring-1 ring-border"
                      />
                    ) : null}
                    <span>From the {r.photo.toLocaleLowerCase('en')}</span>
                  </p>
                ) : null}
                {error ? (
                  <p role="alert" className="mt-0.5 text-caption text-danger" data-testid="photo-fact-error">
                    {error}
                  </p>
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
