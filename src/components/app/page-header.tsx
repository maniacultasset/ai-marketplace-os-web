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
    <header className={cn('flex flex-col gap-4 pb-7', className)}>
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="truncate text-[1.625rem] leading-tight font-semibold tracking-[-0.02em]">{title}</h1>
          {description ? <p className="max-w-[65ch] text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  )
}

/** Standard page container used by every route under the app shell. */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('animate-page-in mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10', className)}>{children}</div>
}
