import { createFileRoute } from '@tanstack/react-router'
import { ProductsPage } from '@/features/products-add/products-page'

export const Route = createFileRoute('/_app/products/')({
  staticData: { title: 'Products', navCollapsed: true },
  component: ProductsPage,
})
