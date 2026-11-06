import { createFileRoute, Link } from '@tanstack/react-router'
import { Icon } from '@/components/la/icons'
import { Page, PageHeader } from '@/components/app/page-header'
import { Button } from '@/components/ui/button'
import { ImportsHistory } from '@/features/imports/imports-history'
import { Can } from '@/lib/permissions'

export const Route = createFileRoute('/_app/imports/')({ staticData: { title: 'Imports' }, component: ImportsPage })

function ImportsPage() {
  return (
    <Page>
      <PageHeader
        title="Imports"
        description="Spreadsheet uploads, their progress and row results."
        actions={
          <Can action="product:import">
            <Button asChild>
              <Link to="/imports/new">
                <Icon name="upload" size={16} data-icon="inline-start" />
                Import spreadsheet
              </Link>
            </Button>
          </Can>
        }
      />
      <ImportsHistory />
    </Page>
  )
}
