import { createFileRoute } from '@tanstack/react-router'
import { Page, PageHeader } from '@/components/app/page-header'
import { ActivityView } from '@/features/marketplaces-settings/activity'

export const Route = createFileRoute('/_app/activity')({
  staticData: { title: 'Activity' },
  component: ActivityPage,
})

function ActivityPage() {
  return (
    <Page className="max-w-[1100px]">
      <PageHeader title="Activity" description="What the agent and your team did, listing by listing." />
      <ActivityView />
    </Page>
  )
}
