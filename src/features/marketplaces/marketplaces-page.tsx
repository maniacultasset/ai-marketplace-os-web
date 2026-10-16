import { MarketplaceConnections } from '@/features/marketplaces-settings/marketplace-connections'
import { useMarketplaceAccounts, type Marketplace } from './api'
import { AccountsHistory } from './accounts-history'

/** /marketplaces: hi-fi 04 list + detail, then every connection ever made (all statuses). */
export function MarketplacesPage({ selected, onSelect }: { selected?: Marketplace; onSelect: (m: Marketplace) => void }) {
  const list = useMarketplaceAccounts()
  return (
    <div className="flex flex-col gap-10">
      <MarketplaceConnections selected={selected} onSelect={onSelect} />
      <section aria-labelledby="history-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="history-heading" className="font-display text-h3 text-ink">
            Connection history
          </h2>
          <p className="text-caption text-ink-3">All statuses, newest first</p>
        </div>
        <AccountsHistory list={list} />
      </section>
    </div>
  )
}
