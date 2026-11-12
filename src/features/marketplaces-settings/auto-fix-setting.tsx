/**
 * Client item 20 bullet 3: "Let Kuinn fix safe listing errors automatically", on Settings >
 * Autonomy at `#auto-fix`. On by default (today's behaviour). Everyone reads it from
 * GET /tenants/me (`auto_fix_enabled`); only an owner changes it, through PATCH /tenants/me with
 * the profile's ETag as If-Match. Off, every fix Kuinn finds waits as a suggested fix that the
 * seller applies from the listing ("Issues and fixes").
 *
 * The switch shows the server's value and moves only once the server confirms it (the same rules
 * as the owner approval setting: a step-up under MFA, a calm toast on 409 STALE_VERSION). The list
 * below says truthfully what happens to each kind of fix with the setting as it is now.
 */
import { useQueryClient } from '@tanstack/react-query'
import { useId } from 'react'
import { STALE_VERSION_COPY, isStaleVersion } from '@/api/etag'
import { LaCard } from '@/components/la/cards'
import { Icon } from '@/components/la/icons'
import { StatusChip, type ChipStatus } from '@/components/la/status-chip'
import { ErrorState } from '@/components/states/error-state'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { fetchProfile, useBrandProfile, useSaveProfile } from '@/features/brand/api'
import { useMe } from '@/lib/auth'
import { useKeys } from '@/lib/query-keys'
import { toast, toastError } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { AUTO_FIX_HASH, AUTO_FIX_SCOPE, AUTO_FIX_SETTING, NEVER_GUESSED, modeWith, type AutoFixMode } from './model'

const MODE_CHIP: Record<AutoFixMode, { status: ChipStatus; label: string }> = {
  auto: { status: 'live', label: 'On its own' },
  approval: { status: 'ready', label: 'You approve' },
  planned: { status: 'not-listed', label: 'Planned' },
}

export function AutoFixSetting() {
  const id = useId()
  const keys = useKeys()
  const qc = useQueryClient()
  const me = useMe()
  const profile = useBrandProfile()
  const save = useSaveProfile()
  const isOwner = me.data?.role === 'owner'
  const value = profile.data?.data.auto_fix_enabled
  const enabled = value ?? true

  const toggle = (next: boolean) => {
    if (!isOwner || !profile.data || save.isPending) return
    save.mutate(
      { body: { auto_fix_enabled: next }, etag: profile.data.etag },
      {
        onSuccess: (saved) =>
          toast.success(saved.data.auto_fix_enabled ? 'Automatic fixes are on' : 'Automatic fixes are off', {
            description: saved.data.auto_fix_enabled
              ? 'Kuinn fixes safe listing errors and checks again on its own.'
              : 'Kuinn suggests each fix and waits for you to apply it.',
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
          toastError(err, 'Automatic fixes weren’t changed')
        },
      },
    )
  }

  return (
    <LaCard id={AUTO_FIX_HASH} className="scroll-mt-24 md:scroll-mt-4" data-testid="autonomy-auto-fix">
      {profile.isError && !profile.data ? (
        <ErrorState compact error={profile.error} title="Couldn’t load this setting" onRetry={() => void profile.refetch()} />
      ) : (
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <label htmlFor={id} className="text-body font-bold text-ink">
              {AUTO_FIX_SETTING.label}
            </label>
            <p id={`${id}-help`} className="mt-1 text-small text-ink-2">
              {AUTO_FIX_SETTING.help} {value === false ? AUTO_FIX_SETTING.offHelp : null}
            </p>
            {me.data && !isOwner ? (
              <p className="mt-2 flex items-center gap-1.5 text-caption text-ink-3" data-testid="auto-fix-readonly">
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
                data-testid="auto-fix-switch"
              />
            )}
          </div>
        </div>
      )}
      <ul className="mt-3 border-t border-line pt-1">
        {AUTO_FIX_SCOPE.map((row) => {
          const mode = modeWith(row.mode, enabled)
          return (
            <li key={row.label} className="mt-3 flex items-center justify-between gap-3 text-body text-ink" data-mode={mode}>
              <span className={cn(mode === 'planned' && 'text-ink-3')}>{row.label}</span>
              <StatusChip status={MODE_CHIP[mode].status} className="shrink-0">
                {MODE_CHIP[mode].label}
              </StatusChip>
            </li>
          )
        })}
      </ul>
      <p className="mt-4 text-caption text-ink-3">
        {enabled
          ? 'A data fix is checked again, or sent again after a failed submission, without asking you. '
          : 'Each data fix waits on the listing until you apply it; then Kuinn checks again or sends it again. '}
        A change to the title, bullets or description becomes a new version that a person approves. {NEVER_GUESSED}
      </p>
    </LaCard>
  )
}
