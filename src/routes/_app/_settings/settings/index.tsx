import { createFileRoute } from '@tanstack/react-router'
import { AutonomySettings } from '@/features/marketplaces-settings/autonomy'

// Hi-fi 19 Settings: Autonomy. v1 truth: approval is always on (maker-checker); no settings API.
export const Route = createFileRoute('/_app/_settings/settings/')({
  staticData: { title: 'Settings' },
  component: () => (
    <div className="animate-page-in px-4 pt-5 pb-10 md:px-10 md:py-7">
      <AutonomySettings />
    </div>
  ),
})
