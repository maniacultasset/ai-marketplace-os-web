/**
 * "Issues and fixes" (client feedback item 20): every marketplace issue of one listing and each fix
 * Kuinn made, on the review and live screens. Three calm groups (Kuinn's fixes, Needs you, On the
 * marketplace side), plus Kuinn's own open work and its team's checks when there are any. A fix's
 * outcome sits on its line, so a refused or unsent fix never reads as done. Each line
 * shows the plain cause; the marketplace's code and words open on demand. The tries sit behind one
 * "Show history" toggle. Worded by issue-history-model.ts; shown only from the read, so a backend
 * without the route, or a listing with no marketplace issue, shows nothing.
 */
import { Link } from '@tanstack/react-router'
import { useId, useState, type ReactNode } from 'react'
import { Icon } from '@/components/la/icons'
import { LaCard } from '@/components/la/cards'
import { TagChip } from '@/components/la/status-chip'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useCan } from '@/lib/permissions'
import { toast, toastError } from '@/lib/toast'
import { useApplyFixes, useIssueHistory } from './api'
import { clock, mpName } from './format'
import { fixKindLabel, hasIssueHistory, issueHistoryView, type FixLine, type HistoryStep, type IssueHistoryView, type IssueLine, type Tone } from './issue-history-model'

/** Lines shown per group before "Show N more". */
const SHOWN = 3

const TONE_TEXT: Record<Tone, string> = {
  ok: 'text-success-ink',
  now: 'text-brand',
  need: 'text-attention-ink',
  bad: 'text-danger-ink',
  todo: 'text-ink-3',
}

/**
 * The card for one listing, from the read. `ready` holds it back until the screen's other cards
 * land (sections load in sync); `poll` re-reads it while Kuinn or the marketplace works.
 */
export function ListingIssuesAndFixes({
  listingId,
  marketplace,
  ready = true,
  poll = false,
  linkFields = true,
  skeleton = false,
}: {
  listingId: string
  marketplace: string
  ready?: boolean
  poll?: boolean
  linkFields?: boolean
  /** Hold the card's place while the read lands (screens where it sits above other cards). */
  skeleton?: boolean
}) {
  const q = useIssueHistory(listingId, { poll })
  if (q.isPending || !ready) return skeleton ? <IssuesAndFixesSkeleton /> : null
  if (!hasIssueHistory(q.data)) return null
  return <IssuesAndFixesCard view={issueHistoryView(q.data, marketplace)} marketplace={marketplace} listingId={listingId} linkFields={linkFields} />
}

export function IssuesAndFixesCard({
  view,
  marketplace,
  listingId,
  linkFields = true,
  className,
}: {
  view: IssueHistoryView
  marketplace: string
  listingId: string
  /** Link each "Needs you" field to the review (off on the review itself). */
  linkFields?: boolean
  className?: string
}) {
  const mp = mpName(marketplace)
  return (
    <LaCard className={cn('min-w-0', className)} data-testid="issues-and-fixes">
      <h3 className="text-h3 text-ink">Issues and fixes</h3>
      <p className="mt-1 text-small text-ink-2" data-testid="issues-summary">
        {view.summary}
      </p>
      {view.fixing.length ? (
        <Group title="Kuinn is fixing" testId="issues-fixing" count={view.fixing.length}>
          {view.fixing.map((i) => (
            <IssueItem key={i.id} issue={i} marketplace={marketplace} note="Kuinn is working on this." />
          ))}
        </Group>
      ) : null}
      {view.suggested.length ? (
        <Group
          title="Kuinn suggests"
          testId="issues-suggested"
          count={view.suggested.length}
          hint="Automatic fixes are off for this brand. Check each change, then apply them. Kuinn checks the listing again afterwards."
          footer={<ApplyFixes listingId={listingId} count={view.suggested.length} />}
        >
          {view.suggested.map((f) => (
            <FixItem key={f.id} fix={f} marketplace={marketplace} suggested />
          ))}
        </Group>
      ) : null}
      {view.fixed.length ? (
        <Group title="Kuinn's fixes" testId="issues-fixed" count={view.fixed.length}>
          {view.fixed.map((f) => (
            <FixItem key={f.id} fix={f} marketplace={marketplace} />
          ))}
        </Group>
      ) : null}
      {view.needsYou.length ? (
        <Group title="Needs you" testId="issues-needs-you" count={view.needsYou.length}>
          {view.needsYou.map((i) => (
            <IssueItem key={i.id} issue={i} marketplace={marketplace} showAction fieldLink={linkFields ? listingId : null} />
          ))}
        </Group>
      ) : null}
      {view.marketplace.length ? (
        <Group title={`On ${mp}'s side`} testId="issues-marketplace" count={view.marketplace.length} hint={`Kuinn cannot change these. Do this on ${mp}, then send the listing again.`}>
          {view.marketplace.map((i) => (
            <IssueItem key={i.id} issue={i} marketplace={marketplace} showAction />
          ))}
        </Group>
      ) : null}
      {view.team.length ? (
        <Group title="Kuinn's team is checking" testId="issues-team" count={view.team.length}>
          {view.team.map((i) => (
            <IssueItem key={i.id} issue={i} marketplace={marketplace} note="Nothing to do yet. Kuinn's team looks at this and tells you if you need to act." />
          ))}
        </Group>
      ) : null}
      {view.steps.length ? <History steps={view.steps} marketplace={marketplace} /> : null}
    </LaCard>
  )
}

/** Client item 20: the seller's go for the suggested fixes; only roles that edit listings see it. */
function ApplyFixes({ listingId, count }: { listingId: string; count: number }) {
  const can = useCan()
  const apply = useApplyFixes(listingId)
  if (!can('listing:edit')) return <p className="mt-2 text-caption text-ink-3">An owner or operator can apply these fixes.</p>
  return (
    <Button
      size="sm"
      className="mt-3"
      disabled={apply.isPending}
      onClick={() =>
        apply.mutate(undefined, {
          onSuccess: () => toast.success(count === 1 ? 'Fix applied' : 'Fixes applied', { description: 'Kuinn is checking the listing again.' }),
          onError: (e) => toastError(e, 'The fixes weren’t applied'),
        })
      }
      data-testid="apply-fixes"
    >
      {apply.isPending ? 'Applying…' : count === 1 ? 'Apply fix' : 'Apply fixes'}
    </Button>
  )
}

function Group({
  title,
  testId,
  count,
  hint,
  footer,
  children,
}: {
  title: string
  testId: string
  count: number
  hint?: string
  footer?: ReactNode
  children: ReactNode[]
}) {
  const [all, setAll] = useState(false)
  const listId = useId()
  const items = children.flat()
  const shown = all ? items : items.slice(0, SHOWN)
  const hidden = items.length - shown.length
  return (
    <section className="mt-4 border-t border-line pt-3" data-testid={testId} aria-labelledby={`${listId}-title`}>
      <h4 id={`${listId}-title`} className="flex items-baseline gap-2 text-small font-semibold text-ink">
        {title}
        <span className="text-caption font-normal text-ink-3 tabular-nums">{count}</span>
      </h4>
      {hint ? <p className="mt-0.5 text-caption text-ink-3">{hint}</p> : null}
      <ul id={listId} className="m-0 mt-2 flex list-none flex-col gap-3 p-0">
        {shown}
      </ul>
      {hidden > 0 ? (
        <Button variant="ghost" size="sm" className="-ml-2 mt-1" aria-controls={listId} onClick={() => setAll(true)} data-testid={`${testId}-more`}>
          Show {hidden} more
        </Button>
      ) : null}
      {footer}
    </section>
  )
}

function FieldName({ issueField, fieldPath, listingId }: { issueField: string; fieldPath: string; listingId?: string | null }) {
  if (listingId) {
    return (
      <Link to="/listings/$listingId/review" params={{ listingId }} className="focus-ring min-w-0 rounded-sm font-semibold break-words text-ink underline-offset-2 hover:underline" title={fieldPath} data-testid="issue-field-link">
        {issueField}
      </Link>
    )
  }
  return (
    <span className="min-w-0 font-semibold break-words text-ink" title={fieldPath}>
      {issueField}
    </span>
  )
}

function IssueItem({
  issue,
  marketplace,
  showAction = false,
  note,
  fieldLink = null,
}: {
  issue: IssueLine
  marketplace: string
  showAction?: boolean
  note?: string
  fieldLink?: string | null
}) {
  return (
    <li className="min-w-0 text-small" data-testid="issue-line">
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <FieldName issueField={issue.field} fieldPath={issue.fieldPath} listingId={fieldLink} />
        <TagChip tone="plain" className="h-5 px-2 text-[11px]">
          {issue.group}
        </TagChip>
      </span>
      <span className="mt-0.5 block break-words text-ink-2" data-testid="issue-cause">
        {issue.cause}
      </span>
      {showAction && issue.action ? (
        <span className="mt-0.5 block break-words text-ink" data-testid="issue-action">
          {issue.action}
        </span>
      ) : null}
      {note ? <span className="mt-0.5 block text-caption text-ink-3">{note}</span> : null}
      <Details issue={issue} marketplace={marketplace} />
    </li>
  )
}

function FixItem({ fix, marketplace, suggested = false }: { fix: FixLine; marketplace: string; suggested?: boolean }) {
  return (
    <li className="min-w-0 text-small" data-testid="fix-line">
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="min-w-0 font-semibold break-words text-ink" title={fix.fieldPath}>
          {fix.field}
        </span>
        <TagChip tone="plain" className="h-5 px-2 text-[11px]">
          {fixKindLabel(fix.kind)}
        </TagChip>
        <span className={cn('text-caption font-semibold', TONE_TEXT[suggested ? 'need' : fix.outcome.tone])} data-testid="fix-outcome">
          {suggested ? 'Waits for you' : fix.outcome.label}
        </span>
      </span>
      {fix.before || fix.after ? (
        <span className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5" data-testid="fix-values">
          <Value label="Before" text={fix.before} muted />
          <Icon name="arrow" size={14} className="shrink-0 text-ink-3" aria-hidden />
          <Value label="After" text={fix.after ?? 'See the new version'} />
        </span>
      ) : null}
      <span className="mt-0.5 block break-words text-ink-2" data-testid="fix-reason">
        {fix.reason}
      </span>
      {fix.issue ? <Details issue={fix.issue} marketplace={marketplace} /> : null}
    </li>
  )
}

function Value({ label, text, muted = false }: { label: string; text: string | null; muted?: boolean }) {
  return (
    <span className={cn('min-w-0 max-w-full rounded-control border border-line px-1.5 py-0.5 break-words', muted ? 'bg-subtle text-ink-2' : 'bg-surface text-ink')}>
      <span className="sr-only">{label}: </span>
      {text ?? 'Not sent'}
    </span>
  )
}

/** What the marketplace said, closed by default (kept in the DOM so it stays findable). */
function Details({ issue, marketplace }: { issue: IssueLine; marketplace: string }) {
  const mp = mpName(marketplace)
  if (!issue.code && !issue.said && !issue.sent) return null
  return (
    <Collapsible className="mt-1">
      <CollapsibleTrigger className="group focus-ring -ml-1 inline-flex min-h-8 items-center gap-1 rounded-control px-1 text-caption font-semibold text-ink-3 transition-colors duration-150 hover:text-ink motion-reduce:transition-none" data-testid="issue-details-toggle">
        What {mp} said
        <Icon name="chev" size={14} className="shrink-0 transition-transform duration-150 group-data-[state=open]:rotate-180 motion-reduce:transition-none" />
      </CollapsibleTrigger>
      <CollapsibleContent forceMount className="data-[state=closed]:hidden">
        <dl className="m-0 mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-control bg-subtle p-2 text-caption" data-testid="issue-details">
          {issue.code ? (
            <>
              <dt className="text-ink-3">Code</dt>
              <dd className="m-0 font-mono text-ink tabular-nums">{issue.code}</dd>
            </>
          ) : null}
          {issue.said ? (
            <>
              <dt className="text-ink-3">Message</dt>
              <dd className="m-0 break-words text-ink">{issue.said}</dd>
            </>
          ) : null}
          {issue.sent ? (
            <>
              <dt className="text-ink-3">Value sent</dt>
              <dd className="m-0 break-words text-ink">{issue.sent}</dd>
            </>
          ) : null}
          <dt className="text-ink-3">Seen</dt>
          <dd className="m-0 text-ink tabular-nums">
            {issue.occurrences === 1 ? 'Once' : `${issue.occurrences} times`}, last at <time dateTime={issue.lastSeen}>{clock(issue.lastSeen)}</time>
          </dd>
        </dl>
      </CollapsibleContent>
    </Collapsible>
  )
}

function History({ steps, marketplace }: { steps: readonly HistoryStep[]; marketplace: string }) {
  return (
    <Collapsible className="mt-4 border-t border-line pt-3">
      <CollapsibleTrigger className="group focus-ring -ml-1 inline-flex min-h-10 items-center gap-1 rounded-control px-1 text-small font-semibold text-ink-2 transition-colors duration-150 hover:text-ink motion-reduce:transition-none" data-testid="issues-history-toggle">
        Show history ({steps.length} {steps.length === 1 ? 'try' : 'tries'})
        <Icon name="chev" size={16} className="shrink-0 transition-transform duration-150 group-data-[state=open]:rotate-180 motion-reduce:transition-none" />
      </CollapsibleTrigger>
      <CollapsibleContent forceMount className="data-[state=closed]:hidden">
        <ol className="m-0 mt-2 flex list-none flex-col gap-3 p-0" aria-label="Every try, oldest first" data-testid="issues-history">
          {steps.map((s) => (
            <li key={s.key} className="min-w-0 text-small" data-testid="issues-history-step">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-semibold text-ink">{s.title}</span>
                <span className={TONE_TEXT[s.outcome.tone]}>{s.outcome.label}</span>
              </span>
              <span className="block text-caption text-ink-3 tabular-nums">
                Version {s.version} · <time dateTime={s.at}>{clock(s.at)}</time>
              </span>
              {s.issues.length ? (
                <ul className="m-0 mt-1 list-none p-0 text-caption text-ink-2">
                  {s.issues.map((i) => (
                    <li key={i.id} className="break-words">
                      {mpName(marketplace)}: {i.field}
                      {i.code ? <span className="font-mono text-ink-3"> ({i.code})</span> : null} · {i.cause}
                    </li>
                  ))}
                </ul>
              ) : null}
              {s.fixes.length ? (
                <ul className="m-0 mt-1 list-none p-0 text-caption text-ink-2">
                  {s.fixes.map((f) => (
                    <li key={f.id} className="break-words">
                      Kuinn: {f.field} · {fixKindLabel(f.kind).toLowerCase()}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>
      </CollapsibleContent>
    </Collapsible>
  )
}

/** The card's shape while the read lands, so nothing below it moves. */
export function IssuesAndFixesSkeleton() {
  return (
    <LaCard aria-hidden data-testid="issues-and-fixes-skeleton">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="mt-2 h-4 w-3/4" />
    </LaCard>
  )
}
