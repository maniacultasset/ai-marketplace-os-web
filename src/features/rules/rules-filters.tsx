import { Icon } from '@/components/la/icons'
import { useEffect, useId, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { RulesFilters } from '@/lib/query-keys'
import { cn } from '@/lib/utils'
import { CATEGORY_HINT, CATEGORY_RE, MARKETPLACE_LABEL, MARKETPLACES } from './labels'

const ANY = '__any'

/** Marketplace select + exact-category input. Both are server filters (GET /rules query). */
export function RulesFiltersBar({
  value,
  onChange,
  meta,
}: {
  value: RulesFilters
  onChange: (next: RulesFilters) => void
  /** Result meta shown on the right (muted 12px). */
  meta?: ReactNode
}) {
  const [draft, setDraft] = useState(value.category ?? '')
  const [error, setError] = useState<string | null>(null)
  const inputId = useId()
  const hintId = useId()

  // Keep the input in sync with the URL (back/forward, links from elsewhere).
  useEffect(() => {
    setDraft(value.category ?? '')
    setError(null)
  }, [value.category])

  const applyCategory = () => {
    const next = draft.trim()
    if (next === (value.category ?? '')) {
      setError(null)
      return
    }
    if (next && !CATEGORY_RE.test(next)) {
      setError(CATEGORY_HINT)
      return
    }
    setError(null)
    onChange({ ...value, category: next || undefined })
  }

  const active = !!value.marketplace || !!value.category

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Select
          value={value.marketplace ?? ANY}
          onValueChange={(v) => onChange({ ...value, marketplace: v === ANY ? undefined : (v as RulesFilters['marketplace']) })}
        >
          <SelectTrigger className="w-full sm:w-44" aria-label="Marketplace" data-testid="filter-marketplace">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>All marketplaces</SelectItem>
            {MARKETPLACES.map((m) => (
              <SelectItem key={m} value={m}>
                {MARKETPLACE_LABEL[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <form
          className="flex w-full gap-2 sm:w-auto"
          onSubmit={(e) => {
            e.preventDefault()
            applyCategory()
          }}
        >
          <div className="relative w-full sm:w-72">
            <label htmlFor={inputId} className="sr-only">
              Category
            </label>
            <Icon
              name="search"
              size={16}
              className="pointer-events-none absolute top-1/2 left-2.5 z-10 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id={inputId}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value)
                if (error) setError(null)
              }}
              onBlur={applyCategory}
              placeholder="Exact category, e.g. home_decor_lamps"
              className={cn('pr-8 pl-8', error && 'border-destructive')}
              aria-invalid={!!error}
              aria-describedby={hintId}
              spellCheck={false}
              autoCapitalize="off"
              data-testid="filter-category"
            />
            {draft ? (
              <button
                type="button"
                aria-label="Clear category"
                className="absolute top-1/2 right-2 flex size-5 -translate-y-1/2 items-center justify-center tactile z-10 rounded text-muted-foreground hover:bg-hover hover:text-foreground active:bg-pressed focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setDraft('')
                  setError(null)
                  if (value.category) onChange({ ...value, category: undefined })
                }}
              >
                <Icon name="x" size={14} />
              </button>
            ) : null}
          </div>
          <Button type="submit" variant="outline" className="shrink-0">
            Apply
          </Button>
        </form>
        {active ? (
          <Button
            variant="ghost"
            className="self-start text-muted-foreground sm:self-auto"
            onClick={() => {
              setDraft('')
              setError(null)
              onChange({})
            }}
          >
            <Icon name="x" size={16} data-icon="inline-start" />
            Reset filters
          </Button>
        ) : null}
        {meta ? <div className="text-xs text-muted-foreground tabular-nums sm:ml-auto">{meta}</div> : null}
      </div>
      <p
        id={hintId}
        role={error ? 'alert' : undefined}
        className={cn(
          'text-xs',
          error ? 'text-destructive' : 'text-muted-foreground',
          // The default hint only matters while a category is applied; keep it for screen readers otherwise.
          !error && !value.category && 'sr-only',
        )}
        data-testid="category-hint"
      >
        {error ?? 'Category is an exact match. Rules that apply to every category are not included when it is set.'}
      </p>
    </div>
  )
}
