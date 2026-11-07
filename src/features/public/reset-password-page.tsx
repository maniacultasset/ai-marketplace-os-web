/**
 * /reset-password#token=…: a reset link an owner or admin made for a teammate (contract 2.1.0,
 * SI5). The token is read from the fragment once, taken out of the address bar and kept in this tab
 * only. POST /auth/password/reset sets the new password (the password rules, none of the last 10);
 * then every session and trusted browser of the account ends, and the login code stays. Any
 * refusal of the link (used, replaced, expired, no longer allowed) is the same 404.
 */
import { Link } from '@tanstack/react-router'
import { useId, useState } from 'react'
import { isApiError } from '@/api/errors'
import { IconTile } from '@/components/la/icons'
import { Button } from '@/components/ui/button'
import { StepHeader } from '@/features/mfa/login-steps'
import { PasswordForm } from '@/features/mfa/password-form'
import { redeemResetLink } from '@/features/team-account/access-api'
import { resetStash, takeLinkToken, type LinkToken } from '@/features/team-account/access-model'
import { AuthCard, AuthFrame } from './auth-frame'
import { Notice } from './invite-page'
import { useDocumentTitle } from './use-document-title'

type View = 'form' | 'missing' | 'invalid' | 'done'

const first = (t: LinkToken): View => (t.kind === 'ok' ? 'form' : t.kind === 'missing' ? 'missing' : 'invalid')

export function ResetPasswordPage() {
  useDocumentTitle('Choose a new password')
  const [token] = useState(() => takeLinkToken(resetStash))
  const [view, setView] = useState<View>(() => first(token))
  const introId = useId()

  if (view === 'missing')
    return (
      <Notice icon="link" tone="neutral" title="Open the whole reset link" testId="reset-missing">
        This page needs the full link you were sent, including the part after the # sign. Copy it again from the message you got.
      </Notice>
    )
  if (view === 'invalid')
    return (
      <Notice icon="clock" tone="warn" title="This reset link doesn’t work" testId="reset-invalid">
        It may have been used already or replaced by a newer one, or the 24 hours ran out. Ask your brand owner or admin for a new link.
      </Notice>
    )
  if (view === 'done')
    return (
      <Notice
        icon="check"
        tone="ok"
        title="Password changed"
        testId="reset-done"
        action={
          <Button asChild size="lg" className="w-full">
            <Link to="/login" data-testid="reset-sign-in">
              Sign in
            </Link>
          </Button>
        }
      >
        Sign in with your new password. You were signed out everywhere else. Your login code is the same as before.
      </Notice>
    )

  return (
    <AuthFrame tone="canvas">
      <AuthCard size="lg" testId="reset-card">
        <StepHeader title="Choose a new password" introId={introId} focus icon={<IconTile icon="lock" tone="brand" size="lg" />}>
          This link works once. After you save, you are signed out on every device, then you sign in with the new password and your
          usual login code.
        </StepHeader>
        <PasswordForm
          email=""
          requireCurrent={false}
          submitLabel="Save new password"
          idPrefix="reset"
          testId="reset-form"
          autoFocus
          onSubmit={async ({ new_password }) => {
            if (token.kind !== 'ok') return
            try {
              await redeemResetLink(token.token, new_password)
            } catch (e) {
              if (isApiError(e) && e.status === 404) {
                resetStash.clear()
                setView('invalid')
                return
              }
              throw e
            }
            resetStash.clear()
            setView('done')
          }}
        />
      </AuthCard>
    </AuthFrame>
  )
}
