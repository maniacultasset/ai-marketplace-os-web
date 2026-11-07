import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/errors'
import {
  answerFailure,
  answerMode,
  checkAnswer,
  factKey,
  fold,
  isBlockingTask,
  isFactQuestion,
  isPhotoQuestion,
  parseAnswerSpec,
  taskSuggestions,
  type AnswerSpec,
} from './answer-spec'

const IMG = '0b1c2d3e-0000-4000-8000-000000000501'
const task = (over: Record<string, unknown> = {}) => ({
  kind: 'missing_fact' as const,
  product_id: '0b1c2d3e-0000-4000-8000-000000000101',
  target_path: 'facts.attributes.color',
  image_id: IMG as string | null,
  suggestions: [] as unknown[],
  ...over,
})

describe('which tasks are answerable fact questions', () => {
  it('takes missing and conflicting facts on a product attribute, like tasks_answer', () => {
    expect(factKey(task())).toBe('color')
    expect(factKey(task({ kind: 'conflicting_facts', target_path: 'facts.attributes.number_of_pieces' }))).toBe('number_of_pieces')
  })
  it('refuses what the backend refuses: other kinds, no product, other targets', () => {
    expect(isFactQuestion(task({ kind: 'reconnect_account' }))).toBe(false)
    expect(isFactQuestion(task({ product_id: null }))).toBe(false)
    expect(isFactQuestion(task({ target_path: 'brand.default_manufacturer' }))).toBe(false)
    expect(isFactQuestion(task({ target_path: 'facts.attributes.Color' }))).toBe(false)
    expect(isFactQuestion(task({ target_path: null }))).toBe(false)
  })
})

describe('photo questions never block by themselves', () => {
  it('a fact question with a photo, or a photo suggestion, is a photo question', () => {
    expect(isPhotoQuestion(task())).toBe(true)
    expect(isPhotoQuestion(task({ image_id: null, suggestions: [{ value: 'red', label: 'red', source: 'ai', evidence_ref: `image:${IMG}` }] }))).toBe(true)
    expect(isPhotoQuestion(task({ image_id: null }))).toBe(false)
    expect(isPhotoQuestion(task({ kind: 'image_replacement' }))).toBe(false)
  })
  it('only non-photo questions block, unless the API says otherwise', () => {
    expect(isBlockingTask(task())).toBe(false)
    expect(isBlockingTask(task({ image_id: null }))).toBe(true)
    expect(isBlockingTask(task({ kind: 'reconnect_account', product_id: null, target_path: 'account.x', image_id: null }))).toBe(true)
    expect(isBlockingTask(task({ blocking: true }))).toBe(true)
    expect(isBlockingTask(task({ image_id: null, blocking: false }))).toBe(false)
  })
})

describe('taskSuggestions', () => {
  it('marks photo and seller values, skips what it cannot show', () => {
    const s = taskSuggestions({
      suggestions: [
        { value: 'red', label: 'red', source: 'seller' },
        { value: 'maroon', label: 'maroon', source: 'ai', evidence_ref: `image:${IMG}` },
        { value: 'blue', source: 'ai' },
        { value: { nested: true }, label: 'x' },
        'loose string',
        null,
      ],
    })
    expect(s).toEqual([
      { value: 'red', label: 'red', from: 'you' },
      { value: 'maroon', label: 'maroon', from: 'photo' },
      { value: 'blue', label: 'blue', from: 'other' },
    ])
  })
})

describe('parseAnswerSpec and answerMode', () => {
  it('reads every AnswerSpec kind', () => {
    expect(parseAnswerSpec({ kind: 'enum', allowed_values: ['red', 'maroon', 3] }, 'color')).toEqual({ kind: 'enum', allowed: ['red', 'maroon'] })
    expect(parseAnswerSpec({ kind: 'text', max_length: 40 }, 'occasion')).toEqual({ kind: 'text', maxLength: 40 })
    expect(parseAnswerSpec({ kind: 'number', min: 0, max: 5, unit: 'cm' }, 'gsm')).toEqual({ kind: 'number', min: 0, max: 5, integer: false, unit: 'cm' })
    expect(parseAnswerSpec({ kind: 'boolean' }, 'x')).toEqual({ kind: 'boolean' })
    expect(parseAnswerSpec({ kind: 'money_inr' }, 'mrp')).toEqual({ kind: 'money_inr' })
    expect(parseAnswerSpec({ kind: 'file' }, 'x')).toEqual({ kind: 'unsupported', raw: 'file' })
    expect(parseAnswerSpec(null, 'x')).toEqual({ kind: 'unsupported', raw: null })
  })
  it('a piece count is a whole number 1..50 whatever the spec says', () => {
    expect(parseAnswerSpec({ kind: 'enum', allowed_values: ['1', '2'] }, 'number_of_pieces')).toEqual({ kind: 'number', min: 1, max: 50, integer: true, unit: null })
  })
  it('multi_enum, an enum without options and unknown kinds are read only; acknowledge is one button', () => {
    expect(answerMode({ kind: 'multi_enum', allowed: ['a'] }).mode).toBe('read-only')
    expect(answerMode({ kind: 'enum', allowed: [] }).mode).toBe('read-only')
    expect(answerMode({ kind: 'unsupported', raw: 'reconnect' }).mode).toBe('read-only')
    expect(answerMode({ kind: 'acknowledge' }).mode).toBe('acknowledge')
    expect(answerMode({ kind: 'text', maxLength: null }).mode).toBe('input')
  })
})

describe('checkAnswer mirrors the backend', () => {
  const ok = (spec: AnswerSpec, draft: string | boolean | null) => checkAnswer(spec, draft)
  const enumSpec: AnswerSpec = { kind: 'enum', allowed: ['v-neck', 'round neck', 'three-quarter sleeve'] }

  it('fold matches the backend: case, dashes and underscores, spaces', () => {
    expect(fold('  Three—Quarter_Sleeve ')).toBe('three quarter sleeve')
    expect(fold('V‐NECK')).toBe('v neck')
  })
  it('enum: one allowed value, sent in its stored form', () => {
    expect(ok(enumSpec, 'V-Neck')).toEqual({ ok: true, value: 'v-neck' })
    expect(ok(enumSpec, 'three quarter sleeve')).toEqual({ ok: true, value: 'three-quarter sleeve' })
    expect(ok(enumSpec, 'boat neck')).toEqual({ ok: false, error: 'Pick one of the options.' })
    expect(ok(enumSpec, null)).toEqual({ ok: false, error: 'Pick one.' })
  })
  it('text: within its max length, never blank', () => {
    const spec: AnswerSpec = { kind: 'text', maxLength: 5 }
    expect(ok(spec, ' party ')).toEqual({ ok: true, value: 'party' })
    expect(ok(spec, 'festive')).toEqual({ ok: false, error: 'Keep it to 5 characters or fewer.' })
    expect(ok(spec, '   ')).toEqual({ ok: false, error: 'Type an answer.' })
    expect(ok({ kind: 'text', maxLength: null }, 'x'.repeat(2001)).ok).toBe(false)
  })
  it('number: a finite number within min and max; a piece count is whole', () => {
    const pieces = parseAnswerSpec({}, 'number_of_pieces')
    expect(ok(pieces, '3')).toEqual({ ok: true, value: 3 })
    expect(ok(pieces, '0')).toEqual({ ok: false, error: 'Enter 1 or more.' })
    expect(ok(pieces, '51')).toEqual({ ok: false, error: 'Enter 50 or less.' })
    expect(ok(pieces, '2.5')).toEqual({ ok: false, error: 'Enter a whole number, like 3.' })
    expect(ok(pieces, 'three')).toEqual({ ok: false, error: 'Enter a whole number, like 3.' })
    expect(ok(pieces, '')).toEqual({ ok: false, error: 'Enter a number.' })
    const free: AnswerSpec = { kind: 'number', min: null, max: 10, integer: false, unit: null }
    expect(ok(free, '2.5')).toEqual({ ok: true, value: 2.5 })
    expect(ok(free, '1e400')).toEqual({ ok: false, error: 'Enter a number, like 3 or 2.5.' })
  })
  it('boolean: Yes or No only', () => {
    expect(ok({ kind: 'boolean' }, true)).toEqual({ ok: true, value: true })
    expect(ok({ kind: 'boolean' }, false)).toEqual({ ok: true, value: false })
    expect(ok({ kind: 'boolean' }, 'yes')).toEqual({ ok: false, error: 'Pick Yes or No.' })
  })
  it('money_inr: a positive amount with at most 2 decimals, sent as the backend string', () => {
    expect(ok({ kind: 'money_inr' }, '₹1,299.50')).toEqual({ ok: true, value: '1299.50' })
    expect(ok({ kind: 'money_inr' }, '0').ok).toBe(false)
    expect(ok({ kind: 'money_inr' }, '12.345').ok).toBe(false)
    expect(ok({ kind: 'money_inr' }, '')).toEqual({ ok: false, error: 'Enter an amount.' })
  })
  it('percent_composition: a fabric mix that adds up', () => {
    expect(ok({ kind: 'percent_composition' }, '95% Cotton, 5% Elastane')).toEqual({ ok: true, value: '95% Cotton, 5% Elastane' })
    expect(ok({ kind: 'percent_composition' }, '90% Cotton').ok).toBe(false)
  })
  it('nothing to send for read-only kinds', () => {
    expect(ok({ kind: 'multi_enum', allowed: ['a'] }, 'a').ok).toBe(false)
    expect(ok({ kind: 'acknowledge' }, null).ok).toBe(false)
  })
})

describe('answerFailure', () => {
  it('a 422 at value lands on the field', () => {
    const err = new ApiError({ type: 'VALIDATION_FAILED', status: 422, message: 'm', details: [{ loc: ['body', 'value'], msg: 'x' }] })
    expect(answerFailure(err).kind).toBe('field')
  })
  it('a closed question says so', () => {
    expect(answerFailure(new ApiError({ type: 'INVALID_STATUS_TRANSITION', status: 409, message: 'm' })).kind).toBe('closed')
    expect(answerFailure(new ApiError({ type: 'NOT_FOUND', status: 404, message: 'm' })).kind).toBe('closed')
  })
  it('anything else is a retryable error with plain words', () => {
    expect(answerFailure(new ApiError({ type: 'NETWORK', status: 0, message: 'm' })).message).toMatch(/Can’t reach the server/)
    expect(answerFailure(new Error('x')).kind).toBe('error')
  })
})
