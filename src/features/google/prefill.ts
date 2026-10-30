/**
 * Prefill for the Google sign-up form. Only what the API sends is used, and nothing is invented:
 * the owner name comes from the Google profile, and the brand name is the API's
 * `suggested_brand_name` (from a company email domain, never a personal mailbox). Every value
 * stays editable.
 */
import { NAME_MAX } from '@/lib/validation'

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()

/** The owner's name: Google's full name, else given + family name. */
export function ownerNameFrom(p: { owner_name?: string | null; given_name?: string | null; family_name?: string | null }): string {
  const full = clean(p.owner_name)
  const name = full || [p.given_name, p.family_name].map(clean).filter(Boolean).join(' ')
  return name.slice(0, NAME_MAX)
}

/** The API's brand suggestion, or '' when it has none or it would not fit the field. */
export function brandNameFrom(p: { suggested_brand_name?: string | null }): string {
  const name = clean(p.suggested_brand_name)
  return name.length >= 2 && name.length <= NAME_MAX ? name : ''
}
