import { useIsFetching, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { Page, PageHeader } from '@/components/app/page-header'
import { Icon } from '@/components/la/icons'
import { RequireAction } from '@/components/states/require-action'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { QUEUE_TABS, type QueueTab } from '@/features/signup-admin/format'
import { SignupQueue } from '@/features/signup-admin/signup-queue'
import { useKeys } from '@/lib/query-keys'

const searchSchema = z.object({ status: z.enum(QUEUE_TABS).optional().catch(undefined) })

export const Route = createFileRoute('/_app/admin/signups')({
  staticData: { title: 'Sign-up requests' },
  validateSearch: searchSchema,
  component: SignupsPage,
})

/** Platform admins only (GET /auth/me is_platform_admin); everyone else sees Forbidden. */
function SignupsPage() {
  const { status } = Route.useSearch()
  const tab: QueueTab = status ?? 'pending'
  const navigate = useNavigate({ from: Route.fullPath })
  return (
    <Page>
      <RequireAction action="platform:admin">
        <PageHeader
          title="Sign-up requests"
          description="Brands asking for a workspace, oldest first. Approving creates a trial workspace and its owner."
          actions={<RefreshButton />}
        />
        <SignupQueue
          tab={tab}
          onTabChange={(next) => void navigate({ search: { status: next === 'pending' ? undefined : next }, replace: true })}
        />
      </RequireAction>
    </Page>
  )
}

function RefreshButton() {
  const qc = useQueryClient()
  const keys = useKeys()
  const fetching = useIsFetching({ queryKey: keys.signups.all() }) > 0
  return (
    <Button variant="outline" size="sm" onClick={() => void qc.invalidateQueries({ queryKey: keys.signups.all() })} disabled={fetching}>
      {fetching ? <Spinner data-icon="inline-start" /> : <Icon name="refresh" size={16} data-icon="inline-start" />}
      Refresh
    </Button>
  )
}
