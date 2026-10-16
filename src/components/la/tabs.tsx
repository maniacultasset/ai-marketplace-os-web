/**
 * Route-driven tabs and the segmented filter (hi-fi Tabs / Segmented control).
 * - RouteTabs: links styled as hi-fi tabs (42px, 2px brand underline). Use for /products/$id tabs
 *   and the Settings sub-nav on small screens. Pass `count` for a trailing number.
 * - Segmented: a radio group (34px track) for status filters such as "All 41 · Live 22 …".
 *   Counts must come from the API and always sum to the total; omit `count` when unknown.
 */
import { Link, type LinkProps } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface RouteTab {
  label: string
  to: LinkProps['to']
  params?: LinkProps['params']
  search?: LinkProps['search']
  count?: number
  /** Match the exact URL only (for index tabs). */
  exact?: boolean
  disabled?: boolean
}

export function RouteTabs({ tabs, label, className }: { tabs: readonly RouteTab[]; label: string; className?: string }) {
  return (
    <nav aria-label={label} className={cn('mb-5 flex w-full gap-1 overflow-x-auto border-b border-line', className)}>
      {tabs.map((t) =>
        t.disabled ? (
          <span key={t.label} aria-disabled className="-mb-px inline-flex h-[42px] shrink-0 cursor-not-allowed items-center border-b-2 border-transparent px-3.5 font-medium whitespace-nowrap text-ink-3">
            {t.label}
          </span>
        ) : (
          <Link
            key={t.label}
            to={t.to}
            params={t.params as never}
            search={t.search as never}
            activeOptions={{ exact: t.exact ?? false, includeSearch: false }}
            className="-mb-px inline-flex h-[42px] shrink-0 items-center gap-1.5 border-b-2 border-transparent px-3.5 font-medium whitespace-nowrap text-ink-2 transition-colors duration-150 hover:text-ink data-[status=active]:border-brand data-[status=active]:font-bold data-[status=active]:text-brand"
          >
            {t.label}
            {t.count != null ? <span className="text-caption tabular-nums">{t.count}</span> : null}
          </Link>
        ),
      )}
    </nav>
  )
}

export interface SegmentOption<T extends string> {
  value: T
  label: ReactNode
  /** A number from the API, or a lower bound such as "50+". */
  count?: number | string
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: readonly SegmentOption<T>[]
  value: T
  onChange: (v: T) => void
  label: string
  className?: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex h-[34px] max-w-full gap-0.5 overflow-x-auto rounded-[10px] inset-track p-[3px]', className)}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
              e.preventDefault()
              const i = options.findIndex((x) => x.value === value)
              const next = options[(i + (e.key === 'ArrowRight' ? 1 : options.length - 1)) % options.length]!
              onChange(next.value)
              const sib = e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role=radio]')
              sib?.[options.indexOf(next)]?.focus()
            }}
            tabIndex={on ? 0 : -1}
            className={cn(
              'inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-[7px] px-3 text-[13px] font-semibold whitespace-nowrap text-ink-2 transition-[color,background-color,box-shadow] duration-150 hover:text-ink',
              on && 'bg-surface text-ink shadow-thumb',
            )}
          >
            {o.label}
            {o.count != null ? <span className="tabular-nums">{o.count}</span> : null}
          </button>
        )
      })}
    </div>
  )
}
