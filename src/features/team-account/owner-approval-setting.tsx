/**
 * "Owners may approve their own listings" (ADR-0031), on Settings > Autonomy at
 * `#owner-approval` (OWNER_APPROVAL_HASH). Off by default. Everyone reads it from GET /tenants/me;
 * only an owner changes it, through PATCH /tenants/me with the profile's ETag as If-Match.
 *
 * The switch shows the server's value and moves only once the server confirms it. Under MFA the
 * PATCH asks for a code: the API client opens the step-up dialog and replays the request
 * (api/step-up.ts). A cancelled code, or 409 STALE_VERSION (someone saved the profile first,
 * after which the latest is read), changes nothing and says so.
 */
import { useQueryClient } from '@tanstack/react-query'
import { useId } from 'react'
import { STALE_VERSION_COPY, isStaleVersion } from '@/api/etag'
import { LaCard } from '@/components/la/cards'
import { Icon } from '@/components/la/icons'
import { ErrorState } from '@/components/states/error-state'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { fetchProfile, useBrandProfile, useSaveProfile } from '@/features/brand/api'
import { useMe } from '@/lib/auth'
import { useKeys } from '@/lib/query-keys'
import { toast, toastError } from '@/lib/toast'
import { OWNER_APPROVAL_HASH, OWNER_APPROVAL_SETTING } from './approver'

export function OwnerApprovalSetting() {
  const id = useId()
  const keys = useKeys()
  const qc = useQueryClient()
  const me = useMe()
  const profile = useBrandProfile()
  const save = useSaveProfile()
  const isOwner = me.data?.role === 'owner'
  const value = profile.data?.data.owner_self_approval

  const toggle = (next: boolean) => {
    if (!isOwner || !profile.data || save.isPending) return
    save.mutate(
      { body: { owner_self_approval: next }, etag: profile.data.etag },
      {
        onSuccess: (saved) =>
          toast.success(saved.data.owner_self_approval ? 'Owner approval is on' : 'Owner approval is off', {
            description: saved.data.owner_self_approval
              ? 'Owners can approve their own listings. Each one is recorded in the listing history.'
              : 'Someone other than the maker approves each listing.',
          }),
        onError: async (err: unknown) => {
          if (isStaleVersion(err)) {
            try {
              await qc.fetchQuery({ queryKey: keys.brand.profile(), queryFn: fetchProfile, staleTime: 0 })
              toast.error(STALE_VERSION_COPY.title, { description: STALE_VERSION_COPY.description })
            } catch (e) {
              toastError(e, 'Couldn’t load the latest version')
            }
            return
          }
          toastError(err, 'Owner approval wasn’t changed')
        },
      },
    )
  }

  return (
    <LaCard id={OWNER_APPROVAL_HASH} className="scroll-mt-24 md:scroll-mt-4" data-testid="owner-approval">
      {profile.isError && !profile.data ? (
        <ErrorState compact error={profile.error} title="Couldn’t load this setting" onRetry={() => void profile.refetch()} />
      ) : (
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <label htmlFor={id} className="text-body font-bold text-ink">
              {OWNER_APPROVAL_SETTING.label}
            </label>
            <p id={`${id}-help`} className="mt-1 text-small text-ink-2">
              {OWNER_APPROVAL_SETTING.help}
            </p>
            {me.data && !isOwner ? (
              <p className="mt-2 flex items-center gap-1.5 text-caption text-ink-3" data-testid="owner-approval-readonly">
                <Icon name="lock" size={14} />
                {value === undefined ? 'Only an owner can change this.' : `Only an owner can change this. It is ${value ? 'on' : 'off'}.`}
              </p>
            ) : null}
          </div>
          <div className="flex min-h-8 shrink-0 items-center gap-2">
            {save.isPending ? <Spinner className="size-4 text-ink-3" aria-label="Saving" /> : null}
            {value === undefined ? (
              <Skeleton className="h-[18px] w-8 rounded-full" aria-label="Loading" />
            ) : (
              <Switch
                id={id}
                checked={value}
                onCheckedChange={toggle}
                disabled={!isOwner || save.isPending}
                aria-describedby={`${id}-help`}
                data-testid="owner-approval-switch"
              />
            )}
          </div>
        </div>
      )}
    </LaCard>
  )
}
