import { describe, expect, it } from 'vitest'
import { fix, history, issue } from '@/test/issue-history-fixtures'
import { fixKindLabel, fixOutcome, GROUP_LABEL, hasIssueHistory, issueHistoryView, summaryLine } from './issue-history-model'

describe('issueHistoryView', () => {
  it('groups open issues by who handles them', () => {
    const v = issueHistoryView(
      history({
        issues: [
          issue({ id: 'a', handler: 'you', field: 'attributes.fabric_type' }),
          issue({ id: 'b', handler: 'marketplace', group: 'account_permission' }),
          issue({ id: 'c', handler: 'kuinn', lane: 'auto_repair' }),
          issue({ id: 'd', handler: 'staff', group: 'unknown' }),
          issue({ id: 'e', handler: 'you', status: 'resolved' }),
        ],
      }),
      'amazon',
    )
    expect(v.needsYou.map((i) => i.id)).toEqual(['a'])
    expect(v.marketplace.map((i) => i.id)).toEqual(['b'])
    expect(v.marketplace[0]!.group).toBe('Account approval')
    expect(v.fixing.map((i) => i.id)).toEqual(['c'])
    expect(v.team.map((i) => i.id)).toEqual(['d'])
    expect(v.needsYou[0]!.field).toBe('Fabric type')
    expect(v.empty).toBe(false)
  })

  it('a fix carries before, after, reason, outcome and its issue; its open issue is not listed twice', () => {
    const v = issueHistoryView(
      history({
        issues: [issue({ id: 'i1', handler: 'kuinn', lane: 'auto_repair', marketplace_code: '90244' })],
        fixes: [fix({ id: 'f1', issue_id: 'i1', before: 'navy blue', after: 'Navy Blue', outcome: 'accepted' })],
      }),
      'amazon',
    )
    expect(v.fixing).toEqual([])
    const [f] = v.fixed
    expect(f).toMatchObject({ before: 'navy blue', after: 'Navy Blue', outcome: { label: 'Amazon accepted it', tone: 'ok' } })
    expect(f!.issue?.code).toBe('90244')
  })

  it('steps run oldest first with their issues and fixes', () => {
    const v = issueHistoryView(
      history({
        issues: [issue({ id: 'i1' })],
        fixes: [fix({ id: 'f1' })],
        attempts: [
          { kind: 'submission', number: 2, version: 1, at: '2026-11-11T10:05:00Z', actor: 'system', outcome: 'accepted', issue_ids: [], fix_ids: [] },
          { kind: 'submission', number: 1, version: 1, at: '2026-11-11T10:00:00Z', actor: 'user', outcome: 'rejected', issue_ids: ['i1', 'gone'], fix_ids: ['f1'] },
        ],
      }),
      'flipkart',
    )
    expect(v.steps.map((s) => s.title)).toEqual(['Sent 1', 'Sent 2 by Kuinn'])
    expect(v.steps[0]!.issues.map((i) => i.id)).toEqual(['i1'])
    expect(v.steps[0]!.fixes.map((f) => f.id)).toEqual(['f1'])
    expect(v.steps[0]!.outcome).toEqual({ label: 'Refused', tone: 'bad' })
  })

  it('an empty read is empty and says so calmly', () => {
    const v = issueHistoryView(history(), 'amazon')
    expect(v.empty).toBe(true)
    expect(v.summary).toBe('No open issues from Amazon.')
    expect(hasIssueHistory(history())).toBe(false)
    expect(hasIssueHistory(null)).toBe(false)
    expect(hasIssueHistory(history({ fixes: [fix()] }))).toBe(true)
  })
})

describe('words', () => {
  it('summary names each group once, in plain words', () => {
    const one = { id: 'x' } as never
    expect(summaryLine({ fixed: [one, one], fixing: [], needsYou: [one], marketplace: [one], team: [] }, 'amazon')).toBe(
      "1 needs you · 1 on Amazon's side · 2 fixes by Kuinn.",
    )
    expect(summaryLine({ fixed: [one], fixing: [one], needsYou: [one, one], marketplace: [], team: [one] }, 'flipkart')).toBe(
      "2 need you · 1 Kuinn is fixing · 1 with Kuinn's team · 1 fix by Kuinn.",
    )
  })

  it('outcomes never claim more than the marketplace said', () => {
    expect(fixOutcome('waiting', 'amazon').label).toBe('Not sent yet')
    expect(fixOutcome('sent', 'amazon').label).toBe('Sent, waiting for Amazon')
    expect(fixOutcome('refused', 'flipkart')).toEqual({ label: 'Flipkart refused it again', tone: 'bad' })
    expect(fixOutcome('replaced', 'amazon').tone).toBe('todo')
    expect(fixOutcome('new_thing', 'amazon')).toEqual({ label: 'Unknown', tone: 'todo' })
  })

  it('every group and kind has a label', () => {
    expect(Object.keys(GROUP_LABEL)).toHaveLength(8)
    expect(fixKindLabel('repair')).toBe('Value format')
    expect(fixKindLabel('content_fix')).toBe('Text fix')
    expect(fixKindLabel('ai_correction')).toBe('Rewritten by the agent')
  })
})
