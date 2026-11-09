import { SUPPORT_EMAIL, supportMailto } from '@/lib/support'

/**
 * What to do about a forgotten password, true whatever the sign-in code setting is. The login
 * page loads before sign-in, so it cannot read that setting: a reset link from an owner or admin
 * works only for some members, and Kuinn support is the fallback for everyone.
 */
export function RecoveryHint({ who }: { who: 'member' | 'new-owner' }) {
  const mail = (
    <a href={supportMailto('Reset my password')} className="font-semibold text-brand underline-offset-4 hover:underline">
      {SUPPORT_EMAIL}
    </a>
  )
  if (who === 'new-owner')
    return (
      <>
        Use the eye to check what you typed. Write it down somewhere safe. Kuinn support can reset it if you forget ({mail}).
      </>
    )
  return (
    <>
      Forgot it? Your brand owner or admin may be able to send you a reset link. If they cannot, email {mail}.
    </>
  )
}
