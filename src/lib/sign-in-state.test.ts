import { describe, expect, it } from 'vitest'
import { approvedSignIn, readApprovedSignIn } from './sign-in-state'

describe('the approved card’s sign-in state', () => {
  it('carries a plausible email, trimmed, and nothing else', () => {
    expect(approvedSignIn(' founder@kalakar.example ')).toEqual({ approvedSignIn: { email: 'founder@kalakar.example' } })
    expect(approvedSignIn('')).toEqual({ approvedSignIn: {} })
    expect(approvedSignIn('not an email')).toEqual({ approvedSignIn: {} })
    expect(approvedSignIn(undefined)).toEqual({ approvedSignIn: {} })
    expect(approvedSignIn(`${'a'.repeat(320)}@x.test`)).toEqual({ approvedSignIn: {} })
  })

  it('reads back only what it wrote; any other history state is not an approved sign-in', () => {
    expect(readApprovedSignIn(approvedSignIn('founder@kalakar.example'))).toEqual({ email: 'founder@kalakar.example' })
    expect(readApprovedSignIn(approvedSignIn(null))).toEqual({ email: null })
    expect(readApprovedSignIn({ approvedSignIn: { email: 42 } })).toEqual({ email: null })
    expect(readApprovedSignIn({ key: 'abc', __TSR_index: 1 })).toBeNull()
    expect(readApprovedSignIn(null)).toBeNull()
    expect(readApprovedSignIn('x')).toBeNull()
  })
})
