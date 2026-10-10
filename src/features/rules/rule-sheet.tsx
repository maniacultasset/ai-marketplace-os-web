import { Link } from '@tanstack/react-router'
import { Check, Copy, FileSearch, FlaskConical, Info } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { EmptyState } from '@/components/states/empty-state'
import { ErrorState } from '@/components/states/error-state'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { useCan } from '@/lib/permissions'
import { fieldLabel, RULE_TYPE_INFO, ruleTypeLabel, type Rule } from './labels'
import {
  CategoryText,
  EnabledDot,
  FieldChip,
  MarketplaceMark,
  MarketplaceTile,
  ScopeBadge,
  SeverityBadge,
} from './rule-badges'

export function RuleSheet({
  open,
  rule,
  loading,
  error,
  onRetry,
  onOpenChange,
  onShowCategory,
}: {
  open: boolean
  rule: Rule | undefined
  /** The list is still loading (or paging) and the rule may yet appear. */
  loading: boolean
  /** Loading the rules list failed before the rule was found. */
  error?: unknown
  onRetry?: () => void
  onOpenChange: (open: boolean) => void
  onShowCategory: (rule: Rule) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md" data-testid="rule-sheet">
        {rule ? (
          <RuleDetail rule={rule} onShowCategory={onShowCategory} />
        ) : error ? (
          <>
            <SheetHeader>
              <SheetTitle>Couldn't load this rule</SheetTitle>
              <SheetDescription>Loading the rules list failed, so the rule could not be looked up.</SheetDescription>
            </SheetHeader>
            <ErrorState compact error={error} onRetry={onRetry} title="Couldn't load rules" />
          </>
        ) : loading ? (
          <div className="space-y-4 p-6">
            <SheetHeader className="p-0">
              <SheetTitle>
                <Skeleton className="h-5 w-48" />
              </SheetTitle>
              <SheetDescription className="sr-only">Loading rule</SheetDescription>
            </SheetHeader>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle>Rule not in this view</SheetTitle>
              <SheetDescription>It is not among the loaded rules for the current filters.</SheetDescription>
            </SheetHeader>
            <EmptyState
              compact
              icon={FileSearch}
              title="Rule not found"
              description="It may belong to another marketplace or category, or be on a page you have not loaded yet."
              actions={
                <Button variant="outline" size="sm" asChild>
                  <Link to="/rules" search={{}}>
                    Show all rules
                  </Link>
                </Button>
              }
            />
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function RuleDetail({ rule, onShowCategory }: { rule: Rule; onShowCategory: (rule: Rule) => void }) {
  const can = useCan()
  const info = RULE_TYPE_INFO[rule.rule_type]
  const canCheck = can('listing:edit')
  return (
    <>
      <SheetHeader className="gap-3 border-b px-6 pt-6 pb-5">
        <div className="flex items-start gap-3 pr-8">
          <MarketplaceTile marketplace={rule.marketplace} className="mt-0.5 size-9 rounded-lg [&_svg]:size-4.5" />
          <div className="min-w-0 space-y-1">
            <SheetTitle className="text-lg leading-tight font-semibold tracking-[-0.02em]">
              {ruleTypeLabel(rule.rule_type)}
            </SheetTitle>
            <SheetDescription className="flex flex-wrap items-center gap-1.5">
              <span>on</span>
              <FieldChip>{rule.field}</FieldChip>
              {rule.field === '*' ? <span>(every text field)</span> : null}
            </SheetDescription>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <SeverityBadge severity={rule.severity} />
          <ScopeBadge scope={rule.scope} />
          {!rule.enabled ? <Badge variant="muted">Disabled</Badge> : null}
        </div>
      </SheetHeader>

      <div className="flex-1 space-y-7 px-6 py-6">
        <section className="space-y-2" aria-labelledby="rule-what">
          <h3 id="rule-what" className="text-[13px] font-semibold tracking-[-0.01em]">
            What it checks
          </h3>
          <p className="text-sm leading-relaxed text-pretty" data-testid="rule-sheet-what">
            {info?.checks ?? rule.rule_type}
          </p>
          <p className="text-[13px] text-muted-foreground">
            {rule.severity === 'error'
              ? 'A failure blocks the listing from passing validation.'
              : 'A failure is reported as a warning and does not block the listing.'}
          </p>
        </section>

        <section className="space-y-2" aria-labelledby="rule-def">
          <h3 id="rule-def" className="text-[13px] font-semibold tracking-[-0.01em]">
            Definition
          </h3>
          <dl className="divide-y border-y text-sm">
            <Row label="Marketplace">
              <MarketplaceMark marketplace={rule.marketplace} />
            </Row>
            <Row label="Category">
              <CategoryText category={rule.category} />
            </Row>
            <Row label="Field">
              <span className="font-mono text-[12.5px] break-all">{fieldLabel(rule.field)}</span>
            </Row>
            <Row label="Rule type">
              <code className="font-mono text-[12.5px]">{rule.rule_type}</code>
            </Row>
            <Row label="Severity">
              <span className="capitalize">{rule.severity}</span>
            </Row>
            <Row label="Version">
              <span className="tabular-nums">v{rule.version}</span>
            </Row>
            <Row label="Enabled">
              <EnabledDot enabled={rule.enabled} />
            </Row>
            <Row label="Scope">{rule.scope === 'tenant' ? 'This brand' : 'Platform (all brands)'}</Row>
            <Row label="Rule ID">
              <CopyId id={rule.id} />
            </Row>
          </dl>
          <p className="flex gap-2 rounded-lg bg-muted/60 px-3 py-2.5 text-[13px] leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              The API does not expose this rule’s parameters (limits, term lists, allowed values). Run a dry run to see
              exactly what it reports.
            </span>
          </p>
        </section>
      </div>

      {canCheck || rule.category ? (
        <div className="sticky bottom-0 flex flex-col gap-2 border-t bg-background px-6 py-4">
          {canCheck ? (
            <Button asChild>
              <Link
                to="/rules/check"
                search={{ marketplace: rule.marketplace, category: rule.category ?? undefined }}
                data-testid="rule-sheet-check"
              >
                <FlaskConical data-icon="inline-start" />
                Check a draft against {rule.category ? 'this category' : 'this marketplace'}
              </Link>
            </Button>
          ) : null}
          {rule.category ? (
            <Button variant="outline" onClick={() => onShowCategory(rule)} className="min-w-0">
              <span className="truncate">Show all {rule.category} rules</span>
            </Button>
          ) : null}
        </div>
      ) : null}
    </>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-x-4 py-2.5">
      <dt className="text-[13px] text-muted-foreground">{label}</dt>
      <dd className="min-w-0 [overflow-wrap:anywhere]">{children}</dd>
    </div>
  )
}

function CopyId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <span className="flex min-w-0 items-center justify-between gap-2">
      <code className="font-mono text-[12px] break-all text-foreground/90">{id}</code>
      <button
        type="button"
        aria-label="Copy rule ID"
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        onClick={() =>
          void navigator.clipboard
            ?.writeText(id)
            .then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            })
            .catch(() => undefined)
        }
      >
        {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
      </button>
    </span>
  )
}
