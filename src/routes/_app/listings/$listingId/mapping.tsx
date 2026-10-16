import { createFileRoute } from '@tanstack/react-router'
import { MappingScreen } from '@/features/listing-flow/mapping-view'

// 18 Mapping and validation, on the listing's own marketplace; see features/listing-flow.
export const Route = createFileRoute('/_app/listings/$listingId/mapping')({
  staticData: { title: 'Products' },
  component: MappingPage,
})

function MappingPage() {
  const { listingId } = Route.useParams()
  return <MappingScreen key={listingId} listingId={listingId} />
}
