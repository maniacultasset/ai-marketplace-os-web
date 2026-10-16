import { createFileRoute, Link } from '@tanstack/react-router'
import { Page, PageHeader } from '@/components/app/page-header'
import { RequireAction } from '@/components/states/require-action'
import { ProductForm } from '@/features/products/product-form'

export const Route = createFileRoute('/_app/products/new')({
  staticData: { title: 'Add products' },
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
            <Link to="/imports/new" className="text-brand underline-offset-4 hover:underline">
              import a CSV
            </Link>
            .
          </>
        }
        breadcrumbs={[{ label: 'Products', to: '/products' }, { label: 'New product' }]}
      />
      <div className="max-w-3xl">
        <RequireAction action="product:import">
          <ProductForm />
        </RequireAction>
      </div>
    </Page>
  )
}
