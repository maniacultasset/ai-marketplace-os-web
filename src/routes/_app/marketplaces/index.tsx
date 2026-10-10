import { createFileRoute } from '@tanstack/react-router'
import { Page, PageHeader } from '@/components/app/page-header'
import { MarketplacesPage } from '@/features/marketplaces/marketplaces-page'

export const Route = createFileRoute('/_app/marketplaces/')({ component: MarketplacesRoute })

function MarketplacesRoute() {
  return (
    <Page>
      <PageHeader
        title="Marketplaces"
        description="Seller accounts this brand publishes listings to. Tokens refresh automatically while a connection is active."
      />
      <MarketplacesPage />
    </Page>
  )
}
