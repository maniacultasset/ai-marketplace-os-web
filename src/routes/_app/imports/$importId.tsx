import { createFileRoute, Link } from '@tanstack/react-router'
import { Icon } from '@/components/la/icons'
import { zodValidator } from '@tanstack/zod-adapter'
import { z } from 'zod'
import { Page, PageHeader } from '@/components/app/page-header'
import { Button } from '@/components/ui/button'
import { useImportHistory } from '@/features/imports/history'
import { ImportReportView } from '@/features/imports/import-report'
import { Can } from '@/lib/permissions'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const searchSchema = z.object({
  job: z.string().regex(UUID).optional().catch(undefined),
  rows: z.enum(['all', 'failed', 'imported']).optional().catch(undefined),
})

export const Route = createFileRoute('/_app/imports/$importId')({
  validateSearch: zodValidator(searchSchema),
  component: ImportReportPage,
})

function ImportReportPage() {
  const { importId } = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const { entries } = useImportHistory()
  const entry = entries.find((e) => e.import_id === importId)
  const jobId = search.job ?? entry?.job_id ?? null

  return (
    <Page>
      <ImportReportView
        key={importId}
        importId={importId}
        jobId={jobId}
        tab={search.rows}
        onTabChange={(rows) => void navigate({ search: (s) => ({ ...s, rows }), replace: true })}
        onJobChange={(job) => void navigate({ search: (s) => ({ ...s, job, rows: undefined }), replace: true })}
        headerSlot={(actions) => (
          <PageHeader
            title={entry?.filename ?? 'Import report'}
            description={
              <>
                Import <span className="font-mono text-xs">{importId}</span>
              </>
            }
            breadcrumbs={[{ label: 'Imports', to: '/imports' }, { label: entry?.filename ?? 'Report' }]}
            actions={
              <>
                {actions}
                <Can action="product:import">
                  <Button variant="outline" asChild>
                    <Link to="/imports/new">
                      <Icon name="upload" size={16} data-icon="inline-start" />
                      New import
                    </Link>
                  </Button>
                </Can>
              </>
            }
          />
        )}
      />
    </Page>
  )
}
