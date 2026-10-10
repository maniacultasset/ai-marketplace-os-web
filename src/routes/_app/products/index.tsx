import { createFileRoute, Link } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'
import { FileUp, Plus } from 'lucide-react'
import { z } from 'zod'
import { Page, PageHeader } from '@/components/app/page-header'
import { Button } from '@/components/ui/button'
import { MAX_PAGE_SIZE } from '@/features/products/api'
import { ProductsTable } from '@/features/products/products-table'
import { Can } from '@/lib/permissions'

const searchSchema = z.object({
  /** Page size override (backend `limit`, 1..200). Used by tests to exercise "Load more". */
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional().catch(undefined),
})

export const Route = createFileRoute('/_app/products/')({
  validateSearch: zodValidator(searchSchema),
  component: ProductsPage,
})

function ProductsPage() {
  const { pageSize } = Route.useSearch()
  return (
    <Page>
      <PageHeader
        title="Products"
        description="Every product in this brand, newest first."
        actions={
          <Can action="product:import">
            <Button variant="outline" asChild>
              <Link to="/imports/new">
                <FileUp data-icon="inline-start" />
                Import CSV
              </Link>
            </Button>
            <Button asChild>
              <Link to="/products/new" data-testid="new-product">
                <Plus data-icon="inline-start" />
                New product
              </Link>
            </Button>
          </Can>
        }
      />
      <ProductsTable pageSize={pageSize} />
    </Page>
  )
}
