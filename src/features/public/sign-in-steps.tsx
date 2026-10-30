/**
 * The sign-in steps after the first factor, shared by /login (after the password) and
 * /auth/google (after Google): the code step, forced enrolment, the recovery codes shown once, and
 * the forced password change. Both pages hand every `LoginResult` to the same `useSignInFlow`, so
 * the same components, limits and restarts apply whichever way the person started.
 */
import { advance } from '@/features/mfa/login-flow'
import { EnrollStep, MfaCodeStep, PasswordChangeStep, RecoveryCodesStep } from '@/features/mfa/login-steps'
import { AccountChip, AuthCard, AuthFrame } from './auth-frame'
import type { SignInFlow } from './use-sign-in-flow'

/**
 * The step screen for any step but `credentials`. `onSwitch` is "use a different account" (left
 * out on the recovery codes, which must be saved first).
 */
export function SignInSteps({ flow, email, onSwitch }: { flow: SignInFlow; email: string; onSwitch: () => void }) {
  const { step, setStep, apply, onResult, remember, restart } = flow
  if (step.kind === 'credentials') return null
  return (
    <AuthFrame tone="canvas">
      <AuthCard size={step.kind === 'mfa' ? 'sm' : 'lg'}>
        <AccountChip email={email} onSwitch={step.kind === 'recovery-codes' ? undefined : onSwitch} />
        {step.kind === 'mfa' ? (
          <MfaCodeStep key={step.challenge.token} challenge={step.challenge} onResult={(r) => void onResult(r)} onRestart={restart} />
        ) : step.kind === 'enroll' ? (
          <EnrollStep
            key={step.challenge.token}
            challenge={step.challenge}
            // Decide the next step (and start its challenge clock) as the answer arrives, not on Continue.
            onConfirmed={(out) => {
              // A trusted-browser token in the answer is kept now; the tokens wait for Continue.
              void remember(out.result)
              setStep({ kind: 'recovery-codes', codes: out.recovery_codes, next: advance(out.result) })
            }}
            onRestart={restart}
          />
        ) : step.kind === 'recovery-codes' ? (
          <RecoveryCodesStep codes={step.codes} email={email} onContinue={() => void apply(step.next)} />
        ) : (
          <PasswordChangeStep key={step.challenge.token} challenge={step.challenge} email={email} onResult={(r) => void onResult(r)} onRestart={restart} />
        )}
      </AuthCard>
    </AuthFrame>
  )
}
