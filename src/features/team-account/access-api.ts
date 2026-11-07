/**
 * Invites and reset links (contract 2.1.0, SI5):
 *
 *   GET  /invites                         team:manage  pending, accepted, revoked or expired, newest first
 *   POST /invites                         team:manage, step-up any  {email, role} -> {invite, invite_url} (link shown once)
 *   POST /invites/{id}/revoke             team:manage  -> InviteOut (again: same row; accepted: 409)
 *   POST /invites/lookup                  public  {token} -> InvitePreview | the generic 404
 *   POST /invites/accept                  public  {token, display_name?, password? | google?} -> {email, tenant_name}
 *   POST /invites/join                    signed in  {token} -> {tenant_id, role}; then switch-tenant
 *   POST /members/{id}/password-reset     team:manage, step-up otp  -> {reset_url, expires_at} (shown once)
 *   POST /auth/password/reset             public  {token, new_password} -> 204
 *
 * Links and passwords are plain async calls, never mutations: a link or a password must not sit
 * in the MutationCache after the dialog or page is gone. None of these take an Idempotency-Key.
 */
import { api, unwrap } from '@/api/client'
import type { Page, Schema } from '@/api/types'
import { PAGE_SIZE, useCursorList } from '@/hooks/use-cursor-list'
import { useKeys } from '@/lib/query-keys'

export type Invite = Schema<'InviteOut'>
export type InviteCreated = Schema<'InviteCreated'>
export type InvitePreview = Schema<'InvitePreview'>
export type InviteAccepted = Schema<'InviteAccepted'>
export type InviteJoined = Schema<'InviteJoined'>
export type ResetLink = Schema<'ResetLinkOut'>
export type InviteRole = Schema<'InviteCreate'>['role']

/** The open invites (pending), newest first. */
export function usePendingInvites({ enabled }: { enabled?: boolean } = {}) {
  const keys = useKeys()
  return useCursorList<Invite>({
    queryKey: keys.invites.list('pending'),
    enabled,
    fetchPage: (cursor) =>
      unwrap(api.GET('/invites', { params: { query: { status: 'pending', limit: PAGE_SIZE, ...(cursor ? { cursor } : {}) } } })) as Promise<
        Page<Invite>
      >,
  })
}

export const createInvite = (email: string, role: InviteRole): Promise<InviteCreated> =>
  unwrap(api.POST('/invites', { body: { email, role } }))

export const revokeInvite = (inviteId: string): Promise<Invite> =>
  unwrap(api.POST('/invites/{invite_id}/revoke', { params: { path: { invite_id: inviteId } } }))

export const lookupInvite = (token: string): Promise<InvitePreview> => unwrap(api.POST('/invites/lookup', { body: { token } }))

/**
 * One lookup per token, however often React runs the effect (StrictMode): the public invite and
 * reset routes allow about 5 calls a minute from one network. A failed lookup can be tried again.
 */
const lookups = new Map<string, Promise<InvitePreview>>()
export function lookupOnce(token: string): Promise<InvitePreview> {
  let p = lookups.get(token)
  if (!p) {
    p = lookupInvite(token)
    lookups.set(token, p)
    p.catch(() => lookups.delete(token))
  }
  return p
}
export const resetInviteLookups = () => lookups.clear()

export const acceptInviteWithPassword = (token: string, password: string, display_name?: string): Promise<InviteAccepted> =>
  unwrap(api.POST('/invites/accept', { body: display_name ? { token, password, display_name } : { token, password } }))

export const acceptInviteWithGoogle = (token: string, handle: string, binding: string): Promise<InviteAccepted> =>
  unwrap(api.POST('/invites/accept', { body: { token, google: { handle, binding } } }))

export const joinInvite = (token: string): Promise<InviteJoined> => unwrap(api.POST('/invites/join', { body: { token } }))

export const issueResetLink = (userId: string): Promise<ResetLink> =>
  unwrap(api.POST('/members/{user_id}/password-reset', { params: { path: { user_id: userId } } }))

export const redeemResetLink = (token: string, new_password: string): Promise<void> =>
  unwrap(api.POST('/auth/password/reset', { body: { token, new_password } })).then(() => undefined)
