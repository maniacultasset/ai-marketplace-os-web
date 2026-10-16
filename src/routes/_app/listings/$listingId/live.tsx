import { createFileRoute } from '@tanstack/react-router'
import { LiveScreen } from '@/features/listing-flow/live'

// 14 Live confirmation: "Live" only with proof (marketplace state, listing ID, confirmed time).
export const Route = createFileRoute('/_app/listings/$listingId/live')({
  staticData: { title: 'Products' },
  component: LivePage,
})

function LivePage() {
  const { listingId } = Route.useParams()
  return <LiveScreen key={listingId} listingId={listingId} />
}
