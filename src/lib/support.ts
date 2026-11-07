/**
 * Kuinn support. There is no in-app support channel: every "contact support" is a plain email to
 * this address, opened in the person's own mail app.
 */
export const SUPPORT_EMAIL = 'support@kuinn.in'

/** `mailto:` link, with an optional subject and body (for example a reference id). */
export function supportMailto(subject?: string, body?: string): string {
  const q = new URLSearchParams()
  if (subject) q.set('subject', subject)
  if (body) q.set('body', body)
  // mailto wants %20 for spaces, not "+".
  const query = q.toString().replace(/\+/g, '%20')
  return `mailto:${SUPPORT_EMAIL}${query ? `?${query}` : ''}`
}
