import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { Page, PageHeader } from '@/components/app/page-header'
import { RequireAction } from '@/components/states/require-action'
import { DryRunTool } from '@/features/rules/dry-run-tool'
import { CATEGORY_RE } from '@/features/rules/labels'

const searchSchema = z.object({
  marketplace: z.enum(['amazon', 'flipkart']).optional().catch(undefined),
  category: z.string().regex(CATEGORY_RE).optional().catch(undefined),
  product: z.uuid().optional().catch(undefined),
})

export const Route = createFileRoute('/_app/_settings/rules/check')({
  validateSearch: searchSchema,
  component: RulesCheckPage,
})

function RulesCheckPage() {
  const search = Route.useSearch()
  return (
    <Page>
      <PageHeader
        title="Check a draft"
        description="Run a listing draft through the rules engine before it is generated or published. Nothing is saved."
        breadcrumbs={[{ label: 'Rules', to: '/rules' }, { label: 'Check a draft' }]}
      />
      <RequireAction action="listing:edit">
        <DryRunTool
          initial={{ marketplace: search.marketplace, category: search.category, productId: search.product }}
        />
      </RequireAction>
    </Page>
  )
}
