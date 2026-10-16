import { createFileRoute, Link } from '@tanstack/react-router'
import { Page, PageHeader } from '@/components/app/page-header'
import { Button } from '@/components/ui/button'
import { BrandPage } from '@/features/brand/brand-page'
import { Can } from '@/lib/permissions'

export const Route = createFileRoute('/_app/_settings/brand')({ staticData: { title: 'Settings' }, component: BrandRoute })

function BrandRoute() {
  return (
    <Page className="max-w-[1100px]">
      <PageHeader
        title="Brand profile"
        description="The voice and reference documents used when listings are written for this brand."
        actions={
          <Can action="settings:manage">
            <Button variant="secondary" asChild>
              <Link to="/setup/brand">Open brand setup</Link>
            </Button>
          </Can>
        }
      />
      <BrandPage />
    </Page>
  )
}
