import { Skeleton } from '@/components/ui/skeleton'
import { Page } from './page-header'

/** Generic loading skeleton for a page (header + table-ish block). */
export function PageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <Page>
      <div className="space-y-2 pb-5 lg:pb-6" aria-busy="true" aria-label="Loading">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="overflow-hidden rounded-xl border bg-card shadow-elev-1">
        <div className="flex h-9 items-center border-b bg-muted/50 px-3">
          <Skeleton className="h-3 w-1/3" />
        </div>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex h-11 items-center gap-4 border-b border-border/70 px-3 last:border-0">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </Page>
  )
}
