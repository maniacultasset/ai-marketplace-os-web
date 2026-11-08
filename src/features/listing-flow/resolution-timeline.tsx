/**
 * "What Kuinn did" (SI11 F1, F2): the resolution read of one listing on the review and live
 * screens. One calm headline (the backend's state, worded by resolution-model.ts), the automatic
 * tries used, and the steps oldest first: Pre-check, Sent 1, Sent 2. Each step says what the
 * marketplace said, what Kuinn changed and what needs the seller. Shown only from the read: a
 * backend without the route, or a listing Kuinn never worked on, shows nothing.
 */
import { Link } from '@tanstack/react-router'
import { useId, useState, type ReactNode } from 'react'
import { IconTile, type IconName, type TileTone } from '@/components/la/icons'
import { LaCard } from '@/components/la/cards'
import { StatusChip, TagChip } from '@/components/la/status-chip'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { RewrittenBadge } from './auto-fix'
import { clock, mpName } from './format'
import { laneView } from './lanes'
import type { ResolutionAction, ResolutionStep, ResolutionTone, ResolutionView, StepFailure } from './resolution-model'
import { Timeline, TimelineItem } from './ui'

/** Steps shown before "Show earlier steps": the newest ones. */
const SHOWN_STEPS = 3

const TILE: Record<ResolutionTone, { icon: IconName; tone: TileTone }> = {
  neutral: { icon: 'info', tone: 'neutral' },
  working: { icon: 'refresh', tone: 'brand' },
  success: { icon: 'check', tone: 'ok' },
  attention: { icon: 'alert', tone: 'warn' },
  danger: { icon: 'pause', tone: 'fail' },
}

export function ResolutionCard({
  view,
  marketplace,
  action,
  className,
}: {
  view: ResolutionView
  marketplace: string
  /** The one next step (a button or link the screen builds), under the headline. */
  action?: ReactNode
  className?: string
}) {
  const h = view.headline
  const tile = TILE[h.tone]
  const emphasis = h.tone === 'attention' ? 'attention' : 'default'
  return (
    <LaCard emphasis={emphasis} className={cn('min-w-0', className)} data-testid="resolution" data-state={h.state}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <h3 className="text-h3 text-ink">What Kuinn did</h3>
        {view.triesText ? (
          <span data-testid="resolution-tries">
            <TagChip className="tabular-nums">{view.triesText}</TagChip>
          </span>
        ) : null}
      </div>
      <div className="mt-3 flex items-start gap-3" role="status">
        <IconTile icon={tile.icon} tone={tile.tone} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="font-bold text-ink" data-testid="resolution-headline">
            {h.title}
          </p>
          <p className="mt-0.5 text-small text-ink-2">{h.line}</p>
          {h.state === 'live' && view.nextText ? <p className="mt-1 text-caption text-ink-3">{view.nextText}</p> : null}
        </div>
      </div>
      {action ? <div className="mt-3 flex flex-wrap gap-2">{action}</div> : null}
      {view.steps.length ? <Steps steps={view.steps} marketplace={marketplace} /> : null}
    </LaCard>
  )
}

function Steps({ steps, marketplace }: { steps: readonly ResolutionStep[]; marketplace: string }) {
  const [all, setAll] = useState(false)
  const listId = useId()
  const hidden = all ? 0 : Math.max(0, steps.length - SHOWN_STEPS)
  const shown = steps.slice(hidden)
  const newest = steps[steps.length - 1]?.key
  return (
    <div id={listId} className="mt-4 border-t border-line pt-4">
      {hidden ? (
        <Button variant="ghost" size="sm" className="-ml-2 mb-2" aria-controls={listId} onClick={() => setAll(true)} data-testid="resolution-earlier">
          Show {hidden} earlier {hidden === 1 ? 'step' : 'steps'}
        </Button>
      ) : null}
      <Timeline label="What Kuinn did, oldest first" className="min-w-0">
        {shown.map((s) => (
          <TimelineItem key={s.key} tone={s.outcome.tone} className="min-w-0">
            <StepBody step={s} marketplace={marketplace} current={s.key === newest} />
          </TimelineItem>
        ))}
      </Timeline>
    </div>
  )
}

function StepBody({ step, marketplace, current }: { step: ResolutionStep; marketplace: string; current: boolean }) {
  const mp = mpName(marketplace)
  return (
    <div className="min-w-0" data-testid="resolution-step">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="font-semibold text-ink" data-testid="resolution-step-title">
          {step.title}
        </span>
        <span className="text-ink-2">{step.outcome.label}</span>
      </div>
      <p className="text-caption text-ink-3 tabular-nums">
        Version {step.version} · <time dateTime={step.at}>{clock(step.at)}</time>
      </p>
      {step.said.length ? (
        <Section title={`What ${mp} said`} testId="resolution-said">
          {step.said.map((f, i) => (
            <Line key={`${f.fieldPath}:${i}`} field={f.field} fieldPath={f.fieldPath} badge={current ? <LaneChip failure={f} marketplace={marketplace} /> : null}>
              {f.text}
            </Line>
          ))}
        </Section>
      ) : null}
      {step.changed.length ? (
        <Section title={step.changedTitle} testId="resolution-changed">
          {step.changed.map((c, i) => (
            <Line key={`${c.fieldPath}:${i}`} field={c.field} fieldPath={c.fieldPath} badge={c.rewritten ? <RewrittenBadge /> : null}>
              {c.text}
            </Line>
          ))}
        </Section>
      ) : null}
      {current && step.needsYou.length ? (
        <Section title="What needs you" testId="resolution-needs-you">
          {step.needsYou.map((f, i) => (
            <Line key={`${f.fieldPath}:${i}`} field={f.field} fieldPath={f.fieldPath}>
              Answer the question about this in your Inbox.
            </Line>
          ))}
        </Section>
      ) : null}
    </div>
  )
}

function Section({ title, testId, children }: { title: string; testId: string; children: ReactNode }) {
  return (
    <div className="mt-2" data-testid={testId}>
      <p className="text-caption font-semibold text-ink-2">{title}</p>
      <ul className="m-0 mt-1 flex list-none flex-col gap-1.5 p-0">{children}</ul>
    </div>
  )
}

function Line({ field, fieldPath, badge, children }: { field: string; fieldPath: string; badge?: ReactNode; children: ReactNode }) {
  return (
    <li className="min-w-0 text-small">
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="min-w-0 font-semibold break-words text-ink" title={fieldPath}>
          {field}
        </span>
        {badge}
      </span>
      <span className="block break-words text-ink-2">{children}</span>
    </li>
  )
}

function LaneChip({ failure, marketplace }: { failure: StepFailure; marketplace: string }) {
  const v = laneView(failure.lane, { closed: false, marketplace })
  if (!v) return null
  return (
    <StatusChip status={v.chip.status} className="h-5 px-2 text-[11px]">
      {v.chip.label}
    </StatusChip>
  )
}

/** The next step as a link: an Inbox question or marketplace step, or the review to change it. */
export function ResolutionActionLink({ action, listingId, marketplace }: { action: ResolutionAction; listingId: string; marketplace: string }) {
  const mp = mpName(marketplace)
  switch (action.kind) {
    case 'answer':
      return (
        <Button size="sm" asChild data-testid="resolution-answer">
          <Link to="/inbox" search={action.taskId ? { item: `task:${action.taskId}` } : { view: 'questions' }}>
            Answer the question
          </Link>
        </Button>
      )
    case 'marketplace':
      return (
        <Button size="sm" variant="secondary" asChild data-testid="resolution-marketplace">
          <Link to="/inbox" search={action.taskId ? { item: `task:${action.taskId}` } : { view: 'questions' }}>
            See the {mp} step
          </Link>
        </Button>
      )
    case 'change':
      return (
        <Button size="sm" variant="secondary" asChild data-testid="resolution-change">
          <Link to="/listings/$listingId/review" params={{ listingId }}>
            Open the review
          </Link>
        </Button>
      )
    case 'approve':
      return (
        <Button size="sm" asChild data-testid="resolution-review">
          <Link to="/listings/$listingId/review" params={{ listingId }}>
            Review the fix
          </Link>
        </Button>
      )
    case 'none':
      return null
  }
}

/** The card's shape while the read lands, so nothing below it moves. */
export function ResolutionSkeleton() {
  return (
    <LaCard aria-hidden data-testid="resolution-skeleton">
      <Skeleton className="h-5 w-36" />
      <div className="mt-3 flex gap-3">
        <Skeleton className="size-7 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      </div>
    </LaCard>
  )
}
