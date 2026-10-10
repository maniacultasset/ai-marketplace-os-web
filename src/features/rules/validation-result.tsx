import { Link } from '@tanstack/react-router'
import { motion } from 'motion/react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  CircleSlash,
  MinusCircle,
  Lightbulb,
  XCircle,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import type { ErrorItem } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { fieldLabel, MARKETPLACE_LABEL, ruleTypeLabel, type Rule } from './labels'
import type { ValidationResult } from './listing-form'
import { FieldChip, SeverityBadge } from './rule-badges'
import { useAllRules } from './use-rules'

type CheckStatus = 'disabled' | 'failed' | 'warning' | 'not-run' | 'replaced' | 'passed'

interface CheckedRule {
  rule: Rule
  hits: ErrorItem[]
  status: CheckStatus
  newer: Rule | undefined
}

/** Per-rule outcome for the rules that apply to the sent category. */
function useCheckedRules(rules: Rule[], items: ErrorItem[]): CheckedRule[] {
  return useMemo(() => {
    const byRule = new Map<string, ErrorItem[]>()
    for (const it of items) if (it.rule_id) byRule.set(it.rule_id, [...(byRule.get(it.rule_id) ?? []), it])
    const replacedBy = supersededRules(rules)
    return rules.map((r) => {
      const hits = byRule.get(r.id) ?? []
      const failed = hits.some((h) => h.severity !== 'warning')
      const warned = !failed && hits.length > 0
      // A rule with issues certainly ran. Otherwise say why a rule did not run before
      // claiming "No issues": the engine skips some types and fields in a dry run, and only
      // the highest enabled version in a rule group runs.
      const skipped = !hits.length && notEvaluatedInDryRun(r)
      const newer = !hits.length && !skipped ? replacedBy.get(r.id) : undefined
      const status: CheckStatus = !r.enabled
        ? 'disabled'
        : failed
          ? 'failed'
          : warned
            ? 'warning'
            : skipped
              ? 'not-run'
              : newer
                ? 'replaced'
                : 'passed'
      return { rule: r, hits, status, newer }
    })
  }, [rules, items])
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export function ValidationResultPanel({
  result,
  category,
  stale,
  onGoToField,
}: {
  result: ValidationResult
  /** Category sent with the draft (the result does not echo it). */
  category: string
  stale: boolean
  /** Returns true when the path maps to a form field (and focuses it). */
  onGoToField?: (path: string) => boolean
}) {
  const items = useMemo(() => result.report.errors ?? [], [result.report.errors])
  const errors = items.filter((i) => i.severity === 'error').length
  const warnings = items.length - errors

  const rules = useAllRules({ marketplace: result.marketplace })
  const ruleById = useMemo(() => new Map(rules.rows.map((r) => [r.id, r])), [rules.rows])
  const applicable = useMemo(
    () => rules.rows.filter((r) => r.category === category || r.category === null),
    [rules.rows, category],
  )
  const checked = useCheckedRules(applicable, items)
  const rulesLoading = !rules.complete && !rules.error
  const rulesError = !!rules.error && !rules.data

  const counts = useMemo(() => {
    const c = { failed: 0, warning: 0, passed: 0, skipped: 0 }
    for (const r of checked) {
      if (r.status === 'failed') c.failed++
      else if (r.status === 'warning') c.warning++
      else if (r.status === 'passed') c.passed++
      else c.skipped++
    }
    return c
  }, [checked])

  const groups = useMemo(() => {
    const m = new Map<string, ErrorItem[]>()
    for (const it of items) m.set(it.field, [...(m.get(it.field) ?? []), it])
    return [...m.entries()]
  }, [items])

  return (
    <motion.section
      key={`${result.created_at}`}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      aria-labelledby="dry-run-verdict"
      className="space-y-4"
      data-testid="dry-run-result"
    >
      <Card className="gap-0 py-0">
        <div className="flex items-start gap-3.5 p-5">
          <span
            aria-hidden
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset',
              result.passed
                ? 'bg-success/10 text-success ring-success/20'
                : 'bg-destructive/10 text-destructive ring-destructive/20',
            )}
          >
            {result.passed ? <CheckCircle2 className="size-5" /> : <XCircle className="size-5" />}
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <h2
              id="dry-run-verdict"
              className={cn(
                'text-xl leading-tight font-semibold tracking-[-0.02em]',
                result.passed ? 'text-success' : 'text-destructive',
              )}
              data-testid="dry-run-verdict"
            >
              {result.passed ? 'Pass' : 'Fail'}
            </h2>
            <p className="text-sm text-pretty text-muted-foreground">
              {result.passed
                ? warnings
                  ? `No blocking issues. ${plural(warnings, 'warning')} to review.`
                  : 'No issues found. This draft would pass validation.'
                : `${plural(errors, 'blocking issue')}${warnings ? ` and ${plural(warnings, 'warning')}` : ''}. Fix ${errors === 1 ? 'it' : 'them'} before publishing.`}
            </p>
          </div>
        </div>
        {!rulesLoading && !rulesError && checked.length ? (
          <ul
            className="flex flex-wrap gap-x-4 gap-y-1.5 border-t px-5 py-3 text-[13px] tabular-nums"
            aria-label="Rule outcomes"
            data-testid="dry-run-counts"
          >
            <CountItem tone="danger" label="failed" n={counts.failed} />
            {counts.warning ? <CountItem tone="warning" label="warned" n={counts.warning} /> : null}
            <CountItem tone="success" label="passed" n={counts.passed} />
            {counts.skipped ? <CountItem tone="muted" label="not run" n={counts.skipped} /> : null}
          </ul>
        ) : null}
        <dl className="flex flex-wrap gap-x-6 gap-y-2.5 border-t bg-muted/40 px-5 py-3 text-xs">
          <Stat label="Marketplace" value={MARKETPLACE_LABEL[result.marketplace]} />
          <Stat label="Category" value={category} title={category} />
          <Stat label="Rules version" value={result.rules_version != null ? `v${result.rules_version}` : '—'} />
          <Stat label="Took" value={`${result.duration_ms} ms`} />
        </dl>
      </Card>

      {stale ? (
        <p className="flex items-center gap-2 rounded-lg bg-warning/10 px-3 py-2 text-[13px] text-foreground ring-1 ring-warning/25 ring-inset">
          <CircleDashed className="size-3.5 shrink-0 text-warning" aria-hidden />
          The draft changed since this check. Run it again to see the current result.
        </p>
      ) : null}

      {items.length ? (
        <Card className="gap-0 py-0">
          <div className="flex items-baseline justify-between gap-2 px-5 pt-4 pb-3">
            <h3 className="text-[0.9375rem] font-semibold tracking-tight">Issues</h3>
            <span className="text-xs text-muted-foreground tabular-nums">
              {plural(items.length, 'issue')} in {plural(groups.length, 'field')}
            </span>
          </div>
          <ul className="divide-y border-t" data-testid="dry-run-issues">
            {groups.map(([field, list]) => (
              <li key={field} className="px-5 py-3.5">
                <div className="flex items-center justify-between gap-2">
                  <FieldChip title={field}>{fieldLabel(field)}</FieldChip>
                  {onGoToField ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="-mr-2 h-7 shrink-0 px-2 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => onGoToField(field)}
                    >
                      Edit field
                      <ChevronRight data-icon="inline-end" />
                    </Button>
                  ) : null}
                </div>
                <ul className="mt-2.5 space-y-3">
                  {list.map((it, i) => (
                    <IssueRow
                      key={`${it.rule_id ?? 'tpl'}-${i}`}
                      item={it}
                      rule={it.rule_id ? ruleById.get(it.rule_id) : undefined}
                    />
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <RulesChecked checked={checked} loading={rulesLoading} error={rulesError} />
    </motion.section>
  )
}

const TONE_DOT = {
  danger: 'bg-destructive',
  warning: 'bg-warning',
  success: 'bg-success',
  muted: 'bg-muted-foreground/50',
} as const

function CountItem({ tone, label, n }: { tone: keyof typeof TONE_DOT; label: string; n: number }) {
  return (
    <li className="inline-flex items-center gap-1.5">
      <span aria-hidden className={cn('size-1.5 rounded-full', TONE_DOT[tone])} />
      <span className="font-medium text-foreground">{n}</span>
      <span className="text-muted-foreground">{label}</span>
    </li>
  )
}

function Stat({ label, value, title }: { label: string; value: ReactNode; title?: string }) {
  return (
    <div className="min-w-0 max-w-full space-y-0.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium tabular-nums" title={title}>
        {value}
      </dd>
    </div>
  )
}

function IssueRow({ item, rule }: { item: ErrorItem; rule: Rule | undefined }) {
  const [open, setOpen] = useState(false)
  return (
    <li className="space-y-1.5" data-testid="dry-run-issue" data-code={item.error_code} data-field={item.field}>
      <div className="flex items-start gap-2.5">
        <SeverityBadge severity={item.severity ?? 'error'} />
        <p className="min-w-0 flex-1 text-sm leading-5 font-medium text-pretty first-letter:uppercase">{item.message}</p>
      </div>
      {item.suggestion ? (
        <p className="flex gap-2 text-[13px] leading-relaxed text-muted-foreground">
          <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
          <span>{item.suggestion}</span>
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-0.5 text-xs text-muted-foreground">
        <code className="font-mono text-[11px]">{item.error_code}</code>
        {item.error_class ? <span>{item.error_class.replace(/_/g, ' ')}</span> : null}
        {item.rule_id ? (
          <Link
            to="/rules"
            // Filter by the rule's own category: GET /rules matches category exactly, and a
            // category-wide rule (category null) only shows up with no category filter.
            search={{
              marketplace: rule?.marketplace ?? item.marketplace ?? undefined,
              category: rule?.category ?? undefined,
              rule: item.rule_id,
            }}
            data-testid="issue-rule-link"
            className="rounded-sm text-brand underline-offset-4 transition-colors duration-150 hover:underline focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            Rule: {rule ? ruleTypeLabel(rule.rule_type) : item.rule_id.slice(0, 8)}
            {rule ? ` · v${rule.version}` : ''}
          </Link>
        ) : (
          <span>Category template check</span>
        )}
        {item.value_submitted != null ? (
          <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
              className="rounded-sm underline-offset-4 transition-colors duration-150 hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {open ? 'Hide submitted value' : 'Show submitted value'}
            </button>
        ) : null}
      </div>
      {item.value_submitted != null && open ? (
        <pre className="max-h-40 overflow-auto rounded-md bg-muted px-2.5 py-2 font-mono text-[11px] break-all whitespace-pre-wrap">
          {item.value_submitted}
        </pre>
      ) : null}
    </li>
  )
}

const STATUS_ICON: Record<CheckStatus, ReactNode> = {
  disabled: <CircleSlash className="size-4 shrink-0 text-muted-foreground" aria-hidden />,
  failed: <XCircle className="size-4 shrink-0 text-destructive" aria-hidden />,
  warning: <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden />,
  'not-run': <MinusCircle className="size-4 shrink-0 text-muted-foreground" aria-hidden />,
  replaced: <MinusCircle className="size-4 shrink-0 text-muted-foreground" aria-hidden />,
  passed: <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />,
}

function RulesChecked({ checked, loading, error }: { checked: CheckedRule[]; loading: boolean; error: boolean }) {
  return (
    <Card className="gap-0 py-0">
      <div className="flex items-baseline justify-between gap-2 px-5 pt-4 pb-3">
        <h3 className="text-[0.9375rem] font-semibold tracking-tight">Rules for this category</h3>
        {!loading && !error && checked.length ? (
          <span className="text-xs text-muted-foreground tabular-nums">{plural(checked.length, 'rule')}</span>
        ) : null}
      </div>
      {loading ? (
        <div className="space-y-2 border-t px-5 py-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : error ? (
        <p className="border-t px-5 py-3 text-[13px] text-muted-foreground">
          Couldn't load the rule list. The result above is still complete.
        </p>
      ) : checked.length === 0 ? (
        <p className="border-t px-5 py-3 text-[13px] text-muted-foreground">
          No rules are listed for this marketplace and category.
        </p>
      ) : (
        <ul className="divide-y border-t text-sm" data-testid="rules-checked">
          {checked.map(({ rule: r, hits, status, newer }) => (
            <li
              key={r.id}
              className="flex items-center gap-3 px-5 py-2.5"
              data-testid="rule-checked"
              data-rule-id={r.id}
              data-status={status}
            >
              {STATUS_ICON[status]}
              <span className="min-w-0 flex-1">
                <span className="block truncate">
                  {ruleTypeLabel(r.rule_type)}
                  <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">v{r.version}</span>
                </span>
                <code className="block truncate font-mono text-[11px] text-muted-foreground">{fieldLabel(r.field)}</code>
              </span>
              <span
                className={cn(
                  'shrink-0 text-xs',
                  status === 'failed' ? 'font-medium text-destructive' : status === 'warning' ? 'font-medium text-warning' : 'text-muted-foreground',
                )}
                title={
                  status === 'not-run'
                    ? 'Dry runs do not evaluate image, fact-source or fact-backed rules, or rules on product facts, brand, variants or file data.'
                    : status === 'replaced'
                      ? `Only the highest enabled version of a rule runs; v${newer?.version} replaces this one.`
                      : undefined
                }
              >
                {status === 'disabled'
                  ? 'Disabled'
                  : status === 'failed'
                    ? plural(hits.length, 'issue')
                    : status === 'warning'
                      ? 'Warning'
                      : status === 'not-run'
                        ? 'Not run in a dry run'
                        : status === 'replaced'
                          ? `Replaced by v${newer?.version}`
                          : 'No issues'}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="border-t bg-muted/40 px-5 py-3 text-xs leading-relaxed text-muted-foreground">
        Rules that depend on images, product facts or account data do not run in a dry run. When a rule has several
        enabled versions, only the highest one runs.
      </p>
    </Card>
  )
}

/** Rule types the dry-run engine never evaluates (backend `rules_engine/evaluators.py` NOT_EVALUATED). */
const NOT_EVALUATED_TYPES: ReadonlySet<string> = new Set(['image_requirement', 'fact_source', 'fact_backed_attribute'])
/** Rule fields the engine cannot read in a dry run (backend `rules_engine/text.py` NOT_LISTING_ROOTS, plus `listing`). */
const NOT_LISTING_ROOTS = ['facts.', 'brand.', 'variants', 'request', 'file.header', 'file.row'] as const

function notEvaluatedInDryRun(r: Rule): boolean {
  return (
    NOT_EVALUATED_TYPES.has(r.rule_type) || r.field === 'listing' || NOT_LISTING_ROOTS.some((p) => r.field.startsWith(p))
  )
}

/**
 * Rule types whose group subject (backend resolver `subject_of`) is fully implied by the field:
 * none, or the attribute that the field names. For the others (cross_field, pattern, claim,
 * image) the subject is a rule parameter the API does not return, so two rows with the same
 * field and type may be different rules that both run; those are never marked replaced.
 */
const GROUP_BY_FIELD: ReadonlySet<string> = new Set([
  'max_length',
  'min_length',
  'banned_terms',
  'max_items',
  'min_items',
  'required_attribute',
  'allowed_values',
  'conditional_required',
  'fact_source',
  'fact_backed_attribute',
])

/**
 * Mirrors the backend RuleSetResolver: rows group by (owner, field, type, subject); in each
 * group the category rows are used if any is enabled, else the category-wide rows, and the
 * highest enabled version wins. Returns each enabled rule that does not run, mapped to the
 * rule that replaces it.
 */
function supersededRules(rules: Rule[]): Map<string, Rule> {
  const groups = new Map<string, Rule[]>()
  for (const r of rules) {
    if (!GROUP_BY_FIELD.has(r.rule_type)) continue
    const k = `${r.scope}|${r.field}|${r.rule_type}`
    groups.set(k, [...(groups.get(k) ?? []), r])
  }
  const out = new Map<string, Rule>()
  const top = (rows: Rule[]) =>
    rows.filter((r) => r.enabled).reduce<Rule | undefined>((a, r) => (!a || r.version > a.version ? r : a), undefined)
  for (const rows of groups.values()) {
    const winner = top(rows.filter((r) => r.category !== null)) ?? top(rows.filter((r) => r.category === null))
    if (!winner) continue
    for (const r of rows) if (r.enabled && r.id !== winner.id) out.set(r.id, winner)
  }
  return out
}
