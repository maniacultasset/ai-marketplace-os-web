/**
 * Platform admins: the AI credit (GET /admin/ai-credit) and Resume (POST /admin/ai-credit/resume,
 * repeatable). Shown on /admin/brands. A backend without the route (404) shows nothing.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '@/api/client'
import { isNotFound, isNotImplemented } from '@/api/errors'
import type { Schema } from '@/api/types'
import { CardHead, LaCard } from '@/components/la/cards'
import { StatusChip } from '@/components/la/status-chip'
import { ErrorState } from '@/components/states/error-state'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { useCan } from '@/lib/permissions'
import { useKeys } from '@/lib/query-keys'
import { toast } from '@/lib/toast'
import { CREDIT_STATE, PAUSE_REASON, usd } from './model'

type AiCredit = Schema<'AiCreditOut'>

function useAiCredit(enabled: boolean) {
  const keys = useKeys()
  return useQuery({
    queryKey: keys.aiCredit(),
    queryFn: () => unwrap(api.GET('/admin/ai-credit')),
    enabled,
    retry: (n, e) => !isNotFound(e) && !isNotImplemented(e) && n < 2,
  })
}

function useResumeAi() {
  const qc = useQueryClient()
  const keys = useKeys()
  return useMutation({
    mutationFn: () => unwrap(api.POST('/admin/ai-credit/resume')),
    meta: { errorTitle: 'Couldn’t resume AI' },
    onSuccess: (data) => {
      qc.setQueryData(keys.aiCredit(), data)
      // Every brand's /auth/me ai_paused follows the row.
      void qc.invalidateQueries({ queryKey: keys.me() })
      toast.success('AI resumed', { description: 'New drafts can start again. The credit floor is still checked.' })
    },
  })
}

function when(iso: string | null | undefined): string {
  if (!iso) return 'Not yet'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? 'Not yet' : d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

export function AiCreditCard() {
  const can = useCan()
  const allowed = can('platform:admin')
  const credit = useAiCredit(allowed)
  const resume = useResumeAi()
  if (!allowed) return null
  if (credit.isError && (isNotFound(credit.error) || isNotImplemented(credit.error))) return null

  return (
    <LaCard className="mb-4" data-testid="ai-credit-card">
      <CardHead
        icon="spark"
        iconTone="brand"
        title="AI credit"
        sub="Shared by every brand. When it runs low, drafting pauses and work stays saved."
        action={
          credit.data ? (
            <Button
              variant={credit.data.state === 'paused' ? 'primary' : 'secondary'}
              size="sm"
              disabled={resume.isPending}
              onClick={() => resume.mutate()}
              data-testid="ai-credit-resume"
            >
              {resume.isPending ? <Spinner data-icon="inline-start" /> : null}
              {resume.isPending ? 'Resuming…' : 'Resume AI'}
            </Button>
          ) : null
        }
      />
      <div className="mt-4">
        {credit.isPending ? (
          <CreditSkeleton />
        ) : credit.isError ? (
          <ErrorState compact error={credit.error} title="Couldn’t load the AI credit" onRetry={() => void credit.refetch()} />
        ) : (
          <CreditBody credit={credit.data} />
        )}
      </div>
    </LaCard>
  )
}

function CreditBody({ credit }: { credit: AiCredit }) {
  const meta = CREDIT_STATE[credit.state]
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip status={meta.chip}>{meta.label}</StatusChip>
        {credit.state === 'paused' && credit.paused_reason ? (
          <span className="text-small text-ink-2">{PAUSE_REASON[credit.paused_reason]}</span>
        ) : null}
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-small sm:grid-cols-4">
        <Stat label="Remaining" value={usd(credit.remaining_usd)} />
        <Stat label="Pause below" value={usd(credit.floor_usd)} />
        <Stat label="Spent today" value={`${usd(credit.today_spend_usd)} of ${usd(credit.daily_cap_usd)}`} />
        <Stat label="Last checked" value={when(credit.checked_at)} />
      </dl>
      {credit.paused_at ? <p className="text-caption text-ink-3">Paused {when(credit.paused_at)}.</p> : null}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-ink-3">{label}</dt>
      <dd className="mt-0.5 truncate font-semibold text-ink tabular-nums">{value}</dd>
    </div>
  )
}

function CreditSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading the AI credit">
      <Skeleton className="h-[22px] w-24 rounded-full" />
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex flex-col gap-1">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </div>
    </div>
  )
}
