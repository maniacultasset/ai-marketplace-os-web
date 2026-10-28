/**
 * The DPP 1.4.1 password rules, mirroring apps/api/app/core/password_policy.py `check` so the
 * form can show each rule live. The server stays the authority: it also checks the history rule
 * ("not one of the last 10") and the once-a-day minimum age, which the client cannot see.
 *
 * - 12 to 1024 characters (code points of the raw value, as Python `len`).
 * - An upper-case letter, a lower-case letter and a digit (after NFKC), and a symbol: any character
 *   that is neither a letter (or combining mark) nor a decimal digit; a space counts.
 * - No personal part: the email local part (3+ characters) and every letter run of 3+ characters in
 *   the local part or the display name, compared after NFKC and case folding.
 */

export const PASSWORD_MIN = 12
export const PASSWORD_MAX = 1024
export const PASSWORD_HISTORY = 10
const PERSONAL_MIN = 3

export type PasswordRule = 'length' | 'upper' | 'lower' | 'digit' | 'symbol' | 'personal'

/** Short labels for the live checklist (the server's 422 sentences are longer). */
export const RULE_LABELS: Record<PasswordRule, string> = {
  length: `At least ${PASSWORD_MIN} characters`,
  upper: 'An upper-case letter (A-Z)',
  lower: 'A lower-case letter (a-z)',
  digit: 'A number (0-9)',
  symbol: 'A symbol or a space',
  personal: 'Not your name or the first part of your email',
}

export const RULE_ORDER: readonly PasswordRule[] = ['length', 'upper', 'lower', 'digit', 'symbol', 'personal']

/** Shown with the checklist: only the server can check these. */
export const SERVER_RULES = [`Not one of your last ${PASSWORD_HISTORY} passwords`] as const

const LETTER = /[\p{L}\p{M}]/u
const DIGIT = /\p{Nd}/u
const UPPER = /\p{Uppercase}/u
const LOWER = /\p{Lowercase}/u

const codePoints = (s: string) => [...s].length

/** NFKC + a case fold. `toLowerCase` is Python's `casefold` for all but a few letters (ß, ς). */
export function fold(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/ß/g, 'ss').replace(/ς/g, 'σ')
}

function letterRuns(text: string): string[] {
  const runs: string[] = []
  let current = ''
  for (const ch of text) {
    if (LETTER.test(ch)) {
      current += ch
      continue
    }
    if (current) runs.push(current)
    current = ''
  }
  if (current) runs.push(current)
  return runs
}

/** The personal tokens a password must not contain (never shown; only used for the check). */
export function personalTokens(email: string, displayName?: string | null): Set<string> {
  const at = email.lastIndexOf('@')
  const local = fold(at >= 0 ? email.slice(0, at) : email)
  const tokens = new Set<string>()
  if (codePoints(local) >= PERSONAL_MIN) tokens.add(local)
  for (const source of [local, fold(displayName ?? '')]) {
    for (const run of letterRuns(source)) if (codePoints(run) >= PERSONAL_MIN) tokens.add(run)
  }
  return tokens
}

/** Every rule `plain` breaks, in the server's order; empty when it complies. */
export function checkPassword(plain: string, who: { email: string; displayName?: string | null }): PasswordRule[] {
  const text = plain.normalize('NFKC')
  const chars = [...text]
  const broken: PasswordRule[] = []
  const n = codePoints(plain)
  if (n < PASSWORD_MIN || n > PASSWORD_MAX) broken.push('length')
  if (!chars.some((c) => UPPER.test(c))) broken.push('upper')
  if (!chars.some((c) => LOWER.test(c))) broken.push('lower')
  if (!chars.some((c) => DIGIT.test(c))) broken.push('digit')
  if (!chars.some((c) => !LETTER.test(c) && !DIGIT.test(c))) broken.push('symbol')
  const folded = fold(plain)
  for (const token of personalTokens(who.email, who.displayName)) {
    if (folded.includes(token)) {
      broken.push('personal')
      break
    }
  }
  return broken
}
