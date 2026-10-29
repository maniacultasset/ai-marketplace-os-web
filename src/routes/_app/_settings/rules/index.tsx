import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { CONCEPT_ICON } from '@/components/la/concept-icons'
import { IconGlyph } from '@/components/la/icons'
import { z } from 'zod'
import { Page, PageHeader } from '@/components/app/page-header'
import { Button } from '@/components/ui/button'
import { Can } from '@/lib/permissions'
import type { RulesFilters } from '@/lib/query-keys'
import { CATEGORY_RE } from '@/features/rules/labels'
import { RuleSheet } from '@/features/rules/rule-sheet'
import { RulesTable } from '@/features/rules/rules-table'
import { useRulesList } from '@/features/rules/use-rules'

const searchSchema = z.object({
  marketplace: z.enum(['amazon', 'flipkart']).optional().catch(undefined),
  category: z.string().regex(CATEGORY_RE).optional().catch(undefined),
  rule: z.uuid().optional().catch(undefined),
})

export const Route = createFileRoute('/_app/_settings/rules/')({
  validateSearch: searchSchema,
  component: RulesPage,
})

function RulesPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: '/rules/' })
  const filters: RulesFilters = { marketplace: search.marketplace, category: search.category }
  const list = useRulesList(filters)

  const selected = search.rule ? list.rows.find((r) => r.id === search.rule) : undefined
  const { hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage } = list
  // The first page or a later page failed while the rule is still unseen: show that error, not "not found".
  const lookupError = !selected && list.isError && !list.isFetching ? list.error : null
  const stillLooking = !lookupError && (list.isPending || isFetchingNextPage || (!selected && !!hasNextPage))

  // A deep link (?rule=) to a rule beyond the first page: keep paging until it is found.
  useEffect(() => {
    if (search.rule && !selected && hasNextPage && !isFetchingNextPage && !isFetchNextPageError) void fetchNextPage()
  }, [search.rule, selected, hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage])

  const setFilters = (next: RulesFilters) =>
    void navigate({ search: { marketplace: next.marketplace, category: next.category }, replace: false })

  return (
    <Page>
      <PageHeader
        title="Rules"
        description="Checks a listing must pass before it can go live on each marketplace. Platform rules apply to every brand; brand rules only to yours."
        actions={
          <Can action="listing:edit">
            <Button asChild>
              <Link
                to="/rules/check"
                search={{ marketplace: search.marketplace, category: search.category }}
                data-testid="check-draft"
              >
                <IconGlyph icon={CONCEPT_ICON.dryRun} size={16} />
                Check a draft
              </Link>
            </Button>
          </Can>
        }
      />
      <RulesTable
        list={list}
        filters={filters}
        onFiltersChange={setFilters}
        onOpenRule={(r) => void navigate({ search: (s) => ({ ...s, rule: r.id }) })}
      />
      <RuleSheet
        open={!!search.rule}
        rule={selected}
        loading={stillLooking}
        error={lookupError}
        onRetry={() => void (isFetchNextPageError ? fetchNextPage() : list.refetch())}
        onOpenChange={(open) => {
          if (!open) void navigate({ search: (s) => ({ ...s, rule: undefined }), replace: true })
        }}
        onShowCategory={(r) =>
          void navigate({ search: { marketplace: r.marketplace, category: r.category ?? undefined } })
        }
      />
    </Page>
  )
}
