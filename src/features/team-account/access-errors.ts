/** What the invite and reset-link refusals mean, in words (access-api.ts). */
import { describeError, isApiError } from '@/api/errors'
import type { Role } from '@/api/types'

/** POST /invites for `role`. Null: show the generic error (describeError). */
export function inviteErrorMessage(e: unknown, role: Role): { field?: 'email' | 'role'; message: string } | null {
  if (!isApiError(e)) return null
  if (e.status === 422 && e.details.some((d) => d.loc.includes('email')))
    return { field: 'email', message: 'This email is already on your team, or 50 invites are open. Check the team list or cancel an old invite.' }
  // The owner rule is the only 403 tied to the role chosen here; any other 403 is the generic one.
  if (e.status === 403 && e.type === 'PERMISSION_DENIED' && (role === 'owner' || role === 'reviewer'))
    return { field: 'role', message: 'Only an owner can invite an owner or a reviewer.' }
  if (e.status === 429) return { message: 'Too many requests. Wait a minute, then try again.' }
  return null
}

export type ResetRefusal = { message: string; support?: boolean; ref: string | null }

/**
 * POST /members/{id}/password-reset, for a member with `targetRole`, made by `myRole`. `support`:
 * only Kuinn support can reset this account. An admin refused on an owner is the owner rule
 * (backend 403 without the support message), not a support case.
 */
export function resetRefusal(e: unknown, who: { myRole: Role | undefined; targetRole: Role }): ResetRefusal {
  if (!isApiError(e)) return { message: describeError(e), ref: null }
  const ref = e.correlationId
  if (e.status === 403 && e.type === 'PERMISSION_DENIED' && who.targetRole === 'owner' && who.myRole !== 'owner')
    return { message: 'Only an owner can make a reset link for an owner.', ref }
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
