/**
 * "List on" (hi-fi p08): which marketplaces the agent drafts for after a product is added.
 * Carried between the add screens in the `on` search param ("amazon,flipkart").
 * Only API marketplaces can be chosen; the others are shown disabled with the reason. Flipkart is
 * shown as Coming soon, not choosable, until the brand has it connected (marketplaces/meta
 * `draftOpen`). Pre-selection comes from the brand's connected accounts (GET /marketplaces/accounts).
 */
import { ComingSoon, MARKETPLACES, MarketplaceTile, NOT_YET, UnavailableHint } from '@/components/la'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { useCurrentMarketplaceAccounts } from '@/features/marketplaces/api'
import { draftClosedReason, draftOpen } from '@/features/marketplaces/meta'
import { cn } from '@/lib/utils'
import { API_MARKETPLACES, type Marketplace } from './catalog-model'

export function parseListOn(raw: string | undefined | null): Marketplace[] {
  if (!raw) return []
  const want = raw.split(',').map((s) => s.trim())
  return API_MARKETPLACES.filter((m) => want.includes(m))
}

export function serializeListOn(ms: readonly Marketplace[]): string | undefined {
  const kept = API_MARKETPLACES.filter((m) => ms.includes(m))
  return kept.length ? kept.join(',') : undefined
}

/** Marketplaces with a live (non-revoked) account; null while the accounts are loading. */
export function useConnectedMarketplaces(): { connected: Marketplace[] | null; error: unknown } {
  const q = useCurrentMarketplaceAccounts()
  if (!q.data) return { connected: q.error ? [] : null, error: q.error }
  return { connected: API_MARKETPLACES.filter((m) => q.data.live[m]?.status === 'active'), error: null }
}

export function ListOnPicker({
  value,
  onChange,
  connected,
  className,
}: {
  value: readonly Marketplace[]
  onChange: (v: Marketplace[]) => void
  connected: readonly Marketplace[] | null
  className?: string
}) {
  return (
    <fieldset className={className} aria-busy={connected === null ? true : undefined}>
      <legend className="font-display text-h3 text-ink">Sell on</legend>
      <div className="mt-3 flex flex-wrap gap-2.5">
        {MARKETPLACES.map((m) => {
          if (!m.supported) {
            // Meesho is on the roadmap (client input, 8 Nov): it says so. The others are not planned yet.
            const soon = m.id === 'meesho'
            return (
              <UnavailableHint key={m.id} reason={soon ? 'Meesho is coming soon. It can’t be chosen yet.' : `${m.name}: ${NOT_YET.waitlist}`}>
                <span
                  className={cn('flex h-11 items-center gap-2.5 rounded-control border border-dashed border-line-strong pl-2 font-medium text-ink-3', soon ? 'pr-3' : 'pr-4')}
                  data-testid={soon ? 'list-on-soon-meesho' : undefined}
                >
                  <MarketplaceTile id={m.id} size="sm" />
                  {m.short}
                  {soon ? <ComingSoon /> : null}
                </span>
              </UnavailableHint>
            )
          }
          // Accounts still loading: pre-selection is not known yet, so the choice waits for it.
          if (connected === null) return <Skeleton key={m.id} className="h-11 w-36 rounded-control" />
          const id = m.id as Marketplace
          if (!draftOpen(id, connected)) {
            return (
              <UnavailableHint key={m.id} reason={draftClosedReason(id)}>
                <span className="flex h-11 items-center gap-2.5 rounded-control border border-dashed border-line-strong pr-3 pl-2 font-medium text-ink-3" data-testid={`list-on-closed-${id}`}>
                  <MarketplaceTile id={m.id} size="sm" />
                  {m.name}
                  <ComingSoon />
                </span>
              </UnavailableHint>
            )
          }
          const on = value.includes(id)
          const notConnected = connected !== null && !connected.includes(id)
          return (
            <label
              key={m.id}
              className={cn(
                'tactile flex h-11 cursor-pointer items-center gap-2.5 rounded-control border pr-4 pl-3 font-medium text-ink',
                on
                  ? 'border-brand bg-brand-bg shadow-selected-inset'
                  : 'lift border-line-strong bg-surface shadow-raised-sm hover:border-ink-3',
              )}
            >
              <Checkbox
                checked={on}
                onCheckedChange={(v) => onChange(v ? [...value, id] : value.filter((x) => x !== id))}
                aria-label={notConnected ? `${m.name} (not connected)` : m.name}
              />
              <MarketplaceTile id={m.id} size="sm" />
              {m.name}
              {notConnected ? <span className="text-small text-ink-2">· not connected</span> : null}
            </label>
          )
        })}
      </div>
      <p className="mt-2 text-caption text-ink-3">
        Pre-selected from your connected marketplaces. A draft can be prepared before you connect; sending it needs a connection.
        Meesho is coming soon. Myntra, AJIO and Nykaa are not available yet.
      </p>
    </fieldset>
  )
}
