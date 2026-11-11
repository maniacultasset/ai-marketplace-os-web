import { createFileRoute } from '@tanstack/react-router'
import { Page } from '@/components/app/page-header'
import { AutonomySettings } from '@/features/marketplaces-settings/autonomy'

// Hi-fi 19 Settings: Autonomy. v1 truth: approval is always on (maker-checker); the one setting is
// owner approval (#owner-approval, PATCH /tenants/me).
export const Route = createFileRoute('/_app/_settings/settings/')({
  staticData: { title: 'Settings' },
  component: () => (
    <Page className="mx-0 max-w-[1100px]">
      <AutonomySettings />
    </Page>
  ),
})
