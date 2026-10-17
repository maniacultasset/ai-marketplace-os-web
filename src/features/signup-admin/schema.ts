/**
 * Client validation for the sign-up flow, mirroring the backend exactly
 * (apps/api/app/api/v1/schemas/signup.py, schemas/auth.py, schemas/tenants.py, core/passwords.py).
 * Every request model there is strict (`extra="forbid"`), so the bodies below carry only the
 * declared fields. Lengths are counted in code points, as Python `len` does.
 */
import { z } from 'zod'
import type { Schema } from '@/api/types'
import {
  codePoints,
  collapseSpaces,
  email,
  EMAIL_OCTETS_MAX,
  EMAIL_SPACES_MSG,
  EMAIL_PATTERN,
  freeText,
  LOGIN_EMAIL_MAX,
  NAME_MAX,
  normalizeEmail,
  normalizeWebsite,
  orgName,
  personName,
  phone,
  PHONE_MAX,
  PHONE_PATTERN,
  website,
  WEBSITE_MAX,
  WEBSITE_PATTERN,
} from '@/lib/validation'

export type SignupCreateBody = Schema<'SignupCreate'>
export type SignupStatusBody = Schema<'SignupStatusRequest'>
export type SignupRejectBody = Schema<'SignupReject'>
export type SignupApproveBody = Schema<'SignupApprove'>

// The shared primitives live in src/lib/validation.ts; re-exported for existing importers.
export {
  codePoints,
  EMAIL_OCTETS_MAX,
  EMAIL_SPACES_MSG,
  LOGIN_EMAIL_MAX,
  NAME_MAX,
  normalizeEmail,
  normalizeWebsite,
  PHONE_MAX,
  PHONE_PATTERN,
  WEBSITE_MAX,
  WEBSITE_PATTERN,
}

/** core/passwords.py PASSWORD_MIN / PASSWORD_MAX. */
export const PASSWORD_MIN = 12
export const PASSWORD_MAX = 1024
/** signup.REASON_MAX. */
export const REASON_MAX = 1000
export const TRIAL_DAYS_MIN = 1
export const TRIAL_DAYS_MAX = 365
export const TRIAL_DAYS_DEFAULT = 14

const VISIBLE_ASCII = /^[\x21-\x7E]+$/

const loginEmail = z
  .string()
  .trim()
  .min(1, 'Enter your email.')
  .min(3, 'Email is too short.')
  .max(LOGIN_EMAIL_MAX, 'Email is too long.')
  .regex(/^\S*$/, EMAIL_SPACES_MSG)
  .regex(VISIBLE_ASCII, 'Email must be plain ASCII.')
  .regex(EMAIL_PATTERN, 'Enter a valid email address.')

/**
 * Stricter than the backend only where a value is clearly wrong for a human: a person's name with
 * digits, a brand name with no letter at all, a phone number with letters or too few digits. Every
 * backend limit (200 code points, PHONE_PATTERN, 254 email octets, 2048 website) still applies.
 */
export const signupFormSchema = z.object({
  brand_name: orgName('the brand name'),
  owner_name: personName('your name'),
  email: email(),
  phone: phone(),
  website: website(),
  password: z
    .string()
    .refine((v) => codePoints(v) >= PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`)
    .refine((v) => codePoints(v) <= PASSWORD_MAX, `Shorten the password to ${PASSWORD_MAX} characters or fewer.`),
  /** Client-side only: `SignupCreate` has no consent field, so this is not sent or stored. */
  agree: z.boolean().refine((v) => v, 'Confirm that you have read the privacy policy.'),
})

export type SignupFormValues = z.infer<typeof signupFormSchema>

export const SIGNUP_FORM_DEFAULTS: SignupFormValues = {
  brand_name: '',
  owner_name: '',
  email: '',
  phone: '',
  website: '',
  password: '',
  agree: false,
}

/** Form values to the strict `SignupCreate` body: optional fields omitted when empty. */
export function toSignupBody(v: SignupFormValues): SignupCreateBody {
  const body: SignupCreateBody = {
    brand_name: collapseSpaces(v.brand_name),
    owner_name: collapseSpaces(v.owner_name),
    email: normalizeEmail(v.email),
    password: v.password,
  }
  const phone = v.phone.trim()
  const website = normalizeWebsite(v.website)
  if (phone) body.phone = phone
  if (website) body.website = website
  return body
}

/** `SignupStatusRequest`: the login email rules, password 1..1024. */
export const statusFormSchema = z.object({
  email: loginEmail,
  password: z.string().min(1, 'Enter your password.').max(PASSWORD_MAX, 'Password is too long.'),
})
export type StatusFormValues = z.infer<typeof statusFormSchema>

export function toStatusBody(v: StatusFormValues): SignupStatusBody {
  return { email: normalizeEmail(v.email), password: v.password }
}

/** `SignupReject.reason`: non-blank, at most 1000 characters; line breaks fine, other control characters not. */
export const rejectFormSchema = z.object({
  reason: freeText('the reason', REASON_MAX).refine(
    (v) => v.trim().length > 0,
    'Tell the brand why, so they can fix it and apply again.',
  ),
})
export type RejectFormValues = z.infer<typeof rejectFormSchema>

export const toRejectBody = (v: RejectFormValues): SignupRejectBody => ({ reason: v.reason.trim() })

/** `SignupApprove.trial_days`: an integer 1..365, or null for the backend default (14). */
export function parseTrialDays(input: string): number | null | 'invalid' {
  const v = input.trim()
  if (v === '') return null
  if (!/^\d+$/.test(v)) return 'invalid'
  const n = Number(v)
  return n >= TRIAL_DAYS_MIN && n <= TRIAL_DAYS_MAX ? n : 'invalid'
}

export function toApproveBody(trialDays: number | null): SignupApproveBody {
  return trialDays === null ? {} : { trial_days: trialDays }
}
