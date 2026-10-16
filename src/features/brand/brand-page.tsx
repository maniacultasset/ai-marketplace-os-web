/** /brand: profile (main column) + documents (aside). Readable by every role; editable with settings:manage. */
import { PageColumns } from '@/components/app/page-header'
import { ErrorState } from '@/components/states/error-state'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useCan } from '@/lib/permissions'
import { OP_ACTION } from '@/lib/permissions'
import { useBrandProfile } from './api'
import { DocumentsPanel } from './documents-panel'
import { ProfileEditor } from './profile-editor'

export function BrandPage() {
  const can = useCan()
  const profile = useBrandProfile()
  const canEdit = can(OP_ACTION['PATCH /tenants/me'])
  const canManageDocs = can(OP_ACTION['POST /brand/documents']) && can(OP_ACTION['DELETE /brand/documents/{document_id}'])

  return (
    <PageColumns asideWidth="lg" aside={<DocumentsPanel canManage={canManageDocs} />}>
      {profile.data ? (
        <ProfileEditor key={profile.data.data.id} profile={profile.data} canEdit={canEdit} />
      ) : profile.isError ? (
        <Card className="py-0">
          <ErrorState error={profile.error} onRetry={() => void profile.refetch()} title="Couldn’t load the brand profile" />
        </Card>
      ) : (
        <ProfileSkeleton />
      )}
    </PageColumns>
  )
}

function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading brand profile">
      <Card className="gap-4 px-5">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-5 w-28" />
        </div>
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-9 w-full" />
      </Card>
      <Card className="gap-4 px-5">
        <Skeleton className="h-4 w-14" />
        <Skeleton className="h-3.5 w-80 max-w-full" />
        <Skeleton className="h-20 w-full" />
        <div className="space-y-2 border-t pt-5">
          <Skeleton className="h-3.5 w-24" />
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
        <div className="space-y-2 border-t pt-5">
          <Skeleton className="h-3.5 w-20" />
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="grid grid-cols-2 gap-2">
              <Skeleton className="h-9" />
              <Skeleton className="h-9" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
