/**
 * Small pieces shared by Home, Inbox and Issue detail: the hi-fi timeline (.tl), the leading
 * tile for a task or issue row, the code block (.code), and a key-value list (.kv).
 */
import { formatDistanceToNowStrict, format, isToday, isYesterday } from 'date-fns'
import type { ReactNode } from 'react'
import { Icon, type IconName } from '@/components/la/icons'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { Issue, Task } from '@/features/inbox/model'
import { cn } from '@/lib/utils'
import type { TimelineEntry } from './model'

const DOT: Record<TimelineEntry['tone'], string> = {
  ok: 'border-success bg-success',
  bad: 'border-danger bg-danger',
  need: 'border-attention bg-attention',
  now: 'border-brand bg-brand shadow-[0_0_0_4px_rgba(45,70,224,.2)]',
  neutral: 'border-ink-3 bg-surface',
}

const TONE_WORD: Record<TimelineEntry['tone'], string> = { ok: 'Done', bad: 'Failed', need: 'Needs attention', now: 'In progress', neutral: '' }

/** "Yesterday 16:02", "16:03", "3 Oct, 09:30". */
export function shortWhen(iso: string, now = new Date()) {
  const d = new Date(iso)
  if (isToday(d)) return format(d, 'HH:mm')
  if (isYesterday(d)) return `Yesterday ${format(d, 'HH:mm')}`
  return d.getFullYear() === now.getFullYear() ? format(d, 'd MMM, HH:mm') : format(d, 'd MMM yyyy, HH:mm')
}

export function Ago({ iso, className }: { iso: string; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <time dateTime={iso} tabIndex={0} className={cn('rounded-sm', className)}>
          {formatDistanceToNowStrict(new Date(iso), { addSuffix: true })}
        </time>
      </TooltipTrigger>
      <TooltipContent>{format(new Date(iso), 'd MMM yyyy, HH:mm:ss')}</TooltipContent>
    </Tooltip>
  )
}

export function Timeline({ entries, className, label }: { entries: readonly TimelineEntry[]; className?: string; label: string }) {
  return (
    <ol aria-label={label} className={cn('relative list-none pl-5 before:absolute before:top-1.5 before:bottom-1.5 before:left-[5px] before:w-0.5 before:bg-line', className)}>
      {entries.map((e, i) => (
        <li key={`${e.title}-${i}`} className="relative pb-3.5 text-small last:pb-0">
          <span aria-hidden className={cn('absolute top-[3px] -left-5 size-3 rounded-full border-2', DOT[e.tone])} />
          {TONE_WORD[e.tone] ? <span className="sr-only">{TONE_WORD[e.tone]}: </span> : null}
          <b className="font-bold text-ink">{e.title}</b>
          {e.at ? <span className="text-ink-3"> · {shortWhen(e.at)}</span> : null}
          {e.detail ? <small className="block text-caption text-ink-2">{e.detail}</small> : null}
        </li>
      ))}
    </ol>
  )
}

export function CodeBlock({ children }: { children: ReactNode }) {
  return (
    <pre className="mt-1 rounded-control border border-line-strong bg-subtle px-3 py-2.5 font-mono text-[12px] leading-[17px] break-words whitespace-pre-wrap text-ink">
      {children}
    </pre>
  )
}

export function KeyValues({ rows, className }: { rows: readonly [string, ReactNode][]; className?: string }) {
  return (
    <dl className={cn('grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 sm:grid-cols-[130px_minmax(0,1fr)] gap-y-2 text-small', className)}>
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-ink-3">{k}</dt>
          <dd className="min-w-0 break-words text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

const TASK_ICON: Record<Task['kind'], IconName> = {
  missing_fact: 'file',
  conflicting_facts: 'file',
  unverified_declaration: 'shield',
  approval_or_evidence: 'shield',
  permission_decision: 'shield',
  reconnect_account: 'link',
  image_replacement: 'image',
  marketplace_error_review: 'store',
}

/** 40/44px leading tile: brand tint for a question, attention or danger tint for an issue. */
export function ItemTile({ item, size = 40 }: { item: { kind: 'task'; task: Pick<Task, 'kind'> } | { kind: 'issue'; issue: Pick<Issue, 'severity' | 'status'> }; size?: 40 | 44 }) {
  const isTask = item.kind === 'task'
  const tone = isTask
    ? 'border-brand-line bg-brand-bg text-brand'
    : item.issue.status !== 'open'
      ? 'border-success-line bg-success-bg text-success'
      : item.issue.severity === 'error'
        ? 'border-danger-line bg-danger-bg text-danger'
        : 'border-attention-line bg-attention-bg text-attention'
  const name: IconName = isTask ? TASK_ICON[item.task.kind] : item.issue.status !== 'open' ? 'check' : 'alert'
  return (
    <span aria-hidden className={cn('inline-flex shrink-0 items-center justify-center rounded-[9px] border', tone, size === 44 ? 'size-11' : 'size-10')}>
      <Icon name={name} size={18} />
    </span>
  )
}
