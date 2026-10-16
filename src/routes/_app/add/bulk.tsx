import { createFileRoute } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'
import { z } from 'zod'
import { RequireAction } from '@/components/states/require-action'
import { BulkUpload } from '@/features/products-add/bulk-upload'
import { parseListOn } from '@/features/products-add/list-on'

const searchSchema = z.object({
  on: z.string().optional().catch(undefined),
  /** Set after upload: the import being checked (step 3). */
  import: z.string().uuid().optional().catch(undefined),
  job: z.string().uuid().optional().catch(undefined),
})

export const Route = createFileRoute('/_app/add/bulk')({
  staticData: { title: 'Add products' },
  validateSearch: zodValidator(searchSchema),
  component: BulkRoute,
})

function BulkRoute() {
  const s = Route.useSearch()
  return (
    <RequireAction action="product:import">
      <BulkUpload listOn={parseListOn(s.on)} importId={s.import ?? null} jobId={s.job ?? null} />
    </RequireAction>
  )
}
