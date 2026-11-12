import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/errors'
import type { ActionState, BatchAccepted, BatchResult } from '@/features/listings/model'
import type { Action } from '@/lib/permissions'
import { attempt, resolution } from '@/test/resolution-fixtures'
import { approveThenPublish, isResend, resendView, sectionSavedToast, type ResendInput } from './resend'

const on: ActionState = { show: true, enabled: true }
const all = () => true
const fixReady = resolution({ state: 'fix_ready', next_step: { kind: 'approve', task_ids: [], text: '' } })

const input = (over: Partial<ResendInput> = {}, listing: Partial<ResendInput['listing']> = {}): ResendInput => ({
  resolution: fixReady,
  listing: { marketplace: 'amazon', status: 'needs_review', can_approve: true, approve_hint: null, ...listing },
  approve: on,
  can: all,
  publishBuilt: true,
  ...over,
})

describe('resendView: maker-checker decides who sees "Approve and resend"', () => {
  it('a teammate who may approve and send sees "Approve and resend"', () => {
    expect(resendView(input())).toEqual({ kind: 'approve_and_resend', state: on })
  })

  it('the version\'s maker or editor sees "Sent to a teammate for approval" and no button', () => {
    expect(resendView(input({}, { can_approve: false, approve_hint: 'own_work' }))).toEqual({ kind: 'teammate' })
  })

  it('the answerer of a fact question whose answer made the version is its maker too (T51)', () => {
    // A fact answer after a refused send: the read is idle, the listing was sent before.
    const afterAnswer = resolution({ state: 'idle', attempts: [attempt({ outcome: 'rejected' })] })
    expect(resendView(input({ resolution: afterAnswer }, { can_approve: false, approve_hint: 'own_work' }))).toEqual({ kind: 'teammate' })
    expect(resendView(input({ resolution: afterAnswer })).kind).toBe('approve_and_resend')
  })

  it('while Amazon publishing is paused (publishGate: no publish) the plain approve, never a send', () => {
    expect(resendView(input({ publishBuilt: false })).kind).toBe('none')
  })

  it('a role that may approve but not publish gets the plain approve', () => {
    const can = (a: Action) => a !== 'listing:publish'
    expect(resendView(input({ can })).kind).toBe('none')
  })

  it('a role that may not approve sees no resend button', () => {
    expect(resendView(input({ approve: { show: false, enabled: false } })).kind).toBe('none')
  })

  it('keeps the disabled reason (for example a missing check) on the button', () => {
    const off: ActionState = { show: true, enabled: false, reason: 'Approval needs a passing check on this version. Run checks first.' }
    expect(resendView(input({ approve: off }))).toEqual({ kind: 'approve_and_resend', state: off })
  })

  it('never on Flipkart, and never on a first send', () => {
    expect(resendView(input({}, { marketplace: 'flipkart' })).kind).toBe('none')
    expect(resendView(input({ resolution: resolution({ attempts: [attempt({ kind: 'precheck', number: 0, outcome: 'clean' })] }) })).kind).toBe('none')
    expect(resendView(input({ resolution: null })).kind).toBe('none')
  })

  it('an approved version is published from the banner, not approved again', () => {
    expect(resendView(input({}, { status: 'approved' })).kind).toBe('none')
  })

  it('isResend: a prepared fix, or a version after a send', () => {
    expect(isResend(fixReady)).toBe(true)
    expect(isResend(resolution({ attempts: [attempt()] }))).toBe(true)
    expect(isResend(resolution())).toBe(false)
  })
})

const L = { id: 'l1', status: 'needs_review' as const, status_reason: null, current_version_id: 'v2', approved_version_id: 'v1' }
const item = (over: Partial<BatchResult['items'][number]> = {}) => ({ listing_id: 'l1', http_status: 200, error: null, job_id: null, listing_status: null, ...over })
const ok = (): BatchResult => ({ items: [item({ listing_status: 'approved' })] }) as BatchResult
const accepted = (): BatchAccepted => ({ batch_id: 'b1', poll_url: '/x', items: [item({ http_status: 202, job_id: 'j1' })] }) as BatchAccepted
const report = (code: string) => ({ error_code: code, errors: [], request_id: 'req-1' }) as unknown as NonNullable<BatchResult['items'][number]['error']>

describe('approveThenPublish', () => {
  it('approves, then publishes the approved version, in that order, with nothing in between', async () => {
    const order: string[] = []
    const approve = vi.fn(async () => (order.push('approve'), ok()))
    const publish = vi.fn(async () => (order.push('publish'), accepted()))
    const out = await approveThenPublish(L, { approve, publish })
    expect(order).toEqual(['approve', 'publish'])
    expect(approve).toHaveBeenCalledWith([{ listing_id: 'l1', listing_version_id: 'v2', decision: 'approve', regenerate: false }])
    expect(publish).toHaveBeenCalledWith([{ listing_id: 'l1', listing_version_id: 'v2' }])
    expect(out).toEqual({ step: 'sent', jobId: 'j1' })
  })

  it('an approve 403 publishes nothing', async () => {
    const publish = vi.fn()
    const err = new ApiError({ status: 403, type: 'PERMISSION_DENIED', message: 'No.', correlationId: 'req-9' })
    const out = await approveThenPublish(L, { approve: () => Promise.reject(err), publish })
    expect(out.step).toBe('approve_failed')
    expect(publish).not.toHaveBeenCalled()
  })

  it('a maker-checker refusal on the item publishes nothing', async () => {
    const publish = vi.fn()
    const out = await approveThenPublish(L, { approve: async () => ({ items: [item({ http_status: 403, error: report('MAKER_CHECKER_VIOLATION') })] }) as BatchResult, publish })
    expect(out).toMatchObject({ step: 'approve_failed', message: 'You generated or edited this version, so someone else must approve it.' })
    expect(publish).not.toHaveBeenCalled()
  })

  it('a publish 409 after a good approve says so once, keeps the approval and does not retry', async () => {
    const err = new ApiError({ status: 409, type: 'SUBMISSION_IN_FLIGHT', message: 'A submission is open.', correlationId: 'req-2' })
    const publish = vi.fn(() => Promise.reject(err))
    const approve = vi.fn(async () => ok())
    const out = await approveThenPublish(L, { approve, publish })
    expect(out.step).toBe('publish_failed')
    expect(out).toMatchObject({ requestId: 'req-2' })
    expect(approve).toHaveBeenCalledTimes(1)
    expect(publish).toHaveBeenCalledTimes(1)
  })

  it('a refused publish item is a publish failure too', async () => {
    const out = await approveThenPublish(L, {
      approve: async () => ok(),
      publish: async () => ({ batch_id: 'b', poll_url: '/x', items: [item({ http_status: 409, error: report('SUBMISSION_IN_FLIGHT') })] }) as BatchAccepted,
    })
    expect(out).toMatchObject({ step: 'publish_failed', message: 'A submission of this listing is still open.' })
  })
})

describe('section save toast (item 17)', () => {
  it('never says a teammate approves while owner approval is on', () => {
    const own = sectionSavedToast('Title', { ownApproval: true, resendEdit: false, mp: 'Amazon' })
    expect(own).toEqual({ title: 'Title saved', description: 'Kept as your edit and locked. The checks ran again. You can approve it yourself.' })
    expect(own.description).not.toMatch(/teammate|Someone else/)
    const ownResend = sectionSavedToast('Title', { ownApproval: true, resendEdit: true, mp: 'Amazon' })
    expect(ownResend.title).toBe('Title saved')
    expect(ownResend.description).toContain('You can approve it yourself and send it to Amazon again.')
  })

  it('names the teammate or someone else when owner approval is off', () => {
    expect(sectionSavedToast('Title', { ownApproval: false, resendEdit: true, mp: 'Amazon' }).title).toBe('Sent to a teammate for approval')
    expect(sectionSavedToast('Key features', { ownApproval: false, resendEdit: false, mp: 'Amazon' }).description).toContain('Someone else approves it.')
  })
})
