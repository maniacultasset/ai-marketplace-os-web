import { createFileRoute } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'
import { z } from 'zod'
import { RequireAction } from '@/components/states/require-action'
import { parseListOn } from '@/features/products-add/list-on'
import { VariantsPage } from '@/features/products-add/variants-page'

const searchSchema = z.object({
  product: z.string().uuid().optional().catch(undefined),
  on: z.string().optional().catch(undefined),
})

export const Route = createFileRoute('/_app/add/variants')({
  staticData: { title: 'Add products' },
  validateSearch: zodValidator(searchSchema),
  component: VariantsRoute,
})

function VariantsRoute() {
  const { product, on } = Route.useSearch()
  return (
    <RequireAction action="product:import">
      <VariantsPage key={product ?? 'none'} productId={product ?? null} listOn={parseListOn(on)} />
    </RequireAction>
  )
}
