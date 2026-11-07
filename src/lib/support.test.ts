import { describe, expect, it } from 'vitest'
import { SUPPORT_EMAIL, supportMailto } from './support'

describe('supportMailto', () => {
  it('opens an email to Kuinn support', () => {
    expect(SUPPORT_EMAIL).toBe('support@kuinn.in')
    expect(supportMailto()).toBe('mailto:support@kuinn.in')
  })
  it('encodes the subject and body with %20 for spaces', () => {
    expect(supportMailto('Help with CATEGORY_NOT_MAPPED', 'Issue 1 & 2.')).toBe(
      'mailto:support@kuinn.in?subject=Help%20with%20CATEGORY_NOT_MAPPED&body=Issue%201%20%26%202.',
    )
  })
})
