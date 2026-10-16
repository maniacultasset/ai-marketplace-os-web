import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { Page, PageHeader } from '@/components/app/page-header'
import { MarketplacesPage } from '@/features/marketplaces/marketplaces-page'

/** `?mp=` keeps the selected marketplace across reloads and links (e.g. from an Inbox task). */
const searchSchema = z.object({ mp: z.enum(['amazon', 'flipkart']).optional().catch(undefined) })

export const Route = createFileRoute('/_app/marketplaces/')({
  staticData: { title: 'Marketplaces' },
  validateSearch: searchSchema,
  component: MarketplacesRoute,
})

function MarketplacesRoute() {
  const { mp } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  return (
    <Page className="max-w-[1180px]">
      <PageHeader
        title="Marketplaces"
        description="Seller accounts this brand publishes approved listings to. Access refreshes automatically while a connection is active."
      />
      <MarketplacesPage selected={mp} onSelect={(next) => void navigate({ search: { mp: next }, replace: true })} />
    </Page>
  )
}
