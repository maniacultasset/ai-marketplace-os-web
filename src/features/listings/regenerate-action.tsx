/**
 * "Generate again" / "Regenerate listing": POST /listings/{id}/regenerate (Idempotency-Key), gated
 * like everywhere else by listingActions().regenerate and the AI credit pause. A regenerate makes a
 * new draft version that waits for approval; it never publishes. On success it opens the run.
 *
 * `RegenerateListings` is the one next step after a seller answer the listing text does not use
 * yet (prod demo 9 Nov: the answer said "Regenerate the listing to use your answer" with no
 * control anywhere): one button per listing of the product that has content to regenerate.
 */
import { useNavigate } from '@tanstack/react-router'
import { BUILT } from '@/api/capabilities'
import { isApiError } from '@/api/errors'
import { useIntentKey } from '@/api/idempotency'
import { Icon } from '@/components/la/icons'
import { AI_PAUSED_REASON, isAiPausedError } from '@/features/ai-credit/model'
import { useAiPaused } from '@/features/ai-credit/use-ai-paused'
import { useRegenerateListing } from '@/features/listings/api'
import { rememberJob } from '@/features/listings/job-memory'
import { listingActions, type Listing, type ValidationSummary } from '@/features/listings/model'
import { useProductListings } from '@/features/listing-flow/api'
import { ActionButton } from '@/features/listing-flow/ui'
import { useCan } from '@/lib/permissions'
import { regenerable, regenerateLabel } from './regenerate-model'
import { toastError } from '@/lib/toast'

type RegenerableListing = Pick<Listing, 'id' | 'status' | 'status_reason' | 'current_version_id' | 'approved_version_id'> & {
  validation?: Pick<ValidationSummary, 'passed' | 'listing_version_id'> | null
}

export function RegenerateAction({
  listing,
  label = 'Generate again',
  variant,
  testId = 'task-regenerate',
}: {
  listing: RegenerableListing
  label?: string
  variant?: 'primary' | 'secondary'
  testId?: string
}) {
  const can = useCan()
  const navigate = useNavigate()
  const regenerate = useRegenerateListing(listing.id)
  const key = useIntentKey()
  const paused = useAiPaused()
  const base = listingActions({ listing, validation: listing.validation, can, publishBuilt: BUILT['listings.publish'] }).regenerate
  const state = paused && base.show ? { show: true, enabled: false, reason: AI_PAUSED_REASON } : base
  return (
    <ActionButton
      state={state}
      variant={variant}
      disabled={regenerate.isPending}
      data-testid={testId}
      onClick={() =>
        regenerate.mutate(
          { instructions: null, key: key.get() },
          {
            onSuccess: (a) => {
              key.reset()
              rememberJob(listing.id, a.job_id)
              void navigate({ to: '/runs/$runId', params: { runId: a.job_id } })
            },
            onError: (e) => {
              if (isApiError(e) && !e.isNetwork) key.reset()
              // A pause shows in the app-wide banner instead.
              if (isAiPausedError(e)) return
              toastError(e, 'Couldn’t start a new generation')
            },
          },
        )
      }
    >
      <Icon name="refresh" size={16} />
      {regenerate.isPending ? 'Starting…' : label}
    </ActionButton>
  )
}

/** One Regenerate per listing of the product; nothing while the listings load or when none has content. */
export function RegenerateListings({ productId, variant = 'primary' }: { productId: string; variant?: 'primary' | 'secondary' }) {
  const listings = useProductListings(productId)
  const rows = regenerable(listings.rows)
  return (
    <>
      {rows.map((l) => (
        <RegenerateAction key={l.id} listing={l} variant={variant} label={regenerateLabel(l.marketplace, rows.length > 1)} testId="answer-regenerate" />
      ))}
    </>
  )
}
