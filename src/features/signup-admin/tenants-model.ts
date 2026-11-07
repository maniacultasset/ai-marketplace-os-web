/**
 * Brand recovery for platform admins (contract 2.1.0, SI5; backend services/tenant_admin.py):
 *
 *   Activate      trial or suspended -> active, with a reason (1..500). Active already: the same row.
 *   Extend trial  1..90 days, with a reason. A trial ends `max(trial end, now) + days`; a brand
 *                 suspended because its trial ran out goes back to trial, ending now + days. A brand
 *                 suspended by Kuinn staff is 409 (only Activate helps it).
 *
 * Suspend and offboard stay with the staff CLI. Reactivation restores no session: members sign
 * in again.
 */
import { format } from 'date-fns'
import { describeError, isApiError } from '@/api/errors'
import type { Schema } from '@/api/types'
import { codePoints, hasStrayControlChars } from '@/lib/validation'

export type TenantAdmin = Schema<'TenantAdminOut'>
export type TenantStatus = TenantAdmin['status']

export const EXTEND_DAYS_MIN = 1
export const EXTEND_DAYS_MAX = 90
/** What the Extend dialog suggests: the standard trial length (backend DEFAULT_TRIAL_DAYS). */
export const EXTEND_DAYS_SUGGESTED = 30
export const REASON_MAX = 500

export const TENANT_STATUS_META: Record<TenantStatus, { label: string; variant: 'success' | 'brand' | 'warning' | 'muted' }> = {
  active: { label: 'Active', variant: 'success' },
  trial: { label: 'Trial', variant: 'brand' },
  suspended: { label: 'Suspended', variant: 'warning' },
  offboarded: { label: 'Offboarded', variant: 'muted' },
}

export const canActivate = (s: TenantStatus) => s === 'trial' || s === 'suspended'
/** A suspended brand may still answer 409 (suspended by staff, not by its trial): the dialog says so. */
export const canExtend = (s: TenantStatus) => s === 'trial' || s === 'suspended'

/** Whole days 1..90, or 'invalid'. Leading zeros and spaces are fine; anything else is not. */
export function parseExtendDays(raw: string): number | 'invalid' {
  const v = raw.trim()
  if (!/^[0-9]{1,3}$/.test(v)) return 'invalid'
  const n = Number(v)
  return n >= EXTEND_DAYS_MIN && n <= EXTEND_DAYS_MAX ? n : 'invalid'
}

/** The reason as the API takes it (trimmed, 1..500 code points), or the problem in words. */
export function checkReason(raw: string): { ok: true; value: string } | { ok: false; message: string } {
  const v = raw.trim()
  if (!v) return { ok: false, message: 'Say why, for the audit log.' }
  if (hasStrayControlChars(v)) return { ok: false, message: 'Remove the hidden control character (it often comes in with a paste).' }
  if (codePoints(v) > REASON_MAX) return { ok: false, message: `Shorten the reason to ${REASON_MAX} characters or fewer.` }
  return { ok: true, value: v }
}

/** When the trial would end after extending by `days` (mirrors the backend rule above). */
export function extendedTrialEnd(t: Pick<TenantAdmin, 'status' | 'trial_ends_at'>, days: number, now = Date.now()): Date {
  const end = t.status === 'trial' && t.trial_ends_at ? new Date(t.trial_ends_at).getTime() : Number.NaN
  const from = Number.isNaN(end) ? now : Math.max(end, now)
  return new Date(from + days * 86_400_000)
}

/** "Ends 9 Dec 2026", "Ended 2 Nov 2026", or null when there is no trial date to show. */
export function trialEndLabel(t: Pick<TenantAdmin, 'status' | 'trial_ends_at'>, now = Date.now()): string | null {
  if (!t.trial_ends_at) return null
  const d = new Date(t.trial_ends_at)
  if (Number.isNaN(d.getTime())) return null
  const day = dayLabel(d)
  if (t.status === 'active' || t.status === 'offboarded') return null
  return d.getTime() > now ? `Ends ${day}` : `Ended ${day}`
}

/** The list filters on /admin/brands (`?status=`). */
export const TENANT_TABS = ['all', 'trial', 'suspended'] as const
export type TenantTab = (typeof TENANT_TABS)[number]

export type RecoveryKind = 'activate' | 'extend'

/** What a refused recovery means, in words. */
export function recoveryError(e: unknown, kind: RecoveryKind): string {
  if (!isApiError(e)) return describeError(e)
  if (e.status === 409)
    return kind === 'extend'
      ? 'This brand was not stopped by its trial ending (Kuinn staff suspended it, or it is offboarded), so its trial can’t be extended. Activate it instead, if that is right.'
      : 'This brand is offboarded and can’t be activated here.'
  if (e.status === 404) return 'This brand no longer exists. The list has been refreshed.'
  if (e.status === 403) return 'Only platform admins can do this.'
  return describeError(e)
}

/** "8 Dec 2026", the same in every browser language. */
export const dayLabel = (d: Date) => format(d, 'd MMM yyyy')
