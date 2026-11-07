/**
 * "Someone else must approve": shown to a brand where nobody but the viewer can approve
 * (./approver.ts). The next step is an invite: the button opens "Invite a teammate" on /team.
 */
import { Link } from '@tanstack/react-router'
import { Banner, CONCEPT_ICON } from '@/components/la'
import { Button } from '@/components/ui/button'
import { APPROVER_COPY, useApproverState, type ApproverState } from './approver'

export function ApproverNotice({ className, state: given }: { className?: string; state?: ApproverState }) {
  const read = useApproverState()
  const state = given ?? read
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
