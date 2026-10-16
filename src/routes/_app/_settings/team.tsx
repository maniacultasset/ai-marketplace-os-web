import { createFileRoute } from '@tanstack/react-router'
import { Page, PageHeader } from '@/components/app/page-header'
import { RequireAction } from '@/components/states/require-action'
import { MembersTable } from '@/features/team-account/members-table'
import { RolesLegend } from '@/features/team-account/roles-legend'
import { tenantName, useMe } from '@/lib/auth'

export const Route = createFileRoute('/_app/_settings/team')({ staticData: { title: 'Settings' }, component: TeamPage })

function TeamPage() {
  const { data: me } = useMe()
  return (
    <Page>
      <RequireAction action="team:manage">
        <PageHeader
          title="Team and brands"
          description={`People with access to ${tenantName(me) || 'this brand'}. Role and status changes apply on their next request.`}
        />
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 2xl:grid-cols-[minmax(0,1fr)_18rem]">
          <MembersTable />
          <RolesLegend className="2xl:mt-7" />
        </div>
      </RequireAction>
    </Page>
  )
}
