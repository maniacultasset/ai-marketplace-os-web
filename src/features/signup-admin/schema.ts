/**
 * Client validation for the sign-up flow, mirroring the backend exactly
 * (apps/api/app/api/v1/schemas/signup.py, schemas/auth.py, schemas/tenants.py, core/passwords.py).
 * Every request model there is strict (`extra="forbid"`), so the bodies below carry only the
 * declared fields. Lengths are counted in code points, as Python `len` does.
 */
import { z } from 'zod'
import type { Schema } from '@/api/types'

export type SignupCreateBody = Schema<'SignupCreate'>
export type SignupStatusBody = Schema<'SignupStatusRequest'>
export type SignupRejectBody = Schema<'SignupReject'>
export type SignupApproveBody = Schema<'SignupApprove'>

/** tenants.NAME_MAX (ProfileName: non-blank, no NUL). */
export const NAME_MAX = 200
/** signup.EMAIL_OCTETS_MAX (ck_users_email), checked after trim + lower-case. */
export const EMAIL_OCTETS_MAX = 254
/** auth.Email max length (login and status). */
export const LOGIN_EMAIL_MAX = 320
/** core/passwords.py PASSWORD_MIN / PASSWORD_MAX. */
export const PASSWORD_MIN = 12
export const PASSWORD_MAX = 1024
export const PHONE_MAX = 32
export const WEBSITE_MAX = 2048
/** signup.REASON_MAX. */
export const REASON_MAX = 1000
export const TRIAL_DAYS_MIN = 1
export const TRIAL_DAYS_MAX = 365
export const TRIAL_DAYS_DEFAULT = 14

export const PHONE_PATTERN = /^\+?[0-9][0-9 ()-]{5,30}$/
export const WEBSITE_PATTERN = /^https?:\/\/[^\s/?#]+\.[^\s]+$/
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+$/
const VISIBLE_ASCII = /^[\x21-\x7E]+$/

export const codePoints = (s: string) => [...s].length
const hasNul = (s: string) => s.includes('\u0000')
const utf8Bytes = (s: string) => new TextEncoder().encode(s).length

/**
 * A website as the backend accepts it. People type "kalakar.in" far more often than
 * "https://kalakar.in", so a bare host gets `https://`. Anything else is kept as typed.
 */
export function normalizeWebsite(input: string): string {
  const v = input.trim()
  if (!v) return ''
  if (/^https?:\/\//i.test(v)) return v.replace(/^https?/i, (s) => s.toLowerCase())
  if (v.includes('://')) return v // another scheme: the pattern rejects it with a clear message
  return `https://${v}`
}

/** The sign-up email exactly as the backend stores it (trimmed, lower-cased). */
export const normalizeEmail = (input: string) => input.trim().toLowerCase()

const name = (label: string) =>
  z
    .string()
    .refine((v) => v.trim().length > 0, `Enter the ${label}.`)
    .refine((v) => codePoints(v.trim()) <= NAME_MAX, `Keep the ${label} under ${NAME_MAX} characters.`)
    .refine((v) => !hasNul(v), 'Remove the invisible control character.')

const loginEmail = z
  .string()
  .trim()
  .min(1, 'Enter your email.')
  .min(3, 'Email is too short.')
  .max(LOGIN_EMAIL_MAX, 'Email is too long.')
  .regex(VISIBLE_ASCII, 'Email must be plain ASCII.')
  .regex(EMAIL_PATTERN, 'Enter a valid email address.')

export const signupFormSchema = z
  .object({
    brand_name: name('brand name'),
    owner_name: name('your name'),
    email: loginEmail.refine((v) => utf8Bytes(normalizeEmail(v)) <= EMAIL_OCTETS_MAX, 'Email is too long.'),
    phone: z
      .string()
      .trim()
      .refine((v) => v === '' || v.length <= PHONE_MAX, 'Phone number is too long.')
      .refine((v) => v === '' || PHONE_PATTERN.test(v), 'Start with + or a digit, then digits, spaces, brackets or dashes, e.g. +91 98765 43210.'),
    website: z
      .string()
      .refine((v) => normalizeWebsite(v).length <= WEBSITE_MAX, 'Website address is too long.')
      .refine((v) => v.trim() === '' || WEBSITE_PATTERN.test(normalizeWebsite(v)), 'Enter a full address, e.g. https://yourbrand.in.'),
    password: z
      .string()
      .refine((v) => codePoints(v) >= PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`)
      .refine((v) => codePoints(v) <= PASSWORD_MAX, 'Password is too long.'),
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
    brand_name: v.brand_name.trim(),
    owner_name: v.owner_name.trim(),
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

/** `SignupReject.reason`: non-blank, at most 1000 characters, no NUL. */
export const rejectFormSchema = z.object({
  reason: z
    .string()
    .refine((v) => v.trim().length > 0, 'Tell the brand why, so they can fix it and apply again.')
    .refine((v) => codePoints(v.trim()) <= REASON_MAX, `Keep the reason under ${REASON_MAX} characters.`)
    .refine((v) => !hasNul(v), 'Remove the invisible control character.'),
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
