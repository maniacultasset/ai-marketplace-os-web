import { createFileRoute, Link } from '@tanstack/react-router'
import { Page, PageHeader } from '@/components/app/page-header'
import { RequireAction } from '@/components/states/require-action'
import { ProductForm } from '@/features/products/product-form'

export const Route = createFileRoute('/_app/products/new')({
  staticData: { title: 'New product' },
  component: NewProductPage,
})

function NewProductPage() {
  return (
    <Page>
      <PageHeader
        title="New product"
        description={
          <>
            Add one product by hand. For many at once,{' '}
            <Link to="/add/bulk" className="font-semibold text-brand underline-offset-4 hover:underline">
              upload a spreadsheet
            </Link>
            .
          </>
        }
        breadcrumbs={[{ label: 'Products', to: '/products' }, { label: 'New product' }]}
      />
      <div className="max-w-[720px]">
        <RequireAction action="product:import">
          <ProductForm />
        </RequireAction>
      </div>
    </Page>
  )
}
