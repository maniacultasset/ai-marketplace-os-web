/**
 * The brand website (GET/PATCH /brand-profile `website_url`): optional, stored on the brand
 * profile only. Mirrors the backend rule (apps/api/app/core/website.py): an http(s) link with a
 * dot in the host and no spaces, at most 2000 characters.
 */

export const WEBSITE_MAX = 2000
// The same character classes as the backend pattern, control characters included.
// eslint-disable-next-line no-control-regex
const WEBSITE = /^https?:\/\/[^\s/?#\u0000-\u001f\u007f]+\.[^\s\u0000-\u001f\u007f]+$/

/** The value to send: trimmed, or null to clear. */
export function websiteValue(draft: string): string | null {
  const v = draft.trim()
  return v === '' ? null : v
}

/** Why the draft can't be saved, or null. Empty is fine: the website is optional. */
export function websiteProblem(draft: string): string | null {
  const v = websiteValue(draft)
  if (v === null) return null
  if (v.length > WEBSITE_MAX) return `Keep it to ${WEBSITE_MAX.toLocaleString('en-IN')} characters.`
  if (!/^https?:\/\//.test(v)) return 'Start with https://, for example https://yourbrand.in'
  if (!WEBSITE.test(v)) return 'Enter a full web address, for example https://yourbrand.in'
  return null
}
