import { describe, expect, it } from 'vitest'
import {
  checkRows,
  defaultSlot,
  imageFileName,
  imageIdFromKey,
  marketplaceReports,
  photoQaWarnings,
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
      report({ checks: [], issues: [{ code: 'LOGO_PROHIBITED', check: 'logo', suggestion: 'Remove the logo.' }] }),
    )
    expect(rows).toEqual([{ check: 'logo', label: 'Logo', outcome: 'fail', method: 'deterministic', suggestions: ['Remove the logo.'] }])
  })

  it('photo QA checks are warnings even when the report is blocked for another reason', () => {
    const rows = checkRows(
      report({
        pass: false,
        checks: [
          { check: 'background', method: 'deterministic', passed: false },
          { check: 'fill_ratio', method: 'deterministic', passed: false },
        ],
        issues: [{ code: 'WATERMARK', check: 'watermark', suggestion: 'Remove the watermark.' }],
      }),
    )
    expect(rows.map((r) => [r.check, r.outcome])).toEqual([
      ['background', 'fail'],
      ['fill_ratio', 'warn'],
      ['watermark', 'warn'],
    ])
  })
})

describe('photoQaWarnings', () => {
  const out = (amazon: Partial<ImageReport> | null, flipkart: Partial<ImageReport> | null = null) => ({
    image_id: I,
    compliance_status: 'passed' as const,
    reports: { amazon: amazon ? report({ pass: true, ...amazon }) : null, flipkart: flipkart ? report({ marketplace: 'flipkart', pass: true, ...flipkart }) : null },
  })

  it('is empty while photo QA is off (no QA check or issue in the report)', () => {
    expect(photoQaWarnings(out({}))).toEqual([])
    expect(photoQaWarnings(undefined)).toEqual([])
  })

  it('lists each warning once across marketplaces, in a fixed order, with its suggestion', () => {
    const w = photoQaWarnings(
      out(
        { checks: [{ check: 'fill_ratio', method: 'deterministic', passed: false }], issues: [{ code: 'FILL_RATIO_LOW', check: 'fill_ratio', suggestion: 'Zoom or crop so the product fills the frame' }] },
        { checks: [{ check: 'text_overlay', method: 'deterministic', passed: false }, { check: 'fill_ratio', method: 'deterministic', passed: false }] },
      ),
    )
    expect(w).toEqual([
      { check: 'text_overlay', label: 'Text on image', suggestion: null },
      { check: 'fill_ratio', label: 'Low fill', suggestion: 'Zoom or crop so the product fills the frame' },
    ])
  })

  it('ignores a passed QA check', () => {
    expect(photoQaWarnings(out({ checks: [{ check: 'watermark', method: 'deterministic', passed: true }] }))).toEqual([])
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

describe('imageFileName (Media tab rows, prod Chrome check 13 Nov)', () => {
  const key = 'aa92b4c4-52e0-406a-9c20-47f74feaaecc/b76d0a67-0166-42f8-82b4-832c789ad956/images/ba8702db-b189-4cbd-9f43-5a1e2b3c4d5e'
  it('shows the original file name when known', () => {
    expect(imageFileName('ktest-grey-front.jpg', 'main')).toBe('ktest-grey-front.jpg')
  })
  it('shows the view label, never a storage path or an id', () => {
    expect(imageFileName(undefined, 'main')).toBe('Front photo')
    expect(imageFileName(key, 'main')).toBe('Front photo')
    expect(imageFileName('ba8702db-b189-4cbd-9f43-5a1e2b3c4d5e', 'secondary', 'back')).toBe('Back photo')
    expect(imageFileName(null, 'secondary', 'close_up')).toBe('Close-up photo')
    expect(imageFileName(null)).toBe('Photo')
  })
})
