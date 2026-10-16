import { describe, expect, it } from 'vitest'
import {
  checkRows,
  defaultSlot,
  imageIdFromKey,
  marketplaceReports,
  slotsFor,
  stageLabel,
  tally,
  validateImageFile,
  type ImageReport,
} from './report'
import { signedStepUnavailable } from './upload'
import { ApiError } from '@/api/errors'

const T = '11111111-1111-4111-8111-111111111111'
const P = '22222222-2222-4222-8222-222222222222'
const I = '33333333-3333-4333-8333-333333333333'

const report = (over: Partial<ImageReport> = {}): ImageReport => ({
  schema_version: '1',
  image_id: I,
  marketplace: 'amazon',
  slot: 'main',
  pass: false,
  processed_at: '2026-10-12T10:00:00Z',
  checks: [
    { check: 'format', method: 'deterministic', passed: true },
    { check: 'background', method: 'vision', passed: false },
    { check: 'resolution', method: 'deterministic', passed: true },
  ],
  issues: [{ code: 'BACKGROUND_OFF', check: 'background', suggestion: 'Use a pure white background.' }],
  ...over,
})

describe('image keys and files', () => {
  it('reads the image id from a storage key', () => {
    expect(imageIdFromKey(`${T}/${P}/images/${I}`)).toBe(I)
    expect(imageIdFromKey(`${T}/${P}/docs/${I}`)).toBeNull()
    expect(imageIdFromKey(`x/${T}/${P}/images/${I}`)).toBeNull()
  })

  it('validates type and size like the backend', () => {
    expect(validateImageFile({ type: 'image/png', size: 100 })).toBeNull()
    expect(validateImageFile({ type: 'image/gif', size: 100 })).toMatch(/JPEG, PNG or WebP/)
    expect(validateImageFile({ type: 'image/jpeg', size: 0 })).toMatch(/empty/)
    expect(validateImageFile({ type: 'image/webp', size: 10_485_761 })).toMatch(/10 MB/)
    expect(validateImageFile({ type: 'image/webp', size: 10_485_760 })).toBeNull()
  })

  it('a variant cannot take a size chart; first image defaults to main', () => {
    expect(slotsFor(true)).not.toContain('size_chart')
    expect(slotsFor(false)).toContain('size_chart')
    expect(defaultSlot(0)).toBe('main')
    expect(defaultSlot(2)).toBe('secondary')
  })

  it('queued stage reads as processing soon, never as an error', () => {
    expect(stageLabel({ kind: 'accepted', imageId: I, jobId: I })).toBe('Queued: processing starts soon')
  })
})

describe('checkRows', () => {
  it('a failed check on a blocked report is fail, sorted first, with its suggestion', () => {
    const rows = checkRows(report())
    expect(rows[0]).toMatchObject({ check: 'background', outcome: 'fail', method: 'vision', suggestions: ['Use a pure white background.'] })
    expect(tally(rows)).toEqual({ pass: 2, warn: 0, fail: 1 })
  })

  it('a failed check on a passing report is a warning', () => {
    const rows = checkRows(report({ pass: true }))
    expect(rows[0]!.outcome).toBe('warn')
    expect(tally(rows)).toEqual({ pass: 2, warn: 1, fail: 0 })
  })

  it('an issue without a check row still shows', () => {
    const rows = checkRows(
      report({ checks: [], issues: [{ code: 'WATERMARK', check: 'watermark', suggestion: 'Remove the watermark.' }] }),
    )
    expect(rows).toEqual([
      { check: 'watermark', label: 'Watermark', outcome: 'fail', method: 'deterministic', suggestions: ['Remove the watermark.'] },
    ])
  })

  it('marketplaceReports lists present reports in enum order', () => {
    const out = marketplaceReports({
      image_id: I,
      compliance_status: 'failed',
      reports: { flipkart: report({ marketplace: 'flipkart' }), amazon: report() },
    })
    expect(out.map((r) => r.marketplace)).toEqual(['amazon', 'flipkart'])
    expect(marketplaceReports({ image_id: I, compliance_status: 'pending' })).toEqual([])
  })
})

describe('signedStepUnavailable', () => {
  it('falls back to multipart only when the signed step is not served', () => {
    const err = (status: number) => new ApiError({ status, type: status === 501 ? 'NOT_IMPLEMENTED' : status === 0 ? 'NETWORK' : 'VALIDATION_FAILED', message: 'x' })
    expect(signedStepUnavailable(err(501))).toBe(true)
    expect(signedStepUnavailable(err(503))).toBe(true)
    expect(signedStepUnavailable(err(0))).toBe(true)
    expect(signedStepUnavailable(err(422))).toBe(false)
    expect(signedStepUnavailable(err(404))).toBe(false)
    expect(signedStepUnavailable(new Error('x'))).toBe(false)
  })
})
