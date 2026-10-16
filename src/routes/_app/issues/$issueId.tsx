import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { IssueDetailPage } from '@/features/home-inbox/issue-detail-page'

const searchSchema = z.object({
  /** The issue's listing (the API has no GET /issues/{id}; the issue is found among its listing's issues). */
  listing: z.uuid().optional().catch(undefined),
})

// Owner: home-inbox. Hi-fi 16 Issue detail (docs/DESIGN.md).
export const Route = createFileRoute('/_app/issues/$issueId')({
  // p16: an issue belongs to a product, so Products is the active section and the topbar title.
  staticData: { title: 'Products' },
  validateSearch: searchSchema,
  component: IssueRoute,
})

function IssueRoute() {
  const { issueId } = Route.useParams()
  const { listing } = Route.useSearch()
  return <IssueDetailPage key={issueId} issueId={issueId} listingId={listing} />
}
