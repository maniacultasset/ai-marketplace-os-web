import { createFileRoute } from '@tanstack/react-router'
import { Page, PageHeader } from '@/components/app/page-header'
import { JobDetail } from '@/features/imports/job-detail'

export const Route = createFileRoute('/_app/jobs/$jobId')({ component: JobPage })

function JobPage() {
  const { jobId } = Route.useParams()
  return (
    <Page>
      <PageHeader
        title="Job"
        description="Status, timing and result of a background job."
        breadcrumbs={[{ label: 'Imports', to: '/imports' }, { label: 'Job' }]}
      />
      <JobDetail key={jobId} jobId={jobId} />
    </Page>
  )
}
