import { createFileRoute } from '@tanstack/react-router'
import { ProductDetail } from '@/features/products/product-detail'

export const Route = createFileRoute('/_app/products/$productId')({
  component: ProductDetailPage,
})

function ProductDetailPage() {
  const { productId } = Route.useParams()
  return <ProductDetail key={productId} productId={productId} />
}
