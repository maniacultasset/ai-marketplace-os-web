import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { Page, PageHeader } from '@/components/app/page-header'
import { CONCEPT_ICON } from '@/components/la/concept-icons'
import { IconGlyph } from '@/components/la/icons'
import { RequireAction } from '@/components/states/require-action'
import { Button } from '@/components/ui/button'
import { usePendingInvites } from '@/features/team-account/access-api'
import { InviteDialog } from '@/features/team-account/invite-dialog'
import { MembersTable } from '@/features/team-account/members-table'
import { PendingInvites } from '@/features/team-account/pending-invites'
import { RolesLegend } from '@/features/team-account/roles-legend'
import { useMembersList } from '@/features/team-account/use-members'
import { tenantName, useMe } from '@/lib/auth'
import { useCan } from '@/lib/permissions'

/** `?invite=1` opens "Invite a teammate" (the approver notice and Home link here). */
const searchSchema = z.object({ invite: z.coerce.number().int().optional().catch(undefined) })

export const Route = createFileRoute('/_app/_settings/team')({
  staticData: { title: 'Settings' },
  validateSearch: searchSchema,
  component: TeamPage,
})

function TeamPage() {
  const { data: me } = useMe()
  const can = useCan()
  const { invite } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const manages = can('team:manage')
  const members = useMembersList({ enabled: manages })
  const invites = usePendingInvites({ enabled: manages })
  const open = invite === 1 && manages
  const setOpen = (next: boolean) => void navigate({ search: next ? { invite: 1 } : {}, replace: true })

  return (
    <Page className="mx-0 max-w-[1100px]">
      <RequireAction action="team:manage">
        <PageHeader
          title="Team and brands"
          description={`People with access to ${tenantName(me) || 'this brand'}.`}
          actions={
            <Button onClick={() => setOpen(true)} data-testid="invite-open">
              <IconGlyph icon={CONCEPT_ICON.signups} size={16} />
              Invite a teammate
            </Button>
          }
        />
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 2xl:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="flex min-w-0 flex-col gap-6">
            <MembersTable />
            <PendingInvites list={invites} />
          </div>
          <RolesLegend className="2xl:mt-7" />
        </div>
        <InviteDialog open={open} onClose={() => setOpen(false)} members={members.rows} pending={invites.rows} />
      </RequireAction>
    </Page>
  )
}
