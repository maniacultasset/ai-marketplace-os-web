/**
 * Lane F1 (client Chrome pass 2): the gate panel's counts, details and blocking reason all read
 * the same blockers. Shapes from prod: listing 372afc4b (3 rules findings, 6 marketplace check
 * issues, 3 photo check issues), 5b02befd (rules run passed, the stored issues block) and
 * b953c50b (blocked on an open question, no finding at all).
 */
import { describe, expect, it } from 'vitest'
import type { ValidationSummary } from '@/features/listings/model'
import { blockingQuestions, gateRowFindings, gateTotals } from './gate-truth'
import { rollUpGates, type ErrorItem } from './gates'

const V = '0b1c2d3e-0000-4000-8000-0000000004a1'

const item = (over: Partial<ErrorItem> = {}): ErrorItem => ({
  auto_fixable: false,
  error_code: 'MISSING_ATTRIBUTE',
  field: 'attributes.fabric_type',
  message: 'fabric_type is required',
  retryable: false,
  severity: 'error',
  source: 'rules_engine',
  ...over,
})

const validation = (errors: ErrorItem[]): ValidationSummary => ({
  blocking_count: errors.filter((e) => e.severity === 'error').length,
  warning_count: 0,
  listing_id: 'l1',
  listing_version_id: V,
  passed: !errors.some((e) => e.severity === 'error'),
  schema_version: '1',
  stages: [
    {
      attempt: 1,
      created_at: '2026-11-09T08:59:02Z',
      duration_ms: 0,
      listing_id: 'l1',
      listing_version_id: V,
      marketplace: 'amazon',
      passed: !errors.length,
      report: { attempts_used: 1, max_attempts: 3, retryable: false, schema_version: '1', status: errors.length ? 'failed' : 'passed', errors },
      rules_version: 3,
      schema_version: '1',
      source: 'rules_engine',
      tenant_id: 't',
    },
  ],
})

const listing = { status: 'blocked', status_reason: 'human_task_open', marketplace_state: 'not_submitted', current_version_id: V } as const

describe('one set of blockers for the gate panel (F1)', () => {
  // 372afc4b: "Attributes: 5 blocking issues, See 3 findings"; Media 3 and Commercial 2 with no detail
  const rulesFindings = [item({ field: 'attributes.color' }), item({ field: 'attributes.fabric_type' }), item({ field: 'attributes.neck_style' })]
  const issues = [
    item({ field: 'attributes.fit', source: 'schema' }),
    item({ field: 'attributes.sleeve_type', source: 'schema' }),
    item({ field: 'images[0]', error_code: 'IMAGE_NON_COMPLIANT', source: 'vision_model', message: 'Background is not white' }),
    item({ field: 'images[0]', error_code: 'IMAGE_NON_COMPLIANT', source: 'vision_model', message: 'Text on the image' }),
    item({ field: 'images[1]', error_code: 'IMAGE_NON_COMPLIANT', source: 'vision_model', message: 'Too small' }),
    item({ field: 'attributes.mrp', source: 'schema' }),
    item({ field: 'attributes.price', source: 'schema' }),
  ]
  const gates = rollUpGates({ listing, validation: validation(rulesFindings), rules: [], preview: null, imageCount: 2, issues })
  const gate = (id: string) => gates.find((g) => g.id === id)!

  it('lists every blocker a gate counts, from every source', () => {
    expect(gate('attributes').note).toBe('5 blocking issues')
    expect(gateRowFindings(gate('attributes'))).toHaveLength(5)
    expect(gate('media').note).toBe('3 blocking issues')
    expect(gateRowFindings(gate('media')).map((f) => f.message)).toEqual(['Background is not white', 'Text on the image', 'Too small'])
    expect(gateRowFindings(gate('commercial'))).toHaveLength(2)
  })

  it('totals the footer from the gates, not from the rules run alone', () => {
    expect(validation(rulesFindings).blocking_count).toBe(3)
    expect(gateTotals(gates)).toEqual({ blocking: 10, warnings: 0 })
  })

  it('5b02befd: a passed rules run with blocking stored issues is never "0 blocking"', () => {
    const g = rollUpGates({ listing, validation: validation([]), rules: [], preview: null, imageCount: 1, issues: [item({ field: 'attributes.mrp', source: 'schema' })] })
    expect(gateTotals(g).blocking).toBe(1)
  })

  it('counts a gate blocked without a finding (no image) once, and leaves recommendations out', () => {
    const recommended = item({ field: 'attributes.fit', severity: 'warning' })
    const g = rollUpGates({ listing, validation: validation([recommended]), rules: [], preview: null, imageCount: 0 })
    expect(gateTotals(g)).toEqual({ blocking: 1, warnings: 0 })
    expect(gateRowFindings(g.find((x) => x.id === 'attributes')!)).toEqual([])
  })
})

describe('blockingQuestions (B15)', () => {
  const task = (over: object = {}) => ({ id: 't1', product_id: 'p1', status: 'open' as const, question: 'What is the colour?', blocking: true, ...over })
  const blocked = { status: 'blocked', status_reason: 'human_task_open', product_id: 'p1' } as const

  it('names the open questions of this product while the listing waits on one', () => {
    expect(blockingQuestions(blocked, [task(), task({ id: 't2', product_id: 'p2' }), task({ id: 't3', blocking: false })])).toEqual([task()])
  })

  it('is empty for another status and while the tasks are unread', () => {
    expect(blockingQuestions({ ...blocked, status_reason: 'validation_errors' }, [task()])).toEqual([])
    expect(blockingQuestions(blocked, undefined)).toEqual([])
  })
})
