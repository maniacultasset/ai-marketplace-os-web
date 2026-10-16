/**
 * "List on" (hi-fi p08): which marketplaces the agent drafts for after a product is added.
 * Carried between the add screens in the `on` search param ("amazon,flipkart").
 * Only API marketplaces can be chosen; the others are shown disabled with the reason.
 * Pre-selection comes from the brand's connected accounts (GET /marketplaces/accounts).
 */
import { MARKETPLACES, MarketplaceTile, NOT_YET, UnavailableHint } from '@/components/la'
import { Checkbox } from '@/components/ui/checkbox'
import { useCurrentMarketplaceAccounts } from '@/features/marketplaces/api'
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
    <fieldset className={className}>
      <legend className="font-display text-h3 text-ink">List on</legend>
      <div className="mt-3 flex flex-wrap gap-2.5">
        {MARKETPLACES.map((m) => {
          if (!m.supported) {
            return (
              <UnavailableHint key={m.id} reason={`${m.name}: ${NOT_YET.waitlist}`}>
                <span className="flex h-11 items-center gap-2 rounded-control border border-line px-3 font-medium text-ink-3">
                  <span className="size-[18px] rounded-[5px] border border-line-strong bg-subtle" aria-hidden />
                  {m.short}
                </span>
              </UnavailableHint>
            )
          }
          const id = m.id as Marketplace
          const on = value.includes(id)
          const notConnected = connected !== null && !connected.includes(id)
          return (
            <label
              key={m.id}
              className={cn(
                'flex h-11 cursor-pointer items-center gap-2.5 rounded-control border bg-surface pr-4 pl-3 font-medium text-ink transition-[border-color,box-shadow] duration-150',
                on ? 'border-brand bg-brand-bg shadow-selected' : 'border-line-strong hover:border-ink-3',
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
        Myntra, AJIO, Meesho and Nykaa are not available yet.
      </p>
    </fieldset>
  )
}
