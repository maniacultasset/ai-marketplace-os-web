import { createFileRoute } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'
import { detailSearch } from '@/features/products-add/detail-tabs'
import { ProductDetailPage } from '@/features/products-add/product-detail-page'

export const Route = createFileRoute('/_app/products/$productId')({
  staticData: { title: 'Products' },
  validateSearch: zodValidator(detailSearch),
  component: ProductDetailRoute,
})

function ProductDetailRoute() {
  const { productId } = Route.useParams()
  const { tab } = Route.useSearch()
  return <ProductDetailPage key={productId} productId={productId} tab={tab ?? 'overview'} />
}
