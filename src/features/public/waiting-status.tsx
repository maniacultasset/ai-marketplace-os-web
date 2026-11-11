/**
 * The waiting screens' live status: the stored status handle polled with POST /signup/status/poll
 * (features/signup-admin/poll.ts), the copy for each state, and the one next step.
 *
 *   pending   brand and request time; the page updates by itself (and, when the handle is kept on
 *             this device, it can be closed and opened again)
 *   approved  one button into the workspace: Google sign-in again, or the password sign-in, with
 *             the intended page kept
 *   rejected  the reviewer's reason and how to reach support
 */
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { Icon } from '@/components/la/icons'
import { Button } from '@/components/ui/button'
import { GoogleButton } from '@/features/google/google-button'
import { clearStatusHandle, type SignInVia } from '@/features/signup-admin/status-handle'
import { COMPANY } from './company'
import type { StatusView } from './waiting'

/** The one next step for a status, plus `secondary` (a back link) under it. */
export function WaitingActions({
  status,
  via,
  returnTo,
  email,
  secondary,
}: {
  status: StatusView['status']
  via: SignInVia
  returnTo: string | null
  email?: string
  secondary?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3">
      {status === 'approved' ? (
        via === 'google' ? (
          <div onClickCapture={clearStatusHandle} data-testid="waiting-continue">
            <GoogleButton intent="login" returnTo={returnTo} />
          </div>
        ) : (
          <Button asChild size="lg" className="w-full">
            <Link to="/login" search={returnTo ? { redirect: returnTo } : {}} onClick={clearStatusHandle} data-testid="waiting-continue">
              Continue to your workspace
              <Icon name="arrow" size={16} />
            </Link>
          </Button>
        )
      ) : status === 'rejected' ? (
        <>
          <Button asChild size="lg" className="w-full">
            <a href={`mailto:${COMPANY.email}`} data-testid="waiting-support">
              Contact support
            </a>
          </Button>
          <Button asChild size="lg" variant="secondary" className="w-full">
            <Link to="/signup" search={email && via === 'password' ? { email } : {}} onClick={clearStatusHandle} data-testid="signup-status-reapply">
              Apply again
            </Link>
          </Button>
        </>
      ) : null}
      {secondary}
    </div>
  )
}
