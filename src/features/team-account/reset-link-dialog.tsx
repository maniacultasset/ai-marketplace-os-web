/**
 * "Reset link" for a member: confirm, then POST /members/{id}/password-reset (a TOTP step-up
 * first), then the link shown once with Copy. It works once, for 24 hours; a new link replaces the
 * old one. Nothing changes for the member until they use it: then their sessions and trusted
 * browsers end and their login code stays.
 *
 * Only a member of this brand alone with an authenticator, while everyone signs in with a login
 * code, can get one (PLAN D8). The browser cannot see another brand or a missing authenticator,
 * so that refusal (403) is said here, with the way to Kuinn support.
 */
import { useState } from 'react'
import { isApiError } from '@/api/errors'
import { Banner } from '@/components/la/banner'
import { IconTile } from '@/components/la/icons'
import { ReferenceId } from '@/components/states/reference-id'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { SUPPORT_EMAIL, supportMailto } from '@/lib/support'
import { issueResetLink, type ResetLink } from './access-api'
import { resetRefusal, type ResetRefusal as Refusal } from './access-errors'
import { RESET_HOURS, shortDateTime } from './access-model'
import { OneTimeLink } from './one-time-link'
import type { Member } from './roles'

export function ResetLinkDialog({ member, open, onClose }: { member: Member | null; open: boolean; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-lg" data-testid="reset-dialog" showCloseButton={!busy}>
        {/* Radix unmounts the content when closed, so the link leaves memory with it. */}
        <ResetBody member={member} onClose={onClose} busy={busy} setBusy={setBusy} />
      </DialogContent>
    </Dialog>
  )
}

function ResetBody({ member, onClose, busy, setBusy }: { member: Member | null; onClose: () => void; busy: boolean; setBusy: (b: boolean) => void }) {
  const [link, setLink] = useState<ResetLink | null>(null)
  const [refusal, setRefusal] = useState<Refusal | null>(null)

  const onMake = async () => {
    if (!member) return
    setBusy(true)
    setRefusal(null)
    try {
      setLink(await issueResetLink(member.user_id))
    } catch (e) {
      if (isApiError(e) && e.status === 401) return
      setRefusal(resetRefusal(e))
    } finally {
      setBusy(false)
    }
  }

  const who = member?.display_name ?? member?.email ?? ''

  return link && member ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <IconTile icon="check" tone="ok" size="sm" />
                Reset link ready
              </DialogTitle>
              <DialogDescription>
                For <span className="font-semibold [overflow-wrap:anywhere] text-ink">{member.email}</span>. It works once, until{' '}
                {shortDateTime(link.expires_at)}.
              </DialogDescription>
            </DialogHeader>
            <OneTimeLink
              url={link.reset_url}
              label="Reset link"
              testId="reset-link"
              note={`Send this link to them yourself (Kuinn does not email it). You see it only now. It works for ${RESET_HOURS} hours.`}
            />
            <DialogFooter>
              <Button onClick={onClose} data-testid="reset-done">
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Make a reset link for {who}?</DialogTitle>
              <DialogDescription>
                They use it to choose a new password. When they do, they are signed out everywhere. Their login code stays the same.
                A link you made before stops working.
              </DialogDescription>
            </DialogHeader>
            {refusal ? (
              <Banner tone={refusal.support ? 'attention' : 'danger'} role="alert">
                <span className="block" data-testid="reset-refusal">
                  {refusal.message}
                  {refusal.support ? (
                    <>
                      {' '}
                      Email{' '}
                      <a href={supportMailto('Reset a teammate’s password')} className="font-semibold underline underline-offset-2">
                        {SUPPORT_EMAIL}
                      </a>
                      .
                    </>
                  ) : null}
                </span>
                <ReferenceId id={refusal.ref} className="mt-1" />
              </Banner>
            ) : null}
            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={() => void onMake()} disabled={busy || !!refusal?.support} data-testid="reset-make">
                {busy ? <Spinner data-icon="inline-start" /> : null}
                {busy ? 'Making link…' : 'Make reset link'}
              </Button>
            </DialogFooter>
          </>
        )
}
