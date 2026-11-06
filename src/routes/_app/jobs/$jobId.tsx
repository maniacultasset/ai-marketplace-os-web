import { createFileRoute } from '@tanstack/react-router'
import { Page } from '@/components/app/page-header'
import { JobDetail } from '@/features/imports/job-detail'

export const Route = createFileRoute('/_app/jobs/$jobId')({ component: JobPage })

/** The header lives in JobDetail: its breadcrumb and action depend on the job's kind. */
function JobPage() {
  const { jobId } = Route.useParams()
  return (
    <Page>
      <JobDetail key={jobId} jobId={jobId} />
    </Page>
  )
}
