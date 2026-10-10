import { Skeleton } from '@/components/ui/skeleton'
import { Page } from './page-header'

/** Generic loading skeleton for a page (header + table-ish block). */
export function PageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <Page>
      <div className="space-y-2 pb-6" aria-busy="true" aria-label="Loading">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="overflow-hidden rounded-lg border">
        <div className="border-b bg-muted/40 px-4 py-3">
          <Skeleton className="h-4 w-1/3" />
        </div>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-b px-4 py-3 last:border-0">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </Page>
  )
}
