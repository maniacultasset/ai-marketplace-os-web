/** What the invite and reset-link refusals mean, in words (access-api.ts). */
import { describeError, isApiError } from '@/api/errors'

/** POST /invites. Null: show the generic error. */
export function inviteErrorMessage(e: unknown): { field?: 'email' | 'role'; message: string } | null {
  if (!isApiError(e)) return null
  if (e.status === 422 && e.details.some((d) => d.loc.includes('email')))
    return { field: 'email', message: 'This email is already on your team, or 50 invites are open. Check the team list or cancel an old invite.' }
  if (e.status === 403 && e.type === 'PERMISSION_DENIED') return { field: 'role', message: 'Only an owner can invite an owner.' }
  if (e.status === 429) return { message: 'Too many requests. Wait a minute, then try again.' }
  return null
}

export type ResetRefusal = { message: string; support?: boolean; ref: string | null }

/** POST /members/{id}/password-reset. `support`: only Kuinn support can reset this account. */
export function resetRefusal(e: unknown): ResetRefusal {
  if (!isApiError(e)) return { message: describeError(e), ref: null }
  const ref = e.correlationId
  if (e.status === 403 && e.type === 'PERMISSION_DENIED')
    return {
      message: 'Kuinn support resets this account. A reset link works only for someone who is in this brand alone and has set up login codes.',
      support: true,
      ref,
    }
  if (e.status === 422) return { message: 'Change your own password in Settings > Security.', ref }
  if (e.status === 404) return { message: 'This member is no longer in this brand.', ref }
  if (e.status === 429) return { message: 'Too many requests. Wait a minute, then try again.', ref }
  return { message: describeError(e), ref }
}
