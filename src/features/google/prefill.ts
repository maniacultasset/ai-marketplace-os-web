/**
 * Prefill for the Google sign-up form. Only what Google told us is used, and nothing is invented:
 * the owner name comes from the Google profile, and a brand name is suggested only from a company
 * email domain, never from a personal mailbox. Every value stays editable.
 */
import { NAME_MAX } from '@/lib/validation'

/**
 * Second-level labels of personal mailbox providers. Matched on the label, so country variants
 * (yahoo.co.in, outlook.in, hotmail.co.uk) are covered too.
 */
export const CONSUMER_MAIL_LABELS: ReadonlySet<string> = new Set([
  'gmail',
  'googlemail',
  'outlook',
  'hotmail',
  'live',
  'msn',
  'windowslive',
  'yahoo',
  'ymail',
  'rocketmail',
  'icloud',
  'me',
  'mac',
  'proton',
  'protonmail',
  'pm',
  'rediffmail',
  'rediff',
  'aol',
  'zoho',
  'zohomail',
  'gmx',
  'mail',
  'email',
  'yandex',
  'tutanota',
  'tuta',
  'tutamail',
  'fastmail',
  'hey',
  'inbox',
  'qq',
  '163',
  '126',
  'sify',
  'indiatimes',
  'web',
  'orange',
  'comcast',
  'att',
  'verizon',
  'btinternet',
  'sky',
])

/** Public suffixes with two labels that matter here (Indian and common ones). */
const TWO_LABEL_SUFFIXES: ReadonlySet<string> = new Set([
  'co.in',
  'net.in',
  'org.in',
  'firm.in',
  'gen.in',
  'ind.in',
  'ac.in',
  'edu.in',
  'gov.in',
  'res.in',
  'co.uk',
  'org.uk',
  'ltd.uk',
  'plc.uk',
  'com.au',
  'net.au',
  'org.au',
  'co.nz',
  'com.sg',
  'com.my',
  'co.za',
  'com.br',
  'co.jp',
  'com.cn',
  'com.hk',
  'ae.org',
  'co.ae',
])

/** The registrable label of a domain: `mail.acme.co.in` -> `acme`. */
export function registrableLabel(domain: string): string | null {
  const parts = domain.toLowerCase().replace(/\.+$/, '').split('.').filter(Boolean)
  if (parts.length < 2) return null
  const lastTwo = parts.slice(-2).join('.')
  const idx = TWO_LABEL_SUFFIXES.has(lastTwo) ? parts.length - 3 : parts.length - 2
  return idx >= 0 ? (parts[idx] ?? null) : null
}

export function emailDomain(email: string): string | null {
  const at = email.lastIndexOf('@')
  return at > 0 ? email.slice(at + 1).toLowerCase() : null
}

export function isConsumerEmail(email: string): boolean {
  const domain = emailDomain(email)
  const label = domain ? registrableLabel(domain) : null
  return !label || CONSUMER_MAIL_LABELS.has(label)
}

/**
 * A brand name from a company email domain, or '' for a personal mailbox. Only explicit word
 * breaks (hyphens, underscores) split words: `acme-naturals.in` -> "Acme Naturals",
 * `acmenaturals.com` -> "Acmenaturals". Labels with no letter, punycode, or one letter give ''.
 */
export function suggestBrandName(email: string): string {
  if (isConsumerEmail(email)) return ''
  const label = registrableLabel(emailDomain(email) ?? '')
  if (!label || label.startsWith('xn--') || !/[a-z]/.test(label)) return ''
  const words = label.split(/[-_]+/).filter(Boolean)
  const name = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  return name.length >= 2 && name.length <= NAME_MAX ? name : ''
}

/** The website the email domain points at, as a placeholder hint only (not a value). */
export function domainHint(email: string): string | null {
  return isConsumerEmail(email) ? null : emailDomain(email)
}

/** The owner's name from the Google profile: given + family name, else the display name. */
export function ownerNameFrom(p: { given_name?: string | null; family_name?: string | null; display_name?: string | null }): string {
  const parts = [p.given_name, p.family_name].map((s) => (s ?? '').trim()).filter(Boolean)
  const name = parts.length ? parts.join(' ') : (p.display_name ?? '').trim()
  return name.replace(/\s+/g, ' ').slice(0, NAME_MAX)
}
