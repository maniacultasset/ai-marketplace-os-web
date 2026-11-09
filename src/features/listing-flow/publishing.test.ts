import { describe, expect, it } from 'vitest'
import { publishGate } from './publishing'

describe('publishGate (tenant capabilities)', () => {
  it('while Amazon publishing is off: the paused line, and no Publish or resend', () => {
    expect(publishGate('amazon', { paused: true, known: true }, true)).toEqual({ paused: true, publishBuilt: false })
  })

  it('Publish waits for the tenant read, so it is never offered and then taken back', () => {
    expect(publishGate('amazon', { paused: false, known: false }, true)).toEqual({ paused: false, publishBuilt: false })
  })

  it('Amazon publishing on: Publish as before', () => {
    expect(publishGate('amazon', { paused: false, known: true }, true)).toEqual({ paused: false, publishBuilt: true })
    expect(publishGate('amazon', { paused: false, known: true }, false)).toEqual({ paused: false, publishBuilt: false })
  })

  it('the Amazon switch never touches another marketplace', () => {
    expect(publishGate('flipkart', { paused: true, known: false }, true)).toEqual({ paused: false, publishBuilt: true })
  })
})
