import { Link } from '@tanstack/react-router'
import { Fragment, type ReactNode } from 'react'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { cn } from '@/lib/utils'

export interface Crumb {
  label: string
  /** Omit for the current page. */
  to?: string
}

/** Page title block: optional breadcrumbs, title, description and right-aligned actions. */
export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  breadcrumbs?: Crumb[]
  actions?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('flex flex-col gap-3 pb-5', className)}>
      {breadcrumbs?.length ? (
        <Breadcrumb>
          <BreadcrumbList>
            {breadcrumbs.map((c, i) => (
              <Fragment key={`${c.label}-${i}`}>
                {i > 0 ? <BreadcrumbSeparator /> : null}
                <BreadcrumbItem>
                  {c.to ? (
                    <BreadcrumbLink asChild>
                      <Link to={c.to}>{c.label}</Link>
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage>{c.label}</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
              </Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h1 className="line-clamp-2 font-display text-h1 break-words text-balance text-ink">{title}</h1>
          {description ? <p className="mt-1 max-w-[70ch] text-body text-ink-2">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2 max-sm:w-full">{actions}</div> : null}
      </div>
    </header>
  )
}

/**
 * Standard page container used by every route under the app shell: max-w-7xl so data pages use
 * the panel, with tight-but-airy padding. Forms keep a readable measure by sitting in the main
 * column of <PageColumns> (never a lone max-w-3xl column stranded in a wide panel).
 */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('animate-page-in mx-auto w-full max-w-[1400px] px-4 pt-5 pb-10 md:p-7 md:pb-12', className)}>
      {children}
    </div>
  )
}

/**
 * Two-column page body at lg: the main column (forms, detail content) and a side column
 * (summary, help, related records from real data). The aside sticks below the top bar.
 * Below lg the aside stacks under the main column (or above it with `asideFirst`).
 *
 *   <PageColumns aside={<SummaryCard … />}>
 *     <FormCard … />
 *   </PageColumns>
 */
export function PageColumns({
  children,
  aside,
  asideWidth = 'md',
  asideFirst,
  className,
}: {
  children: ReactNode
  aside: ReactNode
  /** sm = 18rem, md = 20rem, lg = 24rem. */
  asideWidth?: 'sm' | 'md' | 'lg'
  /** On mobile, render the aside above the main column. */
  asideFirst?: boolean
  className?: string
}) {
  const cols = {
    sm: 'lg:grid-cols-[minmax(0,1fr)_18rem]',
    md: 'lg:grid-cols-[minmax(0,1fr)_20rem]',
    lg: 'lg:grid-cols-[minmax(0,1fr)_24rem]',
  }[asideWidth]
  return (
    <div className={cn('grid items-start gap-5 lg:gap-6', cols, className)}>
      <div className={cn('flex min-w-0 flex-col gap-5', asideFirst && 'order-2 lg:order-1')}>{children}</div>
      <aside className={cn('flex min-w-0 flex-col gap-4 lg:sticky lg:top-20', asideFirst && 'order-1 lg:order-2')}>
        {aside}
      </aside>
    </div>
  )
}

/**
 * Bottom action bar for long forms: sticks to the viewport bottom while the form scrolls, so the
 * primary action is always reachable. Put it as the last child of the form.
 */
export function StickyActions({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'sticky bottom-0 z-10 -mx-4 mt-2 flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface px-4 py-3 shadow-raised-up sm:-mx-6 sm:px-6 lg:mx-0 lg:rounded-[14px] lg:border lg:shadow-raised-lg lg:px-4',
        className,
      )}
    >
      {children}
    </div>
  )
}
