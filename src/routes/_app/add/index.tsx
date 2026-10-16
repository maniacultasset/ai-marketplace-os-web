import { createFileRoute } from '@tanstack/react-router'
import { RequireAction } from '@/components/states/require-action'
import { AddChooser } from '@/features/products-add/add-chooser'

export const Route = createFileRoute('/_app/add/')({
  staticData: { title: 'Add products' },
  component: () => (
    <RequireAction action="product:import">
      <AddChooser />
    </RequireAction>
  ),
})
