import { createFileRoute } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'
import { z } from 'zod'
import { RequireAction } from '@/components/states/require-action'
import { GuidedForm } from '@/features/products-add/guided-form'
import { parseListOn } from '@/features/products-add/list-on'

const searchSchema = z.object({
  /** Marketplaces chosen on /add ("amazon,flipkart"). */
  on: z.string().optional().catch(undefined),
  /** "photos": open on the Images section ("Photos and basics" on /add and Home). */
  start: z.enum(['photos']).optional().catch(undefined),
})

export const Route = createFileRoute('/_app/add/guided')({
  staticData: { title: 'Add products' },
  validateSearch: zodValidator(searchSchema),
  component: GuidedRoute,
})

function GuidedRoute() {
  const { on, start } = Route.useSearch()
  return (
    <RequireAction action="product:import">
      <GuidedForm listOn={parseListOn(on)} startAt={start === 'photos' ? 'media' : undefined} />
    </RequireAction>
  )
}
