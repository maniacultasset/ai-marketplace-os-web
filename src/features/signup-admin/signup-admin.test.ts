import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/errors'
import {
  decisionError,
  decisionNeedsRefresh,
  displayWebsite,
  initials,
  QUEUE_TABS,
  retryAfterSeconds,
  SIGNUP_STATUS_META,
  signupSubmitError,
  statusCheckError,
  tabToStatus,
} from './format'
import {
  normalizeWebsite,
  parseTrialDays,
  rejectFormSchema,
  SIGNUP_FORM_DEFAULTS,
  signupFormSchema,
  statusFormSchema,
  toApproveBody,
  toRejectBody,
  toSignupBody,
  toStatusBody,
  type SignupFormValues,
} from './schema'

type Code = ConstructorParameters<typeof ApiError>[0]['type']
function err(status: number, type: Code, retryAfter: number | null = null) {
  return new ApiError({ status, type, message: type, correlationId: 'req-1', retryAfter })
}

const valid: SignupFormValues = {
  ...SIGNUP_FORM_DEFAULTS,
  brand_name: '  Kalakar Weaves ',
  owner_name: 'Meera Iyer',
  email: '  Founder@Kalakar.Example ',
  password: 'correct horse battery',
  agree: true,
}

describe('signup form schema (SignupCreate)', () => {
  it('accepts a minimal valid form and builds a strict body without empty optionals', () => {
    const parsed = signupFormSchema.parse(valid)
    expect(toSignupBody(parsed)).toEqual({
      brand_name: 'Kalakar Weaves',
      owner_name: 'Meera Iyer',
      email: 'founder@kalakar.example',
      password: 'correct horse battery',
    })
  })

  it('sends phone and website when given, adding https:// to a bare host', () => {
    const body = toSignupBody(signupFormSchema.parse({ ...valid, phone: ' +91 98765 43210 ', website: 'kalakar.in' }))
    expect(body.phone).toBe('+91 98765 43210')
    expect(body.website).toBe('https://kalakar.in')
    expect(Object.keys(body).sort()).toEqual(['brand_name', 'email', 'owner_name', 'password', 'phone', 'website'])
  })

  it('enforces the password rules (12..1024)', () => {
    expect(signupFormSchema.safeParse({ ...valid, password: 'short' }).success).toBe(false)
    expect(signupFormSchema.safeParse({ ...valid, password: 'x'.repeat(12) }).success).toBe(true)
    expect(signupFormSchema.safeParse({ ...valid, password: 'x'.repeat(1025) }).success).toBe(false)
  })

  it('requires the privacy policy box but never sends it (SignupCreate is strict)', () => {
    const unticked = signupFormSchema.safeParse({ ...valid, agree: false })
    expect(unticked.success).toBe(false)
    expect(unticked.error?.issues[0]?.path).toEqual(['agree'])
    expect(toSignupBody(signupFormSchema.parse(valid))).not.toHaveProperty('agree')
  })

  it('rejects blank names, names over 200 code points and NUL', () => {
    expect(signupFormSchema.safeParse({ ...valid, brand_name: '   ' }).success).toBe(false)
    expect(signupFormSchema.safeParse({ ...valid, owner_name: 'a'.repeat(201) }).success).toBe(false)
    // Length is code points, as the backend counts: 200 Devanagari letters are fine, 201 are not.
    expect(signupFormSchema.safeParse({ ...valid, owner_name: 'क'.repeat(200) }).success).toBe(true)
    expect(signupFormSchema.safeParse({ ...valid, brand_name: '𝒜'.repeat(200) }).success).toBe(true)
    expect(signupFormSchema.safeParse({ ...valid, brand_name: '𝒜'.repeat(201) }).success).toBe(false)
    expect(signupFormSchema.safeParse({ ...valid, brand_name: 'A\u0000B' }).success).toBe(false)
  })

  const issue = (patch: Partial<SignupFormValues>) => signupFormSchema.safeParse({ ...valid, ...patch }).error?.issues[0]?.message

  it('says "Enter your name." for a blank name (not "Enter the your name.")', () => {
    expect(issue({ owner_name: '  ' })).toBe('Enter your name.')
    expect(issue({ brand_name: '' })).toBe('Enter the brand name.')
  })

  it('rejects a person name made of digits, accepts real names from any script', () => {
    expect(issue({ owner_name: '12345' })).toBe('Use letters for your name, not numbers.')
    expect(issue({ owner_name: 'Meera 2' })).toBe('Use letters for your name, not numbers.')
    expect(signupFormSchema.safeParse({ ...valid, owner_name: '...' }).success).toBe(false)
    expect(signupFormSchema.safeParse({ ...valid, owner_name: '🙂' }).success).toBe(false)
    for (const owner_name of ["Ananya D'Souza", 'राहुल', 'मीरा अय्यर', 'Jean-Luc Picard', 'J. R. Rao', 'Zoë Ó Briain', 'ശ്രീ', '李小龙', 'O’Brien'])
      expect(signupFormSchema.safeParse({ ...valid, owner_name }).success, owner_name).toBe(true)
  })

  it('accepts brand names with digits and punctuation, but not digits or symbols only', () => {
    for (const brand_name of ['boAt 2.0', '7 Seas', 'H&M', "Levi's", 'Marks & Spencer', 'Yahoo!', 'कलाकार', 'Brand™'])
      expect(signupFormSchema.safeParse({ ...valid, brand_name }).success, brand_name).toBe(true)
    expect(issue({ brand_name: '12345' })).toBe('Include at least one letter in the brand name, not only numbers or symbols.')
    expect(signupFormSchema.safeParse({ ...valid, brand_name: '<script>' }).success).toBe(false)
  })

  it('collapses runs of spaces in names before sending', () => {
    const body = toSignupBody(signupFormSchema.parse({ ...valid, brand_name: ' Kalakar   Weaves ', owner_name: 'Meera  Iyer' }))
    expect(body.brand_name).toBe('Kalakar Weaves')
    expect(body.owner_name).toBe('Meera Iyer')
  })

  it('mirrors the email rules: visible ASCII, one @, 254 octets after normalising', () => {
    expect(signupFormSchema.safeParse({ ...valid, email: 'a@b@c' }).success).toBe(false)
    expect(signupFormSchema.safeParse({ ...valid, email: 'mеera@kalakar.in' }).success).toBe(false) // Cyrillic е
    expect(signupFormSchema.safeParse({ ...valid, email: `${'a'.repeat(250)}@b.in` }).success).toBe(false)
    expect(signupFormSchema.safeParse({ ...valid, email: `${'a'.repeat(240)}@kalakar.in` }).success).toBe(true)
  })

  it('mirrors PHONE_PATTERN and WEBSITE_PATTERN', () => {
    expect(signupFormSchema.safeParse({ ...valid, phone: '12345' }).success).toBe(false)
    expect(signupFormSchema.safeParse({ ...valid, phone: '022 (4000)-1234' }).success).toBe(true)
    expect(signupFormSchema.safeParse({ ...valid, phone: '(022) 4000-1234' }).success).toBe(false)
    expect(signupFormSchema.safeParse({ ...valid, phone: '+91 abc' }).success).toBe(false)
    expect(issue({ phone: 'call me' })).toBe('Use digits for the phone number, not letters.')
    expect(signupFormSchema.safeParse({ ...valid, phone: '+91 98765 43210 9999' }).success).toBe(false) // 16 digits
    expect(signupFormSchema.safeParse({ ...valid, phone: '+1 415 555 0100' }).success).toBe(true)
    expect(signupFormSchema.safeParse({ ...valid, website: 'localhost' }).success).toBe(false)
    expect(signupFormSchema.safeParse({ ...valid, website: 'ftp://kalakar.in' }).success).toBe(false)
    expect(signupFormSchema.safeParse({ ...valid, website: 'HTTPS://kalakar.in/shop' }).success).toBe(true)
  })
})

describe('normalizeWebsite', () => {
  it('adds https only to a bare host and lower-cases the scheme', () => {
    expect(normalizeWebsite('')).toBe('')
    expect(normalizeWebsite('  kalakar.in ')).toBe('https://kalakar.in')
    expect(normalizeWebsite('http://kalakar.in')).toBe('http://kalakar.in')
    expect(normalizeWebsite('HTTPS://Kalakar.in')).toBe('https://Kalakar.in')
    expect(normalizeWebsite('ftp://kalakar.in')).toBe('ftp://kalakar.in')
  })
})

describe('status, reject and approve bodies', () => {
  it('status: trims and lower-cases the email, keeps the password as typed', () => {
    expect(toStatusBody(statusFormSchema.parse({ email: ' A@B.in ', password: ' pw ' }))).toEqual({ email: 'a@b.in', password: ' pw ' })
    expect(statusFormSchema.safeParse({ email: 'a@b.in', password: '' }).success).toBe(false)
  })

  it('reject: reason is required, at most 1000 characters, trimmed', () => {
    expect(rejectFormSchema.safeParse({ reason: '  ' }).success).toBe(false)
    expect(rejectFormSchema.safeParse({ reason: 'x'.repeat(1001) }).success).toBe(false)
    expect(rejectFormSchema.safeParse({ reason: 'No website.\nAdd it and apply again.' }).success).toBe(true)
    expect(rejectFormSchema.safeParse({ reason: 'No\u0000website' }).success).toBe(false)
    expect(rejectFormSchema.safeParse({ reason: '  ' }).error?.issues[0]?.message).toMatch(/Tell the brand why/)
    expect(toRejectBody(rejectFormSchema.parse({ reason: '  No website.  ' }))).toEqual({ reason: 'No website.' })
  })

  it('approve: trial days 1..365, empty means the backend default', () => {
    expect(parseTrialDays('')).toBeNull()
    expect(parseTrialDays(' 30 ')).toBe(30)
    expect(parseTrialDays('0')).toBe('invalid')
    expect(parseTrialDays('366')).toBe('invalid')
    expect(parseTrialDays('1.5')).toBe('invalid')
    expect(parseTrialDays('-3')).toBe('invalid')
    expect(toApproveBody(null)).toEqual({})
    expect(toApproveBody(14)).toEqual({ trial_days: 14 })
  })
})

describe('format', () => {
  it('has a label for every backend status', () => {
    for (const s of ['pending', 'approved', 'rejected'] as const) expect(SIGNUP_STATUS_META[s].label).toBeTruthy()
  })

  it('maps tabs to the status query param (all = none)', () => {
    expect(QUEUE_TABS[0]).toBe('pending')
    expect(tabToStatus('all')).toBeNull()
    expect(tabToStatus('rejected')).toBe('rejected')
  })

  it('explains each error the endpoints answer', () => {
    expect(statusCheckError(err(401, 'UNAUTHENTICATED'))).toMatch(/No sign-up request matches/)
    expect(signupSubmitError(err(429, 'RATE_LIMITED'))).toMatch(/Too many/)
    const rejected = err(409, 'INVALID_STATUS_TRANSITION')
    expect(decisionError(rejected, 'approve')).toMatch(/already rejected/)
    expect(decisionError(rejected, 'reject')).toMatch(/already approved/)
    expect(decisionNeedsRefresh(rejected)).toBe(true)
    const gone = err(404, 'NOT_FOUND')
    expect(decisionError(gone, 'approve')).toMatch(/no longer exists/)
    expect(decisionNeedsRefresh(gone)).toBe(true)
    expect(decisionNeedsRefresh(err(500, 'INTERNAL_ERROR'))).toBe(false)
  })

  it('reads Retry-After on 429 only', () => {
    expect(retryAfterSeconds(err(429, 'RATE_LIMITED', 17))).toBe(17)
    expect(retryAfterSeconds(err(429, 'RATE_LIMITED'))).toBe(60)
    expect(retryAfterSeconds(err(401, 'UNAUTHENTICATED'))).toBeNull()
  })

  it('formats websites and initials', () => {
    expect(displayWebsite('https://kalakar.in/')).toBe('kalakar.in')
    expect(initials('Meera  Iyer')).toBe('MI')
    expect(initials('Meera')).toBe('M')
    expect(initials('', 'founder@x.in')).toBe('F')
  })
})
