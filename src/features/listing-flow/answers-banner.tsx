/**
 * The answers banner on Review (client feedback 14) and the "Generate again" button it shares with
 * the rest of the page. With `affected_sections` from the server the banner names the sections the
 * answered facts feed and "Update these sections" rewrites only those (`for_answers`); the full
 * "Generate again" stays as the second button, with the whole regenerate's body.
 */
import { useNavigate } from '@tanstack/react-router'
import { isApiError } from '@/api/errors'
import { useIntentKey } from '@/api/idempotency'
import { Banner, Icon } from '@/components/la'
import { AI_PAUSED_REASON, isAiPausedError } from '@/features/ai-credit/model'
import { useAiPaused } from '@/features/ai-credit/use-ai-paused'
import { useRegenerateListing } from '@/features/listings/api'
import { rememberJob } from '@/features/listings/job-memory'
import type { ActionState, ListingDetail } from '@/features/listings/model'
import { toastError } from '@/lib/toast'
import { sectionList, type Section } from './sections-model'
import { ActionButton } from './ui'

/** "Your answers are saved." with the sections they affect, when the server names any. */
export function AnswersBanner({ listing, affected, state }: { listing: ListingDetail; affected: readonly Section[]; state: ActionState }) {
  return (
    <Banner
      tone="attention"
      className="mb-4"
      title="Your answers are saved."
      data-testid="answered-regenerate"
      action={
        <span className="flex flex-wrap gap-2">
          {affected.length ? (
            <RegenerateButton
              listing={listing}
              state={state}
              sections={affected}
              testId="answered-update-sections"
              label="Update these sections"
              variant="primary"
            />
          ) : null}
          <RegenerateButton listing={listing} state={state} testId="answered-regenerate-button" />
        </span>
      }
    >
      {affected.length
        ? `They affect: ${sectionList(affected)}. Only these sections are rewritten, and the new version waits for approval.`
        : listing.status === 'blocked'
          ? 'Generate the listing again to use them. Until then it stays blocked.'
          : 'Generate the listing again to use them. The new version stays a draft until it is approved.'}
    </Banner>
  )
}

/** "Generate again" (POST /listings/{id}/regenerate) after a photo value was removed here. */
export function RegenerateButton({
  listing,
  state: given,
  testId = 'photo-regenerate',
  sections,
  label = 'Generate again',
  variant = 'secondary',
}: {
  listing: ListingDetail
  state: ActionState
  testId?: string
  /** Client feedback 14: rewrite only these (the answers' sections, `for_answers`). */
  sections?: readonly Section[]
  label?: string
  variant?: 'primary' | 'secondary'
}) {
  const paused = useAiPaused()
  const state: ActionState = paused && given.show ? { show: true, enabled: false, reason: AI_PAUSED_REASON } : given
  const navigate = useNavigate()
  const regenerate = useRegenerateListing(listing.id)
  const key = useIntentKey()
  return (
    <ActionButton
      state={state}
      size="sm"
      variant={variant}
      disabled={regenerate.isPending}
      data-testid={testId}
      onClick={() =>
        regenerate.mutate(
          { instructions: null, key: key.get(), ...(sections?.length ? { sections, forAnswers: true } : {}) },
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
      <Icon name="refresh" size={14} />
      {regenerate.isPending ? 'Starting…' : label}
    </ActionButton>
  )
}
