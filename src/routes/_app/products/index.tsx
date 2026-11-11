import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ProductsPage } from '@/features/products-add/products-page'
import { cleanProductsSearch, productsSearchSchema, type ProductsSearch } from '@/features/products-add/products-search'

export const Route = createFileRoute('/_app/products/')({
  staticData: { title: 'Products', navCollapsed: true },
  validateSearch: productsSearchSchema,
  component: ProductsRoute,
})

function ProductsRoute() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: '/products/' })
  // Filters replace the history entry: Back leaves Products instead of undoing each keystroke.
  const onSearch = (patch: Partial<ProductsSearch>) =>
    void navigate({ search: (s) => cleanProductsSearch({ ...s, ...patch }), replace: true })
  return <ProductsPage search={search} onSearch={onSearch} />
}
