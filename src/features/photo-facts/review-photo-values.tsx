/**
 * Review screen > "Read from your photos" (SI3): the product's photo values that nobody has
 * confirmed yet, each marked "From photo, not confirmed" with Confirm and Reject inline (the same
 * saves as the product page, ./api.ts). The listing was written with these values, so after a
 * reject the card says so and offers the one next step the caller passes (generate again).
 *
 * Hidden when no photo value is left to check. Confirm and Reject are hidden without
 * `product:import`; the badges still show.
 */
import { useMemo, useState, type ReactNode } from 'react'
import { CardHead, Icon, LaCard, SourceBadge } from '@/components/la'
import { Button } from '@/components/ui/button'
import type { ProductDetail } from '@/features/products/api'
import { OP_ACTION, useCan } from '@/lib/permissions'
import { usePhotoFactActions } from './api'
import { confidenceWords, groupPhotoFacts, rejectedKeys, reviewPhotoRows, toCheckCount, withPending, factLabel } from './model'

export function ReviewPhotoValues({ product, afterReject }: { product: ProductDetail; afterReject?: ReactNode }) {
  const can = useCan()
  const canAct = can(OP_ACTION['PATCH /products/{product_id}'])
  const actions = usePhotoFactActions(product)
  const [acted, setActed] = useState<ReadonlySet<string>>(() => new Set())
  const [rejected, setRejected] = useState<ReadonlySet<string>>(() => new Set())
  const all = useMemo(() => groupPhotoFacts(product), [product])
  const rows = useMemo(() => reviewPhotoRows(withPending(all, actions.pending), acted), [all, actions.pending, acted])
  const factByKey = useMemo(() => new Map((product.photo_facts ?? []).map((f) => [f.key, f])), [product.photo_facts])
  const gone = rejectedKeys(rejected, product.photo_facts)
  const toCheck = toCheckCount(rows)
  if (rows.length === 0 && gone.length === 0) return null

  const mark = (key: string) => setActed((s) => new Set(s).add(key))
  return (
    <LaCard data-testid="review-photo-values">
      <CardHead
        title="Read from your photos"
        sub={toCheck ? `${toCheck} ${toCheck === 1 ? 'value' : 'values'} not confirmed. The listing uses ${toCheck === 1 ? 'it' : 'them'} as written.` : 'All checked.'}
      />
      {rows.length ? (
        <ul className="mt-3 flex flex-col">
          {rows.map((r) => {
            const fact = factByKey.get(r.key)
            const error = actions.errors[r.key]
            const busy = actions.saving.has(r.key)
            return (
              <li key={r.key} className="border-b border-line py-2 text-small last:border-b-0" data-fact-key={r.key} data-fact-status={r.status} aria-busy={busy || undefined}>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-ink-2">{r.label}</span>
                  <span className="min-w-0 break-words text-ink" data-testid="photo-fact-value">
                    {r.status === 'photo' && r.confidence !== undefined ? <span className="text-ink-3">{confidenceWords(r.confidence)} </span> : null}
                    {r.value}
                  </span>
                  <SourceBadge source={r.status === 'confirmed' ? { kind: 'confirmed' } : { kind: 'photo', unconfirmed: true }} />
                  {busy ? <span className="sr-only">Saving…</span> : null}
                </div>
                {canAct && r.status === 'photo' && fact ? (
                  <div className="mt-1.5 flex gap-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        mark(r.key)
                        void actions.confirm(fact)
                      }}
                      aria-label={`Confirm ${r.label.toLocaleLowerCase('en')}: ${r.value}`}
                      data-testid="photo-fact-confirm"
                    >
                      <Icon name="check" size={14} />
                      Confirm
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        mark(r.key)
                        setRejected((s) => new Set(s).add(r.key))
                        void actions.reject(fact)
                      }}
                      aria-label={`Reject ${r.label.toLocaleLowerCase('en')}: ${r.value}`}
                      data-testid="photo-fact-reject"
                    >
                      <Icon name="x" size={14} />
                      Reject
                    </Button>
                  </div>
                ) : null}
                {error ? (
                  <p role="alert" className="mt-0.5 text-caption text-danger" data-testid="photo-fact-error">
                    {error}
                  </p>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}
      {gone.length ? (
        <div className="mt-3 rounded-tile border border-attention-line bg-attention-bg px-3 py-2" role="status" data-testid="photo-reject-next">
          <p className="text-small text-attention-ink">
            Removed {gone.map((k) => factLabel(k).toLocaleLowerCase('en')).join(', ')}. This listing was written before, so its text may still use{' '}
            {gone.length === 1 ? 'it' : 'them'}.
          </p>
          {afterReject ? <div className="mt-2">{afterReject}</div> : null}
        </div>
      ) : null}
    </LaCard>
  )
}
