import { createFileRoute, Link } from '@tanstack/react-router'
import { FileUp } from 'lucide-react'
import { Page, PageHeader } from '@/components/app/page-header'
import { Button } from '@/components/ui/button'
import { ImportsHistory } from '@/features/imports/imports-history'
import { Can } from '@/lib/permissions'

export const Route = createFileRoute('/_app/imports/')({ component: ImportsPage })

function ImportsPage() {
  return (
    <Page>
      <PageHeader
        title="Imports"
        description="Bulk CSV uploads, their progress and row-level results."
        actions={
          <Can action="product:import">
            <Button asChild>
              <Link to="/imports/new">
                <FileUp data-icon="inline-start" />
                Import CSV
              </Link>
            </Button>
          </Can>
        }
      />
      <ImportsHistory />
    </Page>
  )
}
