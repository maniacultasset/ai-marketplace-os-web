import { createFileRoute } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'
import { z } from 'zod'
import { DETAIL_TABS } from '@/features/products-add/detail-tabs'
import { ProductDetailPage } from '@/features/products-add/product-detail-page'

const searchSchema = z.object({
  tab: z.enum(DETAIL_TABS).optional().catch(undefined),
})

export const Route = createFileRoute('/_app/products/$productId')({
  staticData: { title: 'Products' },
  validateSearch: zodValidator(searchSchema),
  component: ProductDetailRoute,
})

function ProductDetailRoute() {
  const { productId } = Route.useParams()
  const { tab } = Route.useSearch()
  return <ProductDetailPage key={productId} productId={productId} tab={tab ?? 'overview'} />
}
