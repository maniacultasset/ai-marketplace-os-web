/**
 * 403 TENANT_SUSPENDED after a correct password or Google sign-in (SI10): the brand's access is
 * paused (its trial ended or Kuinn staff paused it). Never "wrong password": the person did
 * nothing wrong, so the screen says what happened and the one next step.
 */
import { isApiError } from '@/api/errors'
import { IconTile } from '@/components/la/icons'
import { ReferenceId } from '@/components/states/reference-id'
import { Button } from '@/components/ui/button'
import { SUPPORT_EMAIL, supportMailto } from '@/lib/support'
import { AuthCard, AuthFrame } from './auth-frame'

export const isTenantSuspended = (e: unknown) => isApiError(e) && e.type === 'TENANT_SUSPENDED'

export function SuspendedCard({ reference, onBack }: { reference: string | null; onBack: () => void }) {
  const body = reference ? `My brand's access is paused. Reference: ${reference}` : "My brand's access is paused."
  return (
    <AuthFrame tone="canvas">
      <AuthCard size="sm" testId="suspended-card">
        <div>
          <IconTile icon="clock" tone="warn" size="lg" className="mb-4" />
          <h1 className="font-display text-h2 text-ink sm:text-h1">Your brand’s access is paused</h1>
          <p className="mt-2 text-body text-pretty text-ink-2">
            Your password is right. Your brand’s trial has ended, or its access was paused, so you can’t sign in for now.
            Your products and listings are kept safe.
          </p>
          <p className="mt-3 text-body text-pretty text-ink-2">
            To get going again, write to <span className="font-semibold text-ink">{SUPPORT_EMAIL}</span>.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <Button asChild size="lg" className="sm:flex-1">
            <a href={supportMailto('Brand access paused', body)}>Contact support</a>
          </Button>
          <Button type="button" variant="secondary" size="lg" className="sm:flex-1" onClick={onBack}>
            Back to sign in
          </Button>
        </div>
        {reference ? <ReferenceId id={reference} /> : null}
      </AuthCard>
    </AuthFrame>
  )
}
