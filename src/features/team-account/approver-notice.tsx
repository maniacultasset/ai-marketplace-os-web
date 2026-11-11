/**
 * Approver notices (./approver.ts).
 * - "Someone else must approve": a brand where nobody but the viewer can approve. The next step is
 *   an invite: the button opens "Invite a teammate" on /team.
 * - "Two-person approval is on": the same for an owner while owner approval is off. Two ways
 *   forward: turn on owner approval (Settings > Autonomy) or invite a reviewer.
 * - ApprovalRule: the rule in one line before the seller reaches approval (setup), or one of the
 *   notices above when it blocks them.
 * - SelfApprovalNote: next to Approve when the server says the approval is a self-approval.
 */
import { Link } from '@tanstack/react-router'
import { Banner, CONCEPT_ICON } from '@/components/la'
import { Button } from '@/components/ui/button'
import { useBrandProfile } from '@/features/brand/api'
import { useMe } from '@/lib/auth'
import { cn } from '@/lib/utils'
import {
  APPROVER_COPY,
  OWNER_APPROVAL_COPY,
  OWNER_APPROVAL_HASH,
  SELF_APPROVAL_NOTE,
  useApproverState,
  type ApproverState,
} from './approver'

export function ApproverNotice({ className, state: given }: { className?: string; state?: ApproverState }) {
  const read = useApproverState()
  const state = given ?? read
  if (state === 'owner_alone') return <OwnerApprovalNotice className={className} />
  if (state !== 'alone') return null
  return (
    <Banner
      tone="attention"
      icon={CONCEPT_ICON.approval}
      title={APPROVER_COPY.title}
      className={className}
      action={
        <Button asChild variant="secondary" size="sm">
          <Link to="/team" search={{ invite: 1 }} data-testid="approver-invite">
            Invite a teammate
          </Link>
        </Button>
      }
    >
      <span data-testid="approver-notice">{APPROVER_COPY.body}</span>
    </Banner>
  )
}

/** Both actions sit under the text, so the banner also fits the 400px setup column. */
function OwnerApprovalNotice({ className }: { className?: string }) {
  return (
    <Banner tone="attention" icon={CONCEPT_ICON.approval} title={OWNER_APPROVAL_COPY.title} className={className} data-testid="owner-approval-notice">
      <p data-testid="approver-notice">{OWNER_APPROVAL_COPY.body}</p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <Button asChild variant="secondary" size="sm">
          <Link to="/settings" hash={OWNER_APPROVAL_HASH} data-testid="owner-approval-enable">
            {OWNER_APPROVAL_COPY.enable}
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link to="/team" search={{ invite: 1, role: 'reviewer' }} data-testid="approver-invite">
            {OWNER_APPROVAL_COPY.invite}
          </Link>
        </Button>
      </div>
    </Banner>
  )
}

/**
 * Setup's line on approval. A viewer the rule blocks gets the notice instead; while the team or
 * brand is unread nothing shows, so the line never changes its mind.
 */
export function ApprovalRule({ className }: { className?: string }) {
  const state = useApproverState()
  const me = useMe()
  const profile = useBrandProfile()
  if (state === 'alone' || state === 'owner_alone') return <ApproverNotice state={state} className={className} />
  if (state === 'loading' || profile.isPending) return null
  const on = profile.data?.data.owner_self_approval === true
  const settings =
    me.data?.role === 'owner' ? (
      <Link to="/settings" hash={OWNER_APPROVAL_HASH} className="font-semibold text-ink-2 underline-offset-4 hover:underline" data-testid="approval-rule-link">
        Settings
      </Link>
    ) : (
      'Settings'
    )
  return (
    <p className={cn('text-caption text-ink-3', className)} data-testid="approval-rule">
      {on ? (
        <>Owner approval is on: an owner can approve their own listings, and each one is recorded.</>
      ) : (
        <>
          Two-person approval is on: the person who makes or edits a listing can’t approve it. An owner who works alone can
          turn on owner approval in {settings}.
        </>
      )}
    </p>
  )
}

/**
 * "You're approving your own work. This is recorded." Only when the server says so
 * (ListingDetail.self_approval) and Approve is actually offered.
 */
export function SelfApprovalNote({ selfApproval, enabled, className }: { selfApproval: boolean | null | undefined; enabled: boolean; className?: string }) {
  if (selfApproval !== true || !enabled) return null
  return (
    <span className={cn('block text-caption text-ink-3', className)} data-testid="self-approval-note">
      {SELF_APPROVAL_NOTE}
    </span>
  )
}
