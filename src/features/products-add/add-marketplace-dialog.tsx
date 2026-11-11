/**
 * "Add marketplace" (hi-fi p07 bulk bar, p17 "List on …"): queue AI generation of the same canonical
 * product on more marketplaces. Real call: POST /listings/generate per product x marketplace
 * (see ./generate.ts). Marketplaces outside the API (Myntra, AJIO, Meesho, Nykaa) are shown and
 * disabled with the reason, never selectable.
 */
import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useMemo, useRef, useState } from 'react'
import { Banner } from '@/components/la'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { invalidateListingWork } from '@/features/listings/api'
import { openForDrafts } from '@/features/marketplaces/meta'
import { useKeys } from '@/lib/query-keys'
import type { Listing, Marketplace, Product } from './catalog-model'
import { ListOnPicker, useConnectedMarketplaces } from './list-on'
import { generateMany, planGenerate, SKIP_COPY, type GenerateItem, type ItemOutcome } from './generate'
import { neededForApproval, viewGaps } from '@/features/analytics-images/images/photo-views'

const API_NAMES: Record<Marketplace, string> = { amazon: 'Amazon', flipkart: 'Flipkart' }

export function AddMarketplaceDialog({
  open,
  onOpenChange,
  products,
  listingsOf,
  initial,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** Feedback 7: a product read with `photo_views` adds what approval will still need. */
  products: readonly (Pick<Product, 'id' | 'sku' | 'title' | 'parent_product_id'> & Partial<Pick<Product, 'photo_views' | 'size_chart_check'>>)[]
  listingsOf: (productId: string) => Partial<Record<Marketplace, Listing>>
  /** Marketplaces ticked when the dialog opens. */
  initial?: readonly Marketplace[]
}) {
  const keys = useKeys()
  const qc = useQueryClient()
  const [chosen, setChosen] = useState<Marketplace[]>(() => [...(initial ?? [])])
  const [sending, setSending] = useState<{ done: number; total: number } | null>(null)
  const [results, setResults] = useState<ItemOutcome[] | null>(null)
  const { connected } = useConnectedMarketplaces()
  const contentRef = useRef<HTMLDivElement>(null)
  // Only marketplaces drafts can start for: a Flipkart preset is dropped while Flipkart is not
  // connected, because the picker hides its checkbox and it could not be unticked.
  const draftable = useMemo(() => openForDrafts(chosen, connected), [chosen, connected])

  const plan = useMemo(() => planGenerate(products, draftable, listingsOf), [products, draftable, listingsOf])
  // Feedback 7 and 8: said before the draft starts; it never stops the draft.
  const only = products.length === 1 ? products[0] : undefined
  const photosNeeded = only ? neededForApproval(viewGaps(only.photo_views, only.size_chart_check, draftable)) : []

  const run = async (items: readonly GenerateItem[]) => {
    setSending({ done: 0, total: items.length })
    const out = await generateMany(items, (done) => setSending({ done, total: items.length }))
    setSending(null)
    setResults((prev) => {
      if (!prev) return out
      // A retry replaces the failed rows it re-sent, keeping earlier successes.
      const byKey = new Map(out.map((o) => [o.item.key, o]))
      return prev.map((p) => byKey.get(p.item.key) ?? p)
    })
    invalidateListingWork(
      qc,
      keys,
      out.flatMap((o) => (o.kind === 'accepted' && o.accepted.listing_id ? [o.accepted.listing_id] : [])),
    )
  }

  const accepted = results?.filter((r) => r.kind === 'accepted') ?? []
  const failed = results?.filter((r) => r.kind === 'failed') ?? []
  const single = accepted[0]?.kind === 'accepted' ? accepted[0] : null
  const close = (v: boolean) => {
    if (sending) return
    onOpenChange(v)
    if (!v) {
      setResults(null)
      setChosen([...(initial ?? [])])
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        ref={contentRef}
        className="sm:max-w-[560px]"
        // Focus the dialog itself, not its first tabbable: while the accounts load, the marketplace
        // checkboxes are placeholders and the first tabbable is a "not supported" hint whose tooltip
        // would open on focus and cover the checkboxes. Tab still starts at the first marketplace.
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          contentRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>Add marketplace</DialogTitle>
          <DialogDescription>
            The agent drafts a listing from the same product. Nothing is sent to a marketplace until a person approves it.
          </DialogDescription>
        </DialogHeader>

        {results ? (
          <div className="flex flex-col gap-3" data-testid="generate-results">
            {accepted.length ? (
              <Banner tone="success" role="status" title={`${accepted.length} ${accepted.length === 1 ? 'draft' : 'drafts'} queued`}>
                Each one shows as Working until the agent finishes. While processing is paused it stays queued.
              </Banner>
            ) : null}
            {/* listing-flow: each accepted job is an agent run (/runs/<job id>, p12). */}
            {accepted.length === 1 && single ? (
              <Button variant="secondary" size="sm" className="self-start" asChild>
                <Link to="/runs/$runId" params={{ runId: single.accepted.job_id }} data-testid={`watch-run-${single.item.marketplace}`}>
                  Watch the run
                </Link>
              </Button>
            ) : accepted.length > 1 ? (
              <ul className="max-h-48 divide-y divide-line overflow-y-auto rounded-banner border border-line" aria-label="Queued drafts">
                {accepted.map((a) =>
                  a.kind === 'accepted' ? (
                    <li key={a.accepted.job_id} className="flex items-center justify-between gap-3 px-3 py-2 text-small text-ink-2">
                      <span className="min-w-0 truncate">
                        <b className="text-ink">{a.item.product.sku}</b> · {API_NAMES[a.item.marketplace]}
                      </span>
                      <Button variant="ghost" size="xs" className="shrink-0" asChild>
                        <Link
                          to="/runs/$runId"
                          params={{ runId: a.accepted.job_id }}
                          data-testid={`watch-run-${a.item.marketplace}`}
                          aria-label={`Watch the run for ${a.item.product.sku} on ${API_NAMES[a.item.marketplace]}`}
                        >
                          Watch
                        </Link>
                      </Button>
                    </li>
                  ) : null,
                )}
              </ul>
            ) : null}
            {failed.length ? (
              <Banner tone="danger" role="alert" title={`${failed.length} not started`}>
                <ul className="mt-1 flex flex-col gap-1">
                  {failed.map((f) =>
                    f.kind === 'failed' ? (
                      <li key={f.item.key} className="text-small">
                        <b>{f.item.product.sku}</b> on {API_NAMES[f.item.marketplace]}: {f.message}
                      </li>
                    ) : null,
                  )}
                </ul>
              </Banner>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <ListOnPicker value={draftable} onChange={setChosen} connected={connected} />
            <div className="rounded-banner border border-line bg-subtle px-4 py-3 text-small text-ink-2" aria-live="polite">
              {draftable.length === 0 ? (
                'Choose at least one marketplace.'
              ) : (
                <>
                  <p>
                    <b className="text-ink">{plan.send.length}</b> {plan.send.length === 1 ? 'draft' : 'drafts'} will be started
                    {plan.skipped.length ? `, ${plan.skipped.length} skipped` : ''}.
                  </p>
                  {photosNeeded.length && plan.send.length ? (
                    <p className="mt-1.5 text-attention-ink" data-testid="photos-needed">
                      Approval will need: {photosNeeded.join(', ')}. You can add {photosNeeded.length === 1 ? 'it' : 'them'} while the draft runs.
                    </p>
                  ) : null}
                  {plan.skipped.length ? (
                    <ul className="mt-1.5 flex max-h-32 flex-col gap-0.5 overflow-y-auto">
                      {plan.skipped.map((s) => (
                        <li key={`${s.product.id}-${s.marketplace}`}>
                          {s.product.sku} on {API_NAMES[s.marketplace]}: {SKIP_COPY[s.reason]}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          {results ? (
            <>
              {failed.length ? (
                <Button variant="secondary" disabled={!!sending} onClick={() => void run(failed.map((f) => f.item))}>
                  {sending ? <Spinner data-icon="inline-start" /> : null}
                  Retry {failed.length}
                </Button>
              ) : null}
              {accepted.length ? (
                <Button variant="secondary" asChild>
                  <Link to="/inbox">Open Inbox</Link>
                </Button>
              ) : null}
              <Button onClick={() => close(false)}>Done</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => close(false)} disabled={!!sending}>
                Cancel
              </Button>
              <Button className="min-w-40" disabled={plan.send.length === 0 || !!sending} onClick={() => void run(plan.send)} data-testid="start-generate">
                {sending ? <Spinner data-icon="inline-start" aria-hidden /> : null}
                {sending
                  ? `Starting drafts ${sending.done}/${sending.total}…`
                  : plan.send.length === 1
                    ? 'Start 1 draft'
                    : `Start ${plan.send.length} drafts`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

