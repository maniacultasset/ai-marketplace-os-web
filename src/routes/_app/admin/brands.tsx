import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { Page, PageHeader } from '@/components/app/page-header'
import { RequireAction } from '@/components/states/require-action'
import { TENANT_TABS, type TenantTab } from '@/features/signup-admin/tenants-model'
import { TenantsRefreshButton, TenantsTable } from '@/features/signup-admin/tenants-table'

const searchSchema = z.object({ status: z.enum(TENANT_TABS).optional().catch(undefined) })

/** Platform admins only (GET /auth/me is_platform_admin); everyone else sees Forbidden. */
export const Route = createFileRoute('/_app/admin/brands')({
  staticData: { title: 'Brands' },
  validateSearch: searchSchema,
  component: function BrandsPage() {
    const { status } = Route.useSearch()
    const tab: TenantTab = status ?? 'all'
    const navigate = useNavigate({ from: Route.fullPath })
    return (
      <Page>
        <RequireAction action="platform:admin">
          <PageHeader
            title="Brands"
            description="Every brand on Kuinn, newest first. Activate a brand, or give a trial more days."
            actions={<TenantsRefreshButton />}
          />
          <TenantsTable tab={tab} onTabChange={(next) => void navigate({ search: { status: next === 'all' ? undefined : next }, replace: true })} />
        </RequireAction>
      </Page>
    )
  },
})
