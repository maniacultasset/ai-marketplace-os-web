/**
 * Back from Google on an invite (intent `invite`) with no Kuinn account for that Google email:
 * accept the invite waiting in this tab with the `needs_details` handle (POST /invites/accept
 * `google`). The Google email must be the invited one (else 422 at `google`); the person then
 * signs in with Google as usual. One accept per handle, however often React runs the effect.
 */
import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { isApiError } from '@/api/errors'
import { Button } from '@/components/ui/button'
import { Notice } from '@/features/public/invite-page'
import { AuthCard, AuthFrame } from '@/features/public/auth-frame'
import { Spinner } from '@/components/ui/spinner'
import { acceptInviteWithGoogle, type InviteAccepted } from '@/features/team-account/access-api'
import { inviteStash } from '@/features/team-account/access-model'
import type { GoogleDetails } from './api'
import { GoogleButton } from './google-button'
import { reasonFor } from './return-state'

const accepts = new Map<string, Promise<InviteAccepted>>()
function acceptOnce(token: string, handle: string, binding: string) {
  let p = accepts.get(handle)
  if (!p) {
    p = acceptInviteWithGoogle(token, handle, binding)
    accepts.set(handle, p)
  }
  return p
}

type State =
  | { kind: 'working' }
  | { kind: 'done'; out: InviteAccepted }
  | { kind: 'no-invite' }
  | { kind: 'invalid' }
  | { kind: 'mismatch' }
  | { kind: 'taken' }
  | { kind: 'error'; title: string; body: string; ref: string | null }

export function InviteGoogleAccept({ details, bind }: { details: GoogleDetails; bind: string }) {
  const [state, setState] = useState<State>(() => (inviteStash.peek() ? { kind: 'working' } : { kind: 'no-invite' }))

  useEffect(() => {
    const token = inviteStash.peek()
    if (!token) return
    let live = true
    acceptOnce(token, details.details_handle, bind).then(
      (out) => {
        inviteStash.clear()
        if (live) setState({ kind: 'done', out })
      },
      (e: unknown) => {
        if (!live) return
        if (isApiError(e) && e.status === 404) {
          inviteStash.clear()
          return setState({ kind: 'invalid' })
        }
        if (isApiError(e) && e.status === 422) return setState({ kind: 'mismatch' })
        if (isApiError(e) && e.status === 409) return setState({ kind: 'taken' })
        const r = reasonFor(e)
        if (r.reason === 'expired')
          return setState({ kind: 'error', title: 'That Google sign-in timed out', body: 'Open the invite again and use Continue with Google.', ref: r.ref })
        if (r.reason === 'too-many') return setState({ kind: 'error', title: 'Too many tries', body: 'Wait a minute, then open the invite again.', ref: r.ref })
        setState({ kind: 'error', title: 'Couldn’t finish joining', body: r.message ?? 'Try again from the invite link.', ref: r.ref })
      },
    )
    return () => {
      live = false
    }
  }, [details.details_handle, bind])

  const back = (
    <Button asChild size="lg" className="w-full">
      <Link to="/invite" data-testid="invite-google-back">
        Back to the invite
      </Link>
    </Button>
  )

  switch (state.kind) {
    case 'working':
      return (
        <AuthFrame tone="canvas">
          <AuthCard size="sm" testId="invite-google-working">
            <div role="status" className="flex flex-col items-center gap-4 py-8 text-center">
              <Spinner className="size-6 text-brand" role="presentation" aria-hidden />
              <p className="text-body font-semibold text-ink">Joining your team…</p>
            </div>
          </AuthCard>
        </AuthFrame>
      )
    case 'done':
      return (
        <Notice
          icon="check"
          tone="ok"
          title={`You joined ${state.out.tenant_name}`}
          testId="invite-google-done"
          action={<GoogleButton intent="login" returnTo="/home" />}
        >
          Your account for {state.out.email} is ready. Continue with Google to sign in.
        </Notice>
      )
    case 'no-invite':
      return (
        <Notice icon="link" tone="neutral" title="Open the invite link again" testId="invite-google-no-invite">
          This tab no longer holds the invite. Open the link from your invite message, then use Continue with Google.
        </Notice>
      )
    case 'invalid':
      return (
        <Notice icon="clock" tone="warn" title="This invite link doesn’t work" testId="invite-google-invalid">
          It may have been used already, cancelled, or replaced by a newer one, or the 7 days ran out. Ask the person who invited you for a
          new link.
        </Notice>
      )
    case 'mismatch':
      return (
        <Notice icon="alert" tone="warn" title="That’s a different Google account" testId="invite-google-mismatch" action={back}>
          You signed in to Google as {details.email}, but the invite is for another email. Use the Google account for the invited email, or
          set a password instead.
        </Notice>
      )
    case 'taken':
      return (
        <Notice icon="user" tone="neutral" title="You already have an account" testId="invite-google-taken">
          This email already has a Kuinn account. Sign in, then open the invite link again to join.
        </Notice>
      )
    case 'error':
      return (
        <Notice icon="alert" tone="fail" title={state.title} reference={state.ref} testId="invite-google-error" action={back}>
          {state.body}
        </Notice>
      )
  }
}
