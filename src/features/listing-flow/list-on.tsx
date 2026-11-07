/**
 * "List on <marketplace>" (p14 Next, p12 lanes, product detail): POST /listings/generate with an
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
import { toastError } from '@/lib/toast'
import { useListOn } from './api'
import { mpName } from './format'

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
  if (!can('listing:generate')) return null
  const connected = accounts.data ? (['amazon', 'flipkart'] as const).filter((m) => accounts.data.live[m]?.status === 'active') : null
  if (!draftOpen(marketplace, connected)) {
    // While the accounts load the button keeps its place, but can't start anything yet.
    if (!accounts.data && !accounts.isError)
      return (
        <Button {...props} disabled data-testid={`list-on-${marketplace}`}>
          {`List on ${mpName(marketplace)}`}
        </Button>
      )
    const { size, variant, className } = props
    return (
      <UnavailableButton size={size} variant={variant} className={className} reason={draftClosedReason(marketplace)} data-testid={`list-on-${marketplace}`}>
        {`List on ${mpName(marketplace)}`}
      </UnavailableButton>
    )
  }
  return (
    <Button
      {...props}
      data-testid={`list-on-${marketplace}`}
      disabled={listOn.isPending || props.disabled}
      onClick={() =>
        listOn.start(productId, marketplace, {
          onError: (e) => {
            const msg = generateRefusal(e)
            if (msg) toastError(e, msg)
            else toastError(e, `Couldn’t start the listing on ${mpName(marketplace)}`)
          },
        })
      }
    >
      {listOn.isPending ? 'Starting…' : `List on ${mpName(marketplace)}`}
    </Button>
  )
}
