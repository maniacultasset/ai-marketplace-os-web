/**
 * Shared client validation: zod builders for the fields people type, plus input filters that stop
 * clearly wrong keystrokes (letters in a price) before they land.
 *
 * Rules of the house:
 * - Never looser than the backend (src/api/schema.d.ts and the Python models it mirrors). A
 *   builder only adds a rule where the value is clearly wrong for a human (a name made of digits).
 * - Values stay as typed (no zod transforms), so `z.input` equals `z.output`; normalise in the
 *   form's `to…Body` (trim, `collapseSpaces`, `normalizeEmail`, `normalizeWebsite`, `parseMoney`).
 * - Lengths are code points, as Python `len` counts them.
 * - Messages are plain, sentence case and say how to fix. `label` is the noun phrase as it reads
 *   after a verb: "your name", "the brand name", "the price".
 *
 * Forms: use `FORM_VALIDATION_MODE` with react-hook-form so errors show after blur or submit,
 * then re-check on every change, and the first invalid field takes focus on submit.
 */
import type { ChangeEvent, Ref, RefCallback, RefObject } from 'react'
import { z } from 'zod'

// ---------------------------------------------------------------------------------------------
// Primitives (moved from features/signup-admin/schema.ts, which re-exports them)
// ---------------------------------------------------------------------------------------------

/** Length as the backend counts it (code points, not UTF-16 units). */
export const codePoints = (s: string) => [...s].length
/** True when the text has a NUL (the backend rejects it in every text field). */
export const hasNul = (s: string) => s.includes('\u0000')
/** UTF-8 byte length (database octet limits, e.g. the email column). */
export const utf8Bytes = (s: string) => new TextEncoder().encode(s).length
/** True for any C0/C1 control character, tab and newline included. */
export const hasControlChars = (s: string) => /\p{Cc}/u.test(s)
/** Control characters other than tab and line breaks (free text may span lines). */
export const hasStrayControlChars = (s: string) => /[^\P{Cc}\t\n\r]/u.test(s)
/** Trim and fold every run of whitespace into one space ("  Meera   Iyer " -> "Meera Iyer"). */
export const collapseSpaces = (s: string) => s.trim().replace(/\s+/g, ' ')

/** tenants.NAME_MAX (brand and person names). */
export const NAME_MAX = 200
/** signup.EMAIL_OCTETS_MAX (ck_users_email), checked after trim + lower-case. */
export const EMAIL_OCTETS_MAX = 254
/** auth.Email max length (login and status). */
export const LOGIN_EMAIL_MAX = 320
export const PHONE_MAX = 32
export const WEBSITE_MAX = 2048
/** E.164: a full international number has at most 15 digits; 7 is the shortest real one. */
export const PHONE_DIGITS_MIN = 7
export const PHONE_DIGITS_MAX = 15

/** Backend phone pattern (signup.py): + or a digit first, then digits, spaces, ( ) and -. */
export const PHONE_PATTERN = /^\+?[0-9][0-9 ()-]{5,30}$/
export const WEBSITE_PATTERN = /^https?:\/\/[^\s/?#]+\.[^\s]+$/
export const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+$/
const VISIBLE_ASCII = /^[\x21-\x7E]+$/
/** An email with a space inside it (spaces at the ends are trimmed). */
export const EMAIL_SPACES_MSG = 'Remove the spaces from the email.'

/**
 * Money as the import runner accepts it (row_model.py): up to 10 whole digits and 2 decimals,
 * after `₹`, `INR`, commas and spaces are stripped.
 */
export const MONEY_PATTERN = /^[0-9]{1,10}(\.[0-9]{1,2})?$/

/** The sign-up email exactly as the backend stores it (trimmed, lower-cased). */
export const normalizeEmail = (input: string) => input.trim().toLowerCase()

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

/** "₹1,299.50" / "INR 1299.5" -> "1299.50" / "1299.5"; null when blank. Does not validate. */
export function parseMoney(raw: string): string | null {
  let v = raw.replace(/₹/g, '').replace(/,/g, '').replace(/\s+/g, '')
  if (v.toUpperCase().startsWith('INR')) v = v.slice(3)
  return v === '' ? null : v
}

/** Number of ASCII digits in a phone number as typed. */
export const phoneDigits = (s: string) => s.replace(/\D/g, '').length

// ---------------------------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------------------------

type Opt = { required?: boolean }

export const CONTROL_MSG = 'Remove the hidden control character (it often comes in with a paste).'

/** Letters and combining marks of any script, plus ZWNJ/ZWJ (Devanagari, Malayalam, Bengali…). */
const LETTER = /\p{L}/u
const DIGIT = /\p{Nd}/u
/** Person names: letters, marks, ZWNJ/ZWJ, spaces, apostrophes ' ’ ʼ, hyphens, dots, middle dot. */
const PERSON_NAME_CHARS = /^(?:[\p{L}\p{M} \u00A0'’‘ʼ\-‐.·]|\u200C|\u200D)+$/u
/**
 * Brand, company and store names: anything a person name allows plus digits and the punctuation
 * real brands use ("H&M", "boAt 2.0", "Levi's", "Yahoo!", "Marks & Spencer", "7 Seas", "Brand™").
 */
const ORG_NAME_CHARS = /^(?:[\p{L}\p{M}\p{Nd} \u00A0'’‘ʼ\-‐–—.·&,+()/!?:#@_"“”™®©]|\u200C|\u200D)+$/u

/**
 * A person's name. Trimmed for every check; must contain a letter; only letters (any script),
 * spaces, apostrophes, hyphens and dots; no digits; at most `max` code points; no control chars.
 * Accepts "Meera Iyer", "D'Souza", "Jean-Luc", "J. R. Rao", "मीरा अय्यर", "Zoë", "李小龙".
 */
export function personName(label: string, max = NAME_MAX, { required = true }: Opt = {}) {
  return z.string().superRefine((raw, ctx) => {
    const v = raw.trim()
    const fail = (message: string) => ctx.addIssue({ code: 'custom', message })
    if (!v) {
      if (required) fail(`Enter ${label}.`)
      return
    }
    if (hasControlChars(v)) return fail(CONTROL_MSG)
    if (DIGIT.test(v)) return fail(`Use letters for ${label}, not numbers.`)
    if (!PERSON_NAME_CHARS.test(v)) return fail(`Use only letters, spaces, apostrophes, hyphens and dots in ${label}.`)
    if (!LETTER.test(v)) return fail(`Enter ${label} using letters.`)
    if (codePoints(v) > max) fail(`Shorten ${label} to ${max} characters or fewer.`)
  })
}

/**
 * A brand, company or store name. Trimmed; must contain a letter (so not digits or symbols only);
 * digits and common punctuation (& . , ' ’ - + ( ) / ! : # @ _ " ™ ® ©) allowed; at most `max`
 * code points; no control chars.
 */
export function orgName(label: string, max = NAME_MAX, { required = true }: Opt = {}) {
  return z.string().superRefine((raw, ctx) => {
    const v = raw.trim()
    const fail = (message: string) => ctx.addIssue({ code: 'custom', message })
    if (!v) {
      if (required) fail(`Enter ${label}.`)
      return
    }
    if (hasControlChars(v)) return fail(CONTROL_MSG)
    if (!ORG_NAME_CHARS.test(v))
      return fail(`Use letters, numbers and common punctuation like & . - ' in ${label}.`)
    if (!LETTER.test(v)) return fail(`Include at least one letter in ${label}, not only numbers or symbols.`)
    if (codePoints(v) > max) fail(`Shorten ${label} to ${max} characters or fewer.`)
  })
}

/**
 * Free text (a reason, a description, a guideline). Trimmed; blank fails only when required; at
 * most `max` code points; tab and line breaks allowed, other control characters not.
 */
export function freeText(label: string, max: number, { required = false }: Opt = {}) {
  return z.string().superRefine((raw, ctx) => {
    const v = raw.trim()
    const fail = (message: string) => ctx.addIssue({ code: 'custom', message })
    if (!v) {
      if (required) fail(`Enter ${label}.`)
      return
    }
    if (hasStrayControlChars(v)) return fail(CONTROL_MSG)
    if (codePoints(v) > max) fail(`Shorten ${label} to ${max} characters or fewer.`)
  })
}

/**
 * An email as login and sign-up accept it: trimmed, visible ASCII, one @, at most 320 characters
 * and 254 UTF-8 octets once lower-cased. Messages match the sign-up form; `label` (default
 * "your email") only names the field in "Enter …".
 * Input: `type="email" inputMode="email" autoComplete="email" spellCheck={false}`.
 */
export function email({ required = true, label = 'your email' }: Opt & { label?: string } = {}) {
  return z.string().superRefine((raw, ctx) => {
    const v = raw.trim()
    const fail = (message: string) => ctx.addIssue({ code: 'custom', message })
    if (!v) {
      if (required) fail(`Enter ${label}.`)
      return
    }
    if (v.length < 3) return fail('Email is too short.')
    if (v.length > LOGIN_EMAIL_MAX) return fail('Email is too long.')
    if (/\s/.test(v)) return fail(EMAIL_SPACES_MSG)
    if (!VISIBLE_ASCII.test(v)) return fail('Email must be plain ASCII.')
    if (!EMAIL_PATTERN.test(v)) return fail('Enter a valid email address.')
    if (utf8Bytes(normalizeEmail(v)) > EMAIL_OCTETS_MAX) fail('Email is too long.')
  })
}

/**
 * A phone number: the backend pattern (+ or a digit first, then digits, spaces, ( ) or -, at most
 * 32 characters) and 7 to 15 digits (E.164). Optional by default.
 * Input: `type="tel" inputMode="tel" autoComplete="tel"`, filtered with `phoneChars`.
 */
export function phone({ required = false }: Opt = {}) {
  return z.string().superRefine((raw, ctx) => {
    const v = raw.trim()
    const fail = (message: string) => ctx.addIssue({ code: 'custom', message })
    if (!v) {
      if (required) fail('Enter a phone number.')
      return
    }
    if (/\p{L}/u.test(v)) return fail('Use digits for the phone number, not letters.')
    if (v.length > PHONE_MAX) return fail('Phone number is too long.')
    const digits = phoneDigits(v)
    if (digits < PHONE_DIGITS_MIN) return fail('Phone number is too short. Include the area or mobile code.')
    if (digits > PHONE_DIGITS_MAX) return fail(`Phone numbers have at most ${PHONE_DIGITS_MAX} digits. Check for an extra digit.`)
    if (!PHONE_PATTERN.test(v))
      fail('Start with + or a digit, then digits, spaces, brackets or dashes, e.g. +91 98765 43210.')
  })
}

/**
 * A website. A bare host ("kalakar.in") is fine: check and send `normalizeWebsite(value)`.
 * Optional by default. Input: `type="url" inputMode="url" autoComplete="url" spellCheck={false}`.
 */
export function website({ required = false }: Opt = {}) {
  return z.string().superRefine((raw, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: 'custom', message })
    if (!raw.trim()) {
      if (required) fail('Enter a website address.')
      return
    }
    const v = normalizeWebsite(raw)
    if (v.length > WEBSITE_MAX) return fail('Website address is too long.')
    if (!WEBSITE_PATTERN.test(v)) fail('Enter a full address, e.g. https://yourbrand.in.')
  })
}

type NumOpt = Opt & { min?: number; max?: number }

/**
 * A price or MRP: positive, up to 10 whole digits and 2 decimals (`MONEY_PATTERN`), `₹`, `INR`,
 * commas and spaces ignored. Send `parseMoney(value)`. Optional by default.
 * Input: `type="text" inputMode="decimal" autoComplete="off"`, filtered with `decimal`.
 */
export function money(label: string, { required = false, max }: Omit<NumOpt, 'min'> = {}) {
  return z.string().superRefine((raw, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: 'custom', message })
    const v = parseMoney(raw)
    if (v === null) {
      if (required) fail(`Enter ${label}.`)
      return
    }
    if (/\p{L}/u.test(v)) return fail(`Use numbers for ${label}, e.g. 1299 or 1299.50.`)
    if (/^-/.test(v)) return fail(`Enter ${label} as an amount above zero.`)
    if (/\.\d{3,}$/.test(v)) return fail(`Use at most 2 decimals in ${label}.`)
    if (!MONEY_PATTERN.test(v)) return fail(`Enter ${label} as a number, e.g. 1299 or 1299.50.`)
    if (Number(v) <= 0) return fail(`Enter ${label} as an amount above zero.`)
    if (max !== undefined && Number(v) > max) fail(`Keep ${label} at or below ${max.toLocaleString('en-IN')}.`)
  })
}

function integerField(label: string, floor: number, { required = false, min, max = Number.MAX_SAFE_INTEGER }: NumOpt) {
  const lo = Math.max(floor, min ?? floor)
  return z.string().superRefine((raw, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: 'custom', message })
    const v = raw.trim().replace(/,/g, '')
    if (!v) {
      if (required) fail(`Enter ${label}.`)
      return
    }
    if (/\p{L}/u.test(v)) return fail(`Use digits for ${label}, not letters.`)
    if (/^-\d+$/.test(v)) return fail(lo > 0 ? `Enter ${label} as ${lo} or more.` : `Enter ${label} as 0 or more.`)
    if (!/^\d+$/.test(v)) return fail(`Enter ${label} as a whole number.`)
    const n = Number(v)
    if (n < lo) return fail(`Enter ${label} as ${lo} or more.`)
    if (n > max) fail(`Keep ${label} at or below ${max.toLocaleString('en-IN')}.`)
  })
}

/**
 * Stock, quantity: a whole number 0 or more (commas ignored). Optional by default.
 * Input: `type="text" inputMode="numeric" autoComplete="off"`, filtered with `digitsOnly`.
 */
export const nonNegativeInt = (label: string, opt: NumOpt = {}) => integerField(label, 0, opt)

/** Pieces in a set, pack size: a whole number 1 or more. Same input as `nonNegativeInt`. */
export const positiveInt = (label: string, opt: NumOpt = {}) => integerField(label, 1, opt)

function decimalField(
  label: string,
  { required = false, min = 0, max, decimals = 2, exclusiveMin = true }: NumOpt & { decimals?: number; exclusiveMin?: boolean },
  unit = '',
) {
  return z.string().superRefine((raw, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: 'custom', message })
    const v = raw.trim().replace(/,/g, '')
    if (!v) {
      if (required) fail(`Enter ${label}.`)
      return
    }
    if (/\p{L}/u.test(v)) return fail(`Use numbers for ${label}, not letters.`)
    if (!/^-?\d+(\.\d+)?$/.test(v)) return fail(`Enter ${label} as a number, e.g. 12.5.`)
    const places = v.split('.')[1]?.length ?? 0
    if (places > decimals) return fail(`Use at most ${decimals} decimals in ${label}.`)
    const n = Number(v)
    if (exclusiveMin ? n <= min : n < min)
      return fail(exclusiveMin && min === 0 ? `Enter ${label} as more than zero.` : `Enter ${label} as ${min}${unit} or more.`)
    if (max !== undefined && n > max) fail(`Keep ${label} at or below ${max}${unit}.`)
  })
}

/**
 * Tax rate, discount: 0 to 100 with up to 2 decimals (GST 0, 0.25, 3, 5, 12, 18, 28).
 * Input: `type="text" inputMode="decimal"`, filtered with `decimal`.
 */
export const percentage = (label: string, opt: Opt = {}) =>
  decimalField(label, { ...opt, min: 0, max: 100, exclusiveMin: false }, '%')

/**
 * Weight, length, breadth, height: a positive decimal (default 2 decimals), optional `max`.
 * Input: `type="text" inputMode="decimal"`, filtered with `decimal`.
 */
export const measure = (label: string, opt: Omit<NumOpt, 'min'> & { decimals?: number } = {}) =>
  decimalField(label, { ...opt, min: 0, exclusiveMin: true })

// ---------------------------------------------------------------------------------------------
// Input filters (onChange / beforeinput)
// ---------------------------------------------------------------------------------------------

/** A pure function from what is in the box to what may be in it. Must be idempotent. */
export type Sanitizer = (value: string) => string

/** Full-width digits (Japanese/Chinese IME) and the full-width dot to ASCII. */
const asciiDigits = (s: string) =>
  s.replace(/[\uFF10-\uFF19]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0)).replace(/\uFF0E/g, '.')

/** Keeps 0-9 only. For stock, quantity, PIN code, OTP. */
export const digitsOnly: Sanitizer = (value) => asciiDigits(value).replace(/[^0-9]/g, '')

/**
 * Keeps digits and one dot with at most `places` decimals (default 2). A pasted "₹1,299.50"
 * becomes "1299.50". For price, MRP, weight, dimensions, percentages.
 */
export function decimal(value: string, places = 2): string {
  const v = asciiDigits(value).replace(/[^0-9.]/g, '')
  const dot = v.indexOf('.')
  if (dot === -1) return v
  const whole = v.slice(0, dot)
  const frac = v.slice(dot + 1).replace(/\./g, '')
  return places <= 0 ? whole : `${whole}.${frac.slice(0, places)}`
}

/**
 * Keeps digits, spaces, hyphens, ( ) and one leading +. For phone numbers. Leading spaces go, so a
 * pasted "Tel: +91 98765 43210" keeps its + ("+91 98765 43210").
 */
export const phoneChars: Sanitizer = (value) => {
  const v = asciiDigits(value).replace(/[^0-9+ ()-]/g, '').trimStart()
  return v.startsWith('+') ? `+${v.slice(1).replace(/\+/g, '')}` : v.replace(/\+/g, '')
}

/**
 * Where the caret belongs after `sanitize` cleans `value`, given it was at `caret`: the length of
 * the cleaned text before it. Right for filters that only drop characters.
 */
export const caretAfter = (value: string, caret: number, sanitize: Sanitizer) =>
  Math.min(sanitize(value.slice(0, caret)).length, sanitize(value).length)

type Filterable = HTMLInputElement | HTMLTextAreaElement
type FilterOpts = {
  /** Called when a keystroke or paste is refused or cleaned (e.g. to show "Numbers only"). */
  onReject?: (attempted: string) => void
}
const filters = new WeakMap<Filterable, { sanitize: Sanitizer; opts: FilterOpts }>()

function setNativeValue(el: Filterable, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value)
}

function attachFilter(el: Filterable) {
  // A typed character the filter would drop is refused, so nothing flashes and the caret never
  // moves. Paste, drop, autofill and multi-character inserts (dictation, text replacement) go
  // through and are cleaned in onChange, so the valid part is kept.
  el.addEventListener('beforeinput', (ev) => {
    const e = ev as InputEvent
    const f = filters.get(el)
    if (!f || e.isComposing || e.inputType !== 'insertText' || !e.data || [...e.data].length > 1) return
    const start = el.selectionStart ?? el.value.length
    const end = el.selectionEnd ?? start
    const next = el.value.slice(0, start) + e.data + el.value.slice(end)
    if (f.sanitize(next) !== next) {
      e.preventDefault()
      f.opts.onReject?.(e.data)
    }
  })
  // IME text arrives after composition ends; clean it once and tell React (via a real input event).
  el.addEventListener('compositionend', () => {
    const f = filters.get(el)
    if (!f) return
    const cleaned = f.sanitize(el.value)
    if (cleaned === el.value) return
    f.opts.onReject?.(el.value)
    setNativeValue(el, cleaned)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

/**
 * Wraps input props (a react-hook-form `register(...)` result or plain `{ value, onChange }`) so
 * the field only ever holds what `sanitize` allows: invalid keystrokes are refused, pastes are
 * cleaned with the caret kept in place, IME composition is never interrupted. Not a hook, so it
 * is safe in loops (variant matrices). Use a text input (`type="text"` + `inputMode`), since
 * number inputs hide the caret position.
 *
 * <Input {...filterInput(register('price'), decimal, { onReject: () => setHint('Numbers only') })}
 *   inputMode="decimal" autoComplete="off" />
 */
export function filterInput<
  P extends { onChange?: (e: ChangeEvent<E>) => unknown; ref?: Ref<E> },
  E extends Filterable = HTMLInputElement,
>(props: P, sanitize: Sanitizer, opts: FilterOpts = {}): P & { ref: RefCallback<E> } {
  const { onChange, ref } = props
  const wrapped = {
    ...props,
    ref: (el: E | null) => {
      if (el) {
        if (!filters.has(el)) attachFilter(el)
        filters.set(el, { sanitize, opts })
      }
      if (typeof ref === 'function') ref(el)
      else if (ref) (ref as RefObject<E | null>).current = el
    },
    onChange: (e: ChangeEvent<E>) => {
      const el = e.target
      const composing = (e.nativeEvent as InputEvent).isComposing
      if (!composing) {
        const cleaned = sanitize(el.value)
        if (cleaned !== el.value) {
          const caret = caretAfter(el.value, el.selectionStart ?? el.value.length, sanitize)
          opts.onReject?.(el.value)
          el.value = cleaned
          try {
            el.setSelectionRange(caret, caret)
          } catch {
            // inputs without a selection API (type=email/number) keep the browser's caret
          }
        }
      }
      return onChange?.(e)
    },
  }
  return wrapped as P & { ref: RefCallback<E> }
}

// ---------------------------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------------------------

/**
 * react-hook-form options for every form: first error after blur or submit (not mid-typing),
 * then re-checked on each change; submit focuses the first invalid field.
 * `useForm({ resolver: zodResolver(schema), ...FORM_VALIDATION_MODE })`
 */
export const FORM_VALIDATION_MODE = {
  mode: 'onTouched',
  reValidateMode: 'onChange',
  shouldFocusError: true,
} as const

/**
 * For forms not on react-hook-form: focuses (and scrolls to) the first `[aria-invalid="true"]`
 * control inside `root`. Call after the error state has rendered (e.g. in a rAF or effect).
 */
export function focusFirstInvalid(root: ParentNode | null | undefined = document): boolean {
  const el = root?.querySelector<HTMLElement>('[aria-invalid="true"]')
  if (!el) return false
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  el.focus({ preventScroll: true })
  el.scrollIntoView?.({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
  return true
}
