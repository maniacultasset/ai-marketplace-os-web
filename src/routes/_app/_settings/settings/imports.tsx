import { createFileRoute, Link } from '@tanstack/react-router'
import { Page, PageHeader } from '@/components/app/page-header'
import { Icon } from '@/components/la/icons'
import { Button } from '@/components/ui/button'
import { ImportsHistory } from '@/features/imports/imports-history'
import { Can } from '@/lib/permissions'

/**
 * Settings → Imports history. The API has no "list imports" endpoint, so this is the uploads made
 * from this browser (features/imports/history.ts); each row reads GET /jobs/{id} and
 * GET /imports/{id} live. The table itself says "this browser only".
 */
export const Route = createFileRoute('/_app/_settings/settings/imports')({
  staticData: { title: 'Settings' },
  component: ImportsSettingsPage,
})

function ImportsSettingsPage() {
  return (
    <Page className="max-w-[1100px]">
      <PageHeader
        title="Imports history"
        description="Spreadsheet uploads made from this browser, their progress and row-level results."
        actions={
          <Can action="product:import">
            <Button variant="secondary" asChild>
              <Link to="/imports/new">
                <Icon name="upload" size={16} />
                Import a spreadsheet
              </Link>
            </Button>
          </Can>
        }
      />
      <ImportsHistory />
    </Page>
  )
}
