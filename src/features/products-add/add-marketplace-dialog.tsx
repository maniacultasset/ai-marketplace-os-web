/**
 * "Add marketplace" (hi-fi p07 bulk bar, p17 "List on …"): queue AI generation of the same canonical
 * product on more marketplaces. Real call: POST /listings/generate per product x marketplace
 * (see ./generate.ts). Marketplaces outside the API (Myntra, AJIO, Meesho, Nykaa) are shown and
 * disabled with the reason, never selectable.
 */
import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { Banner } from '@/components/la'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { invalidateListingWork } from '@/features/listings/api'
import { useKeys } from '@/lib/query-keys'
import type { Listing, Marketplace, Product } from './catalog-model'
import { ListOnPicker, useConnectedMarketplaces } from './list-on'
import { generateMany, planGenerate, SKIP_COPY, type GenerateItem, type ItemOutcome } from './generate'

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
  products: readonly Pick<Product, 'id' | 'sku' | 'title' | 'parent_product_id'>[]
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

  const plan = useMemo(() => planGenerate(products, chosen, listingsOf), [products, chosen, listingsOf])

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
      <DialogContent className="max-w-[560px]">
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
                {/* listing-flow: each accepted job is an agent run (/runs/<job id>, p12). */}
                <span className="mt-2 flex flex-wrap gap-2">
                  {accepted.map((a) =>
                    a.kind === 'accepted' ? (
                      <Button key={a.accepted.job_id} variant="secondary" size="sm" asChild>
                        <Link to="/runs/$runId" params={{ runId: a.accepted.job_id }} data-testid={`watch-run-${a.item.marketplace}`}>
                          Watch the {API_NAMES[a.item.marketplace]} run
                        </Link>
                      </Button>
                    ) : null,
                  )}
                </span>
              </Banner>
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
            <ListOnPicker value={chosen} onChange={setChosen} connected={connected} />
            <div className="rounded-[10px] border border-line bg-sunken px-4 py-3 text-small text-ink-2 shadow-inset-sm" aria-live="polite">
              {chosen.length === 0 ? (
                'Choose at least one marketplace.'
              ) : (
                <>
                  <p>
                    <b className="text-ink">{plan.send.length}</b> {plan.send.length === 1 ? 'draft' : 'drafts'} will be started
                    {plan.skipped.length ? `, ${plan.skipped.length} skipped` : ''}.
                  </p>
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
              <Button disabled={plan.send.length === 0 || !!sending} onClick={() => void run(plan.send)} data-testid="start-generate">
                {sending ? <Spinner data-icon="inline-start" /> : null}
                {sending
                  ? `Starting ${sending.done}/${sending.total}…`
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

