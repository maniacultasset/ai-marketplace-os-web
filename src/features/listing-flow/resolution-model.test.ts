import { describe, expect, it } from 'vitest'
import {
  hasResolution,
  resendAccepted,
  resolutionAction,
  resolutionHeadline,
  resolutionSteps,
  resolutionView,
  triesText,
  wasSent,
  WORKING_STATES,
  type Attempt,
  type Resolution,
} from './resolution-model'
import { at, attempt, resolution } from '@/test/resolution-fixtures'

const ctx = { marketplace: 'amazon' }
const headline = (over: Partial<Resolution>, c: { marketplace: string; marketplaceState?: string | null } = ctx) => resolutionHeadline(resolution(over), c)

describe('resolutionHeadline: one calm line per state', () => {
  it('checking', () => {
    const h = headline({ state: 'checking' })
    expect(h.title).toBe('Checking with Amazon')
    expect(h.tone).toBe('working')
    expect(h.working).toBe(true)
  })

  it('fixing', () => {
    expect(headline({ state: 'fixing' }).title).toBe('Kuinn is fixing this')
  })

  it('resubmitted says "Fixed for you" only once Amazon accepted Kuinn\'s resend', () => {
    const pending = headline({ state: 'resubmitted', attempts: [attempt({ number: 2, actor: 'system', outcome: 'pending' })] })
    expect(pending.title).toBe('Sent again to Amazon')
    expect(pending.title).not.toContain('Fixed')
    const accepted = headline({ state: 'resubmitted', attempts: [attempt({ number: 2, actor: 'system', outcome: 'accepted' })] })
    expect(accepted.title).toBe('Fixed for you')
    expect(accepted.tone).toBe('success')
    // A person's own resend is never Kuinn's fix.
    expect(headline({ state: 'resubmitted', attempts: [attempt({ number: 2, actor: 'user', outcome: 'accepted' })] }).title).toBe('Sent again to Amazon')
  })

  it('resubmitted never claims a text change: only a value format is resent on its own', () => {
    const h = headline({ state: 'resubmitted', attempts: [attempt({ actor: 'system', outcome: 'pending' })] })
    expect(h.line).toContain('text stayed the same')
  })

  it('fix_ready asks a teammate to approve before it is sent', () => {
    const h = headline({ state: 'fix_ready' })
    expect(h.title).toBe('Fix ready: approve to resend')
    expect(h.line).toMatch(/teammate who did not make the change approves it/)
    expect(h.working).toBe(false)
  })

  it('needs_you', () => {
    expect(headline({ state: 'needs_you' }).title).toBe('Needs you')
  })

  it('needs_marketplace names the marketplace and the resume step', () => {
    const h = headline({ state: 'needs_marketplace' })
    expect(h.title).toBe('Needs Amazon approval')
    expect(h.line).toMatch(/then resume/)
  })

  it('stopped after the three automatic tries', () => {
    const h = headline({ state: 'stopped', cycles_used: 3 })
    expect(h.title).toBe('Stopped after 3 tries')
    expect(h.tone).toBe('danger')
    // Stopped for another reason (a fix job ended with no version) does not claim three tries.
    expect(headline({ state: 'stopped', cycles_used: 1 }).title).toBe('Kuinn stopped')
  })

  it('live only when the marketplace reports it live', () => {
    expect(headline({ state: 'live' }, { marketplace: 'amazon', marketplaceState: 'live' }).title).toBe('Live')
    const sent = headline({ state: 'live' }, { marketplace: 'amazon', marketplaceState: 'processing' })
    expect(sent.title).toBe('Sent to Amazon')
    expect(sent.line).toMatch(/Live is shown only once Amazon says so/)
  })

  it('idle, and an unknown future state, read as idle', () => {
    expect(headline({ state: 'idle' }).title).toBe('Nothing to do right now')
    expect(headline({ state: 'something_new' as Resolution['state'] }).title).toBe('Nothing to do right now')
  })

  it('the working states are the polled ones', () => {
    expect([...WORKING_STATES].sort()).toEqual(['checking', 'fixing', 'resubmitted'])
  })

  it('copy has no em dashes', () => {
    const states: Resolution['state'][] = ['checking', 'fixing', 'resubmitted', 'fix_ready', 'needs_you', 'needs_marketplace', 'stopped', 'live', 'idle']
    for (const state of states) {
      const h = headline({ state, cycles_used: 3 })
      expect(`${h.title} ${h.line}`).not.toMatch(/[—–]/)
    }
  })
})

describe('triesText', () => {
  it('"2 of 3 automatic tries"', () => {
    expect(triesText({ cycles_used: 2, max_cycles: 3 })).toBe('2 of 3 automatic tries')
    expect(triesText({ cycles_used: 0, max_cycles: 3 })).toBeNull()
  })
})

describe('resolutionSteps', () => {
  it('orders oldest first: Pre-check, Sent 1, Sent 2 by Kuinn', () => {
    const steps = resolutionSteps(
      [
        attempt({ number: 2, actor: 'system', outcome: 'pending', at: at(3) }),
        attempt({ number: 1, outcome: 'rejected', at: at(2) }),
        attempt({ kind: 'precheck', number: 0, actor: 'system', outcome: 'clean', at: at(1) }),
      ],
      'amazon',
    )
    expect(steps.map((s) => s.title)).toEqual(['Pre-check', 'Sent 1', 'Sent 2 by Kuinn'])
    expect(steps.map((s) => s.outcome.label)).toEqual(['Passed', 'Refused', 'Waiting for Amazon'])
  })

  it('heads Kuinn\'s repairs "Fixed for you" only after its resend was accepted', () => {
    const repair = { kind: 'repair' as const, field: 'attributes.size', summary: 'Kuinn set size the way the marketplace accepts it.', rule: 'size_alias' }
    const failed = { field: 'attributes.size', message: 'XXL is not an allowed size.', lane: 'auto_repair' as const, cause: 'mapping' as const }
    const sentAgain = (outcome: Attempt['outcome']) =>
      resolutionSteps([attempt({ number: 2, actor: 'system', outcome, at: at(2) }), attempt({ number: 1, failed: [failed], changed: [repair], at: at(1) })], 'amazon')
    expect(sentAgain('pending')[0]!.changedTitle).toBe('What Kuinn changed')
    expect(sentAgain('accepted')[0]!.changedTitle).toBe('Fixed for you')
    // Not sent yet: said plainly.
    const waiting = resolutionSteps([attempt({ number: 1, failed: [failed], changed: [repair] })], 'amazon')
    expect(waiting[0]!.changedTitle).toBe('What Kuinn changed, not sent yet')
  })

  it('a text change is never "Fixed for you" in the timeline, even after an accepted send', () => {
    const steps = resolutionSteps(
      [
        attempt({ number: 1, actor: 'user', outcome: 'accepted', version: 2, at: at(2) }),
        attempt({ kind: 'precheck', number: 0, actor: 'system', outcome: 'issues', at: at(1), changed: [{ kind: 'content_fix', field: 'content.title', summary: 'Shortened the title.' }] }),
      ],
      'amazon',
    )
    expect(steps[0]!.changedTitle).toBe('What Kuinn changed')
  })

  it('splits what needs the seller and the marketplace, and marks AI rewrites', () => {
    const [s] = resolutionSteps(
      [
        attempt({
          failed: [
            { field: 'attributes.fabric_type', message: 'Fabric is required.', lane: 'seller', cause: 'seller_fact' },
            { field: 'brand', message: 'Brand approval needed.', lane: 'marketplace', cause: 'marketplace' },
          ],
          changed: [{ kind: 'ai_correction', field: 'content.bullets[2]', summary: 'Rewrote bullet 3.' }],
        }),
      ],
      'amazon',
    )
    expect(s!.needsYou.map((f) => f.field)).toEqual(['Fabric type'])
    expect(s!.needsMarketplace).toHaveLength(1)
    expect(s!.changed[0]!.field).toBe('Bullet 3')
    expect(s!.changed[0]!.rewritten).toBe(true)
  })

  it('passes long field names and Hindi messages through unchanged', () => {
    const long = `attributes.${'very_long_attribute_name_'.repeat(6)}x`
    const hindi = 'शीर्षक बहुत लंबा है। अधिकतम 200 अक्षर।'
    const [s] = resolutionSteps([attempt({ failed: [{ field: long, message: hindi, lane: 'staff', cause: 'unknown' }] })], 'amazon')
    expect(s!.said[0]!.text).toBe(hindi)
    expect(s!.said[0]!.fieldPath).toBe(long)
  })

  it('an unknown outcome is said as unknown, never as a pass', () => {
    const [s] = resolutionSteps([attempt({ outcome: 'brand_new' as Attempt['outcome'] })], 'amazon')
    expect(s!.outcome.label).toBe('Unknown')
  })
})

describe('resolutionAction and helpers', () => {
  it('maps the next step to one action', () => {
    expect(resolutionAction(resolution({ next_step: { kind: 'approve', task_ids: [], text: '' } }))).toEqual({ kind: 'approve' })
    expect(resolutionAction(resolution({ next_step: { kind: 'answer', task_ids: ['t1'], text: '' } }))).toEqual({ kind: 'answer', taskId: 't1' })
    expect(resolutionAction(resolution({ next_step: { kind: 'marketplace', task_ids: ['t2'], text: '' } }))).toEqual({ kind: 'marketplace', taskId: 't2' })
    expect(resolutionAction(resolution({ next_step: { kind: 'resume', task_ids: [], text: '' } }))).toEqual({ kind: 'change' })
    expect(resolutionAction(resolution({ next_step: { kind: 'regenerate', task_ids: [], text: '' } }))).toEqual({ kind: 'regenerate' })
    expect(resolutionAction(resolution({ next_step: { kind: 'wait', task_ids: [], text: '' } }))).toEqual({ kind: 'none' })
  })

  it('hasResolution hides an idle listing Kuinn never worked on', () => {
    expect(hasResolution(resolution())).toBe(false)
    expect(hasResolution(resolution({ attempts: [attempt()] }))).toBe(true)
    expect(hasResolution(resolution({ state: 'checking' }))).toBe(true)
    expect(hasResolution(null)).toBe(false)
  })

  it('wasSent counts submissions, not pre-checks', () => {
    expect(wasSent(resolution({ attempts: [attempt({ kind: 'precheck', number: 0 })] }))).toBe(false)
    expect(wasSent(resolution({ attempts: [attempt()] }))).toBe(true)
  })

  it('resendAccepted reads the newest attempt only', () => {
    expect(resendAccepted([attempt({ actor: 'system', outcome: 'live' })])).toBe(true)
    expect(resendAccepted([attempt({ actor: 'system', outcome: 'rejected' }), attempt({ actor: 'system', outcome: 'accepted' })])).toBe(false)
  })

  it('resolutionView puts it together', () => {
    const v = resolutionView(resolution({ state: 'fix_ready', cycles_used: 2, next_step: { kind: 'approve', task_ids: [], text: 'Kuinn prepared a fix.' } }), ctx)
    expect(v.triesText).toBe('2 of 3 automatic tries')
    expect(v.action.kind).toBe('approve')
    expect(v.nextText).toBe('Kuinn prepared a fix.')
  })
})

describe('QA 2026-11-09: truthful resolution copy', () => {
  it('an inactive listing is on the marketplace, not "waiting to confirm"', () => {
    const h = headline({ state: 'live' }, { marketplace: 'amazon', marketplaceState: 'inactive' })
    expect(h.title).toBe('On Amazon, not buyable yet')
    expect(h.line).not.toContain('Waiting')
  })
  it('a reviewer is not told the answer is theirs to give', () => {
    expect(resolutionHeadline(resolution({ state: 'needs_you' }), { marketplace: 'amazon', canAnswer: false }).line).toContain('operator or owner')
  })
  it('a seller answer is "What changed", and an answered question is no longer "What needs you"', () => {
    const r = resolution({
      state: 'idle',
      next_step: { kind: 'none', task_ids: [], text: '' },
      attempts: [
        attempt({
          failed: [{ field: 'attributes.color', message: 'Colour not allowed.', lane: 'seller', cause: 'seller_fact' }],
          changed: [{ kind: 'seller_answer', field: 'attributes.color', summary: 'The seller answered this question.' }],
        }),
      ],
    })
    const v = resolutionView(r, { marketplace: 'amazon' })
    expect(v.steps[0]!.changedTitle).toBe('What changed, not sent yet')
    expect(v.steps[0]!.needsYou).toEqual([])
  })
})
