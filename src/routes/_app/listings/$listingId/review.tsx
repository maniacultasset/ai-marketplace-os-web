import { createFileRoute } from '@tanstack/react-router'
import { ReviewScreen } from '@/features/listing-flow/review'

// 13 Review and approve (approval is always on in v1); see features/listing-flow.
export const Route = createFileRoute('/_app/listings/$listingId/review')({
  staticData: { title: 'Review and approve' },
  component: ReviewPage,
})

function ReviewPage() {
  const { listingId } = Route.useParams()
  return <ReviewScreen key={listingId} listingId={listingId} />
}
