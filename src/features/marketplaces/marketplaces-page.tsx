import { Info } from 'lucide-react'
import { ErrorState } from '@/components/states/error-state'
import { Card } from '@/components/ui/card'
import { useCan } from '@/lib/permissions'
import { useCurrentMarketplaceAccounts, useMarketplaceAccounts } from './api'
import { AccountsHistory } from './accounts-history'
import { MarketplaceCard, MarketplaceCardSkeleton } from './marketplace-card'
import { MARKETPLACES } from './meta'

export function MarketplacesPage() {
  // Cards come from their own query (pages until each marketplace's live account is found), so
  // they never depend on how far the History table below has been paged.
  const current = useCurrentMarketplaceAccounts()
  const list = useMarketplaceAccounts()
  const can = useCan()

  const error = (current.error && !current.data ? current.error : null) ?? (list.error && !list.data ? list.error : null)
  if (error) {
    return (
      <Card className="py-0">
        <ErrorState
          error={error}
          title="Couldn't load marketplace accounts"
          onRetry={() => {
            if (current.error) void current.refetch()
            if (list.error) void list.refetch()
          }}
        />
      </Card>
    )
  }

  return (
    <div className="space-y-10">
      <section aria-label="Marketplace connections" className="space-y-3.5">
        <div className="grid gap-4 md:grid-cols-2">
          {MARKETPLACES.map((mp) =>
            !current.data ? (
              <MarketplaceCardSkeleton key={mp} />
            ) : (
              <MarketplaceCard
                key={mp}
                marketplace={mp}
                account={current.data.live[mp]}
                previous={current.data.previous[mp]}
              />
            ),
          )}
        </div>
        {can('marketplace:connect') ? (
          <p className="flex items-start gap-1.5 px-0.5 text-xs text-muted-foreground">
            <Info className="mt-px size-3.5 shrink-0" aria-hidden />
            Connecting opens the marketplace to approve access, then returns here. If connecting failed, click Connect
            again.
          </p>
        ) : null}
      </section>

      <section aria-labelledby="history-heading" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="history-heading" className="text-[0.9375rem] font-semibold tracking-[-0.01em]">
            Connection history
          </h2>
          <p className="text-xs text-muted-foreground">All statuses, newest first</p>
        </div>
        <AccountsHistory list={list} />
      </section>
    </div>
  )
}
