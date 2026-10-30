/**
 * MFA, step-up and password calls (contract 2.0.0, routers/auth.py; docs/HANDOFF-FE.md §6).
 *
 * These are plain async functions, not TanStack mutations, on purpose: a mutation keeps its
 * variables and its data in the MutationCache for minutes after the screen is gone, and here they
 * are passwords, codes, authenticator secrets and recovery codes. Callers hold results in
 * component state only, which goes when the screen unmounts.
 */
import { queryOptions } from '@tanstack/react-query'
import { api, unwrap } from '@/api/client'
import { describeError, isApiError } from '@/api/errors'
import type { Schema } from '@/api/types'
import type { LoginConfirmOut, LoginResult, RecoveryCodesOut, SecurityOut, StepUpOut, TotpEnrollOut, TrustedDevicesOut } from './types'

// The generator marks `trust_device` required (it has a default); on the wire it is optional.
type LoginMfaBody = Schema<'LoginMfaRequest'>
type LoginConfirmBody = Schema<'LoginConfirmRequest'>

/** Exactly one of a 6-digit TOTP code or a recovery code (LoginMfaRequest / StepUpRequest). */
export type SecondFactor = { code: string } | { recovery_code: string }

// ---- sign-in challenge steps (public, never refresh on 401) ----

/**
 * `trust_device` only when the step offered it (`Challenge.trustDays`): an API older than 2.1.0
 * refuses unknown fields with 422, so the field is left out rather than sent as false. The API
 * ignores it with a recovery code, and the code step never sends it then.
 */
const trustField = (trust: boolean | undefined) => (trust === undefined ? {} : { trust_device: trust })

export const loginMfa = (challenge_token: string, factor: SecondFactor, trust?: boolean): Promise<LoginResult> =>
  unwrap(api.POST('/auth/login/mfa', { body: { challenge_token, ...factor, ...trustField(trust) } as LoginMfaBody }))

export const loginEnroll = (challenge_token: string): Promise<TotpEnrollOut> =>
  unwrap(api.POST('/auth/login/mfa/enroll', { body: { challenge_token } }))

export const loginConfirm = (challenge_token: string, code: string, trust?: boolean): Promise<LoginConfirmOut> =>
  unwrap(api.POST('/auth/login/mfa/confirm', { body: { challenge_token, code, ...trustField(trust) } as LoginConfirmBody }))

export const passwordExpired = (challenge_token: string, new_password: string): Promise<LoginResult> =>
  unwrap(api.POST('/auth/password/expired', { body: { challenge_token, new_password } }))

// ---- account settings (bearer) ----

export const securityQueryOptions = (queryKey: readonly unknown[]) =>
  queryOptions({
    queryKey,
    queryFn: (): Promise<SecurityOut> => unwrap(api.GET('/auth/security')),
    staleTime: 30_000,
  })

/** `current_password` while there is no factor; omitted to replace one (needs a step-up). */
export const totpEnroll = (current_password?: string): Promise<TotpEnrollOut> =>
  unwrap(api.POST('/auth/mfa/totp/enroll', { body: current_password ? { current_password } : {} }))

export const totpConfirm = (code: string): Promise<string[]> =>
  unwrap(api.POST('/auth/mfa/totp/confirm', { body: { code } })).then((r) => r.recovery_codes)

export const regenerateRecoveryCodes = (): Promise<string[]> =>
  unwrap(api.POST('/auth/mfa/recovery-codes')).then((r: RecoveryCodesOut) => r.recovery_codes)

export const stepUp = (factor: SecondFactor): Promise<StepUpOut> =>
  unwrap(api.POST('/auth/mfa/step-up', { body: factor }))

export const changePassword = (current_password: string, new_password: string): Promise<void> =>
  unwrap(api.POST('/auth/password', { body: { current_password, new_password } })).then(() => undefined)

// ---- trusted browsers (contract 2.1.0; own account only, no step-up) ----

export const devicesQueryOptions = (queryKey: readonly unknown[]) =>
  queryOptions({
    queryKey,
    queryFn: (): Promise<TrustedDevicesOut> => unwrap(api.GET('/auth/devices')),
    staleTime: 30_000,
    // An API older than 2.1.0 answers 404/405 and the card hides: never retry a 4xx; a 5xx once.
    retry: (n, e) => !(isApiError(e) && e.status < 500) && n < 1,
  })

/** Forget one trusted browser; the sessions it signed in end too (this one, if it is `current`). */
export const removeDevice = (device_id: string): Promise<void> =>
  unwrap(api.DELETE('/auth/devices/{device_id}', { params: { path: { device_id } } })).then(() => undefined)

/** Forget every trusted browser and sign out every other session. This session stays. */
export const signOutAllDevices = (): Promise<void> => unwrap(api.POST('/auth/devices/sign-out-all')).then(() => undefined)

// ---- errors ----

/** The 422 rule sentences for `field` (password_rules_error: one detail per broken rule). */
export function ruleMessages(e: unknown, field: string): string[] {
  if (!isApiError(e) || e.status !== 422) return []
  return e.details.filter((d) => d.loc[0] === 'body' && d.loc[1] === field).map((d) => d.msg)
}

/**
 * Sentence for an MFA or password call that failed. A 422 with no field detail carries a fixed,
 * safe sentence from the backend (wrong current password, once a day, wrong code), so it is shown
 * as is; a 501 means MFA is off on the server.
 */
export function mfaErrorMessage(e: unknown): string {
  if (!isApiError(e)) return describeError(e)
  if (e.status === 422 && e.details.length === 0 && e.message) return e.message
  if (e.status === 501) return 'Login codes are not switched on yet.'
  return describeError(e)
}
