import { createFileRoute, Link } from '@tanstack/react-router'
import { z } from 'zod'
import { Page } from '@/components/app/page-header'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { ConfirmConnection } from '@/features/marketplaces/confirm-connection'

/** Landing page of the backend OAuth callback's 303 (`/marketplaces/connected?pending=<43 chars>`). */
const searchSchema = z.object({ pending: z.string().optional().catch(undefined) })

export const Route = createFileRoute('/_app/marketplaces/connected')({
  validateSearch: searchSchema,
  component: ConnectedRoute,
})

/** A focused status page: the card's heading is the page title, so there is no separate header. */
function ConnectedRoute() {
  const { pending } = Route.useSearch()
  return (
    <Page className="max-w-lg">
      <div className="flex flex-col gap-6 lg:pt-10">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/marketplaces">Marketplaces</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Connect</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <ConfirmConnection urlPending={pending} />
      </div>
    </Page>
  )
}
