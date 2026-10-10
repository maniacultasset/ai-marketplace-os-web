import { ListChecks } from 'lucide-react'
import { columnHelper, DataTable } from '@/components/data-table'
import { EmptyState } from '@/components/states/empty-state'
import { Button } from '@/components/ui/button'
import type { RulesFilters } from '@/lib/query-keys'
import { fieldLabel, ruleTypeLabel, type Rule } from './labels'
import { CategoryText, EnabledDot, MarketplaceMark, ScopeBadge, SeverityBadge } from './rule-badges'
import { RulesFiltersBar } from './rules-filters'
import type { useRulesList } from './use-rules'

const col = columnHelper<Rule>()
const columns = col.columns([
  col.accessor('marketplace', {
    header: 'Marketplace',
    cell: (c) => <MarketplaceMark marketplace={c.getValue()} compact />,
    meta: { className: 'w-10 sm:w-32' },
  }),
  col.accessor('category', {
    header: 'Category',
    cell: (c) => <CategoryText category={c.getValue()} />,
    meta: { className: 'hidden md:table-cell' },
  }),
  col.accessor('field', {
    header: 'Field',
    cell: (c) => (
      <code className="font-mono text-[12.5px] text-foreground/90" title={fieldLabel(c.getValue())}>
        {c.getValue()}
      </code>
    ),
    meta: { className: 'max-w-32 truncate sm:max-w-56' },
  }),
  col.accessor('rule_type', {
    header: 'Rule type',
    // A real button so keyboard users can open the row (its click bubbles to the row handler).
    cell: (c) => (
      <button
        type="button"
        className="rounded-sm text-left font-medium whitespace-nowrap underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {ruleTypeLabel(c.getValue())}
      </button>
    ),
  }),
  col.accessor('severity', {
    header: 'Severity',
    cell: (c) => <SeverityBadge severity={c.getValue()} />,
    meta: { className: 'hidden w-24 sm:table-cell' },
  }),
  col.accessor('version', {
    header: 'Version',
    cell: (c) => <span className="text-muted-foreground tabular-nums">v{c.getValue()}</span>,
    meta: { className: 'hidden w-20 lg:table-cell' },
  }),
  col.accessor('enabled', {
    header: 'Enabled',
    cell: (c) => <EnabledDot enabled={c.getValue()} />,
    meta: { className: 'hidden w-20 sm:table-cell' },
  }),
  col.accessor('scope', {
    header: 'Scope',
    cell: (c) => <ScopeBadge scope={c.getValue()} />,
    meta: { className: 'hidden w-24 lg:table-cell' },
  }),
])

export function RulesTable({
  list,
  filters,
  onFiltersChange,
  onOpenRule,
}: {
  list: ReturnType<typeof useRulesList>
  filters: RulesFilters
  onFiltersChange: (next: RulesFilters) => void
  onOpenRule: (rule: Rule) => void
}) {
  const filtered = !!filters.marketplace || !!filters.category
  const n = list.rows.length
  const meta =
    list.isPending || (list.isError && !list.data)
      ? null
      : `${n.toLocaleString()}${list.hasNextPage ? '+' : ''} rule${n === 1 && !list.hasNextPage ? '' : 's'}`
  return (
    <DataTable
      label="Rules"
      list={list}
      columns={columns}
      getRowId={(r) => r.id}
      onRowClick={onOpenRule}
      toolbar={<RulesFiltersBar value={filters} onChange={onFiltersChange} meta={meta} />}
      empty={
        filtered ? (
          <EmptyState
            compact
            icon={ListChecks}
            title="No rules match these filters"
            description={
              filters.category
                ? `No rules are set for category ${filters.category}${filters.marketplace ? ' on this marketplace' : ''}. Category must match exactly.`
                : 'No rules are set for this marketplace.'
            }
            actions={
              <Button variant="outline" size="sm" onClick={() => onFiltersChange({})}>
                Reset filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            compact
            icon={ListChecks}
            title="No rules yet"
            description="Platform and brand rules appear here once they are set up."
          />
        )
      }
    />
  )
}
