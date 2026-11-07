/**
 * "Someone else must approve": shown to a brand where nobody but the viewer can approve
 * (./approver.ts). Team invites are not built yet, so the next step is the Team page and a
 * support email; it links to the invite once that lands.
 */
import { Link } from '@tanstack/react-router'
import { Banner, CONCEPT_ICON } from '@/components/la'
import { Button } from '@/components/ui/button'
import { SUPPORT_EMAIL, supportMailto } from '@/lib/support'
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
          <Link to="/team">Open Team</Link>
        </Button>
      }
    >
      <span data-testid="approver-notice">
        {APPROVER_COPY.body} To add one now, email{' '}
        <a href={supportMailto('Add a teammate')} className="font-semibold underline underline-offset-2">
          {SUPPORT_EMAIL}
        </a>
        .
      </span>
    </Banner>
  )
}
