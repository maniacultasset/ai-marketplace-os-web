/**
 * "Draft for <marketplace>" (p14 Next, p12 lanes, product detail; "List on" until the 11 Nov Chrome
 * pass read it as a send): POST /listings/generate with an
 * Idempotency-Key, then the agent run for the returned job. Shown only to roles that hold
 * `listing:generate` (owner, operator) and only for a marketplace the API supports. Flipkart stays
 * an honest "not yet" button until the brand has it connected (marketplaces/meta `draftOpen`).
 */
import type { ComponentProps } from 'react'
import { isApiError } from '@/api/errors'
import { UnavailableButton } from '@/components/la/unavailable'
import { Button } from '@/components/ui/button'
import { useCurrentMarketplaceAccounts } from '@/features/marketplaces/api'
import { draftClosedReason, draftOpen } from '@/features/marketplaces/meta'
import { mapGenerateErrors } from '@/features/listings/generate-form'
import type { Marketplace } from '@/features/listings/model'
import { useCan } from '@/lib/permissions'
import { AI_PAUSED_REASON, isAiPausedError } from '@/features/ai-credit/model'
import { useAiPaused } from '@/features/ai-credit/use-ai-paused'
import { toastError } from '@/lib/toast'
import { useListOn } from './api'
import { DRAFT_HINT, draftLabel, mpName } from './format'

/** One sentence for a refused generate, or null to fall back to the generic error toast. */
export function generateRefusal(error: unknown): string | null {
  if (!isApiError(error)) return null
  if (error.type === 'LISTING_BUSY') return 'The agent is already working on this listing.'
  if (error.type === 'INVALID_STATUS_TRANSITION') return 'This product already has a listing on this marketplace. Open it instead.'
  if (error.type === 'BUDGET_EXCEEDED') return 'The daily generation budget is spent. Try again later.'
  if (error.status === 422) {
    const { fields } = mapGenerateErrors(error.details)
    return fields.category ?? fields.product ?? fields.instructions ?? null
  }
  return null
}

export function ListOnButton({
  productId,
  marketplace,
  ...props
}: { productId: string; marketplace: Marketplace } & Omit<ComponentProps<typeof Button>, 'onClick' | 'children'>) {
  const can = useCan()
  const listOn = useListOn()
  const accounts = useCurrentMarketplaceAccounts()
  const paused = useAiPaused()
  if (!can('listing:generate')) return null
  if (paused) {
    const { size, variant, className } = props
    return (
      <UnavailableButton size={size} variant={variant} className={className} reason={AI_PAUSED_REASON} data-testid={`list-on-${marketplace}`}>
        {draftLabel(mpName(marketplace))}
      </UnavailableButton>
    )
  }
  const connected = accounts.data ? (['amazon', 'flipkart'] as const).filter((m) => accounts.data.live[m]?.status === 'active') : null
  if (!draftOpen(marketplace, connected)) {
    // While the accounts load the button keeps its place, but can't start anything yet.
    if (!accounts.data && !accounts.isError)
      return (
        <Button {...props} disabled title={DRAFT_HINT} data-testid={`list-on-${marketplace}`}>
          {draftLabel(mpName(marketplace))}
        </Button>
      )
    const { size, variant, className } = props
    return (
      <UnavailableButton size={size} variant={variant} className={className} reason={draftClosedReason(marketplace)} data-testid={`list-on-${marketplace}`}>
        {draftLabel(mpName(marketplace))}
      </UnavailableButton>
    )
  }
  return (
    <Button
      {...props}
      data-testid={`list-on-${marketplace}`}
      title={DRAFT_HINT}
      disabled={listOn.isPending || props.disabled}
      onClick={() =>
        listOn.start(productId, marketplace, {
          onError: (e) => {
            // The app-wide banner explains a pause; no toast.
            if (isAiPausedError(e)) return
            const msg = generateRefusal(e)
            if (msg) toastError(e, msg)
            else toastError(e, `Couldn’t start the ${mpName(marketplace)} draft`)
          },
        })
      }
    >
      {listOn.isPending ? 'Starting…' : draftLabel(mpName(marketplace))}
    </Button>
  )
}
