import { describe, expect, it } from 'vitest'
import openapi from '@/api/openapi.json'
import { ApiError, type ApiErrorType } from '@/api/errors'
import { OP_ACTION, allows } from '@/lib/permissions'
import {
  badgeFromCounts,
  inboxCaption,
  inboxCounts,
  canDismiss,
  dismissFailure,
  ERROR_CODES,
  hasIssueFilters,
  issuesFiltersFrom,
  humanizeCode,
  inboxSearchSchema,
  ISSUE_STATUSES,
  issueHeadline,
  issuesMeta,
  listsNewerThanSummary,
  MARKETPLACES,
  RESOLUTION_LABEL,
  severitySplit,
  SOURCES,
  suggestionTexts,
  TASK_KIND_LABEL,
  TASK_STATUSES,
} from './model'

type Param = { name: string; in: string; schema?: { enum?: string[]; anyOf?: { enum?: string[] }[] } }
type Doc = {
  paths: Record<string, Record<string, { parameters?: Param[] }>>
  components: { schemas: Record<string, { enum?: string[]; properties?: Record<string, { enum?: string[]; anyOf?: { enum?: string[] }[] }> }> }
}
const doc = openapi as unknown as Doc
const schemas = doc.components.schemas
const queryEnum = (path: string, name: string) => {
  const p = doc.paths[`/api/v1${path}`]?.get?.parameters?.find((x) => x.in === 'query' && x.name === name)
  return p?.schema?.enum ?? p?.schema?.anyOf?.find((a) => a.enum)?.enum
}
const propEnum = (model: string, prop: string) => {
  const p = schemas[model]?.properties?.[prop]
  return p?.enum ?? p?.anyOf?.find((a) => a.enum)?.enum
}
const sorted = (xs: readonly string[] | undefined) => [...(xs ?? [])].sort()

describe('enums match the contract', () => {
  it('issue and task statuses (GET /issues, GET /tasks status query)', () => {
    expect(sorted(ISSUE_STATUSES)).toEqual(sorted(queryEnum('/issues', 'status')))
    expect(sorted(TASK_STATUSES)).toEqual(sorted(queryEnum('/tasks', 'status')))
  })
  it('sources, marketplaces, error codes', () => {
    expect(sorted(SOURCES)).toEqual(sorted(schemas.ErrorSource?.enum))
    expect(sorted(MARKETPLACES)).toEqual(sorted(schemas.Marketplace?.enum))
    expect(sorted(ERROR_CODES)).toEqual(sorted(schemas.ErrorCode?.enum))
  })
  it('task kinds and issue resolutions have labels', () => {
    expect(sorted(Object.keys(TASK_KIND_LABEL))).toEqual(sorted(propEnum('TaskOut', 'kind')))
    expect(sorted(Object.keys(RESOLUTION_LABEL))).toEqual(sorted(propEnum('IssueOut', 'resolution')))
  })
})

describe('inboxSearchSchema', () => {
  it('keeps valid params and drops invalid ones', () => {
    const id = '0b6b2a8c-7a3e-4a43-9a5e-1c2d3e4f5a6b'
    expect(
      inboxSearchSchema.parse({ tab: 'tasks', status: 'dismissed', source: 'rules_engine', code: 'BANNED_TERM', listing: id }),
    ).toEqual({ tab: 'tasks', status: 'dismissed', source: 'rules_engine', code: 'BANNED_TERM', listing: id })
    expect(
      inboxSearchSchema.parse({ tab: 'x', status: 'closed', source: 'nope', marketplace: 'ebay', code: 'NOPE', listing: '12', tasks: 'done' }),
    ).toEqual({})
  })
  it('hasIssueFilters ignores status and tab', () => {
    expect(hasIssueFilters({ status: 'resolved', tab: 'tasks' })).toBe(false)
    expect(hasIssueFilters({ marketplace: 'amazon' })).toBe(true)
  })
})

describe('counts from loaded data', () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `x${i}`, human_task_id: null }))
  it('badgeFromCounts: the All count, "99+" past 99, hidden at zero or unknown', () => {
    expect(badgeFromCounts(null)).toBeNull()
    expect(badgeFromCounts(inboxCounts([], false, [], false))).toBeNull()
    expect(badgeFromCounts(inboxCounts([], false, rows(3), false))).toBe('3')
    expect(badgeFromCounts(inboxCounts(rows(2), false, rows(3), false))).toBe('5')
    expect(badgeFromCounts(inboxCounts(rows(50), false, rows(49), false))).toBe('99')
    expect(badgeFromCounts(inboxCounts(rows(50), false, rows(50), false))).toBe('99+')
    // An issue linked to an open question counts once.
    expect(badgeFromCounts(inboxCounts([{ id: 't1' }], false, [{ human_task_id: 't1' }, { human_task_id: 'gone' }, { human_task_id: null }], false))).toBe('3')
  })
  it('listsNewerThanSummary: both lists complete and one read after the summary', () => {
    const r = (complete: boolean, at: number) => ({ complete, at })
    expect(listsNewerThanSummary(0, r(true, 5), r(true, 5))).toBe(true) // no summary yet
    expect(listsNewerThanSummary(10, r(true, 20), r(true, 5))).toBe(true) // a task closed
    expect(listsNewerThanSummary(10, r(true, 5), r(true, 20))).toBe(true) // an issue dismissed
    expect(listsNewerThanSummary(10, r(true, 5), r(true, 10))).toBe(false) // the summary is newest
    expect(listsNewerThanSummary(10, r(false, 20), r(true, 20))).toBe(false) // more pages: never
    expect(listsNewerThanSummary(10, r(true, 20), r(false, 20))).toBe(false)
  })
  it('severitySplit and issuesMeta', () => {
    const s = severitySplit([{ severity: 'error' }, { severity: 'warning' }, { severity: 'warning' }])
    expect(s).toEqual({ errors: 1, warnings: 2 })
    expect(issuesMeta(s, false)).toBe('1 error · 2 warnings loaded')
    expect(issuesMeta({ errors: 0, warnings: 1 }, true)).toBe('1 warning loaded, more below')
    expect(issuesMeta({ errors: 0, warnings: 0 }, false)).toBe('')
  })
})

describe('dismiss gating (services/issues.py dismiss_issue)', () => {
  it('only an open warning, only with listing:approve', () => {
    expect(canDismiss({ status: 'open', severity: 'warning' }, true)).toBe(true)
    expect(canDismiss({ status: 'open', severity: 'error' }, true)).toBe(false)
    expect(canDismiss({ status: 'dismissed', severity: 'warning' }, true)).toBe(false)
    expect(canDismiss({ status: 'open', severity: 'warning' }, false)).toBe(false)
  })
  it('roles: owner and reviewer may dismiss, operator and admin may not', () => {
    const a = OP_ACTION['POST /issues/{issue_id}/dismiss']
    expect(a).toBe('listing:approve')
    expect(allows('owner', a)).toBe(true)
    expect(allows('reviewer', a)).toBe(true)
    expect(allows('operator', a)).toBe(false)
    expect(allows('admin', a)).toBe(false)
  })
  it('failure copy branches on type/status', () => {
    const err = (status: number, code: ApiErrorType) =>
      new ApiError({ status, type: code, message: 'x', details: [], errorReport: null, correlationId: 'req-1', retryAfter: null })
    expect(dismissFailure(err(409, 'INVALID_STATUS_TRANSITION')).kind).toBe('info')
    expect(dismissFailure(err(404, 'NOT_FOUND')).kind).toBe('info')
    expect(dismissFailure(err(409, 'IDEMPOTENCY_KEY_REUSED')).kind).toBe('error')
    expect(dismissFailure(err(500, 'INTERNAL_ERROR')).kind).toBe('error')
  })
})

describe('formatters', () => {
  it('humanizeCode', () => {
    expect(humanizeCode('BANNED_TERM')).toBe('Banned term')
    expect(humanizeCode('PRICE_ABOVE_MRP')).toBe('Price above MRP')
    expect(humanizeCode('user_action')).toBe('User action')
    expect(humanizeCode('')).toBe('')
  })
  it('issueHeadline prefers the plain message', () => {
    expect(issueHeadline({ message: 'tech', plain_message: 'Plain' })).toBe('Plain')
    expect(issueHeadline({ message: 'tech', plain_message: '  ' })).toBe('tech')
    expect(issueHeadline({ message: 'tech', plain_message: null })).toBe('tech')
  })
  it('suggestionTexts keeps scalars and labelled objects only', () => {
    expect(suggestionTexts(['Cotton', ' ', 3, true, { label: 'Linen' }, { x: 1 }, null])).toEqual(['Cotton', '3', 'true', 'Linen'])
    expect(suggestionTexts(['a', 'b', 'c', 'd', 'e'])).toHaveLength(4)
  })
})

describe('issuesFiltersFrom', () => {
  it('maps URL params onto the GET /issues filters', () => {
    expect(issuesFiltersFrom({ status: 'resolved', code: 'BANNED_TERM', listing: 'l', source: 'schema', marketplace: 'amazon', tab: 'tasks' })).toEqual({
      status: 'resolved',
      errorCode: 'BANNED_TERM',
      listingId: 'l',
      source: 'schema',
      marketplace: 'amazon',
    })
  })
})

describe('Inbox counts (client pass 2, B16)', () => {
  const tasks = Array.from({ length: 19 }, (_, i) => ({ id: `t${i}` }))
  // 22 issues a listed question stands for (19, then 3 more on the same questions), 2 on their own: Issues 24, All 21
  const issues = [...tasks.slice(0, 22).map((t) => ({ human_task_id: t.id })), ...tasks.slice(0, 3).map((t) => ({ human_task_id: t.id })), { human_task_id: null }, { human_task_id: 'gone' }]
  it('All is questions plus the issues no question stands for; Issues lists every issue', () => {
    const c = inboxCounts(tasks, false, issues, false)
    expect(c?.open).toEqual({ n: 21, more: false })
    expect(c?.questions).toEqual({ n: 19, more: false })
    expect(c?.issues).toEqual({ n: 24, more: false })
    expect(inboxCaption(c)).toBe('21 open items: 19 questions, 2 issues without a question')
    expect(badgeFromCounts(c)).toBe('21')
  })
  it('the caption names each part in the singular and hides at zero', () => {
    expect(inboxCaption(inboxCounts([{ id: 'a' }], false, [{ human_task_id: 'a' }], false))).toBe('1 open item: 1 question')
    expect(inboxCaption(inboxCounts([], false, [{ human_task_id: null }], false))).toBe('1 open item: 1 issue without a question')
    expect(inboxCaption(inboxCounts([], false, [], false))).toBeNull()
    expect(inboxCaption(null)).toBeNull()
  })
})

describe('Inbox counts above one page (B28)', () => {
  // Prod 15 Nov, after a bulk draft of 34 products: the Inbox said 312 while the badge said "50+",
  // then "74+", read from the first pages of 50 while the summary had not answered.
  const exact = { open_items: 312, questions: 130, blocking_questions: 90, issues: 230, issues_without_question: 182 }
  const tasks = Array.from({ length: 50 }, (_, i) => ({ id: `t${i}` }))
  const issues = [...tasks.slice(0, 26).map((t) => ({ human_task_id: t.id })), ...Array.from({ length: 24 }, () => ({ human_task_id: null }))]

  it('the backend counts are the numbers, whatever the loaded pages hold', () => {
    const c = inboxCounts(tasks, true, issues, true, exact)
    expect(c).toEqual({ open: { n: 312, more: false }, questions: { n: 130, more: false }, issues: { n: 230, more: false }, alone: { n: 182, more: false } })
    expect(inboxCaption(c)).toBe('312 open items: 130 questions, 182 issues without a question')
    // complete lists that lag the summary still show the summary's numbers
    expect(inboxCounts(tasks.slice(0, 3), false, [], false, exact)?.open.n).toBe(312)
  })

  it('a partial page is never a count: no "50+" or "74+" while the summary is loading', () => {
    expect(inboxCounts(tasks, true, issues, true)).toBeNull()
    expect(inboxCounts(tasks, true, issues, false)).toBeNull()
    expect(inboxCounts(tasks.slice(0, 5), false, issues, true)).toBeNull()
    expect(inboxCounts(null, false, issues, false)).toBeNull()
    expect(badgeFromCounts(inboxCounts(tasks, true, issues, true))).toBeNull()
  })

  it('the badge and the Inbox header read the same count, capped once at "99+"', () => {
    // the badge passes no rows (it reads the summary only), the Inbox page passes its pages
    const badge = inboxCounts(null, false, null, false, exact)
    const header = inboxCounts(tasks, true, issues, true, exact)
    expect(badge).toEqual(header)
    expect(badgeFromCounts(badge)).toBe('99+')
    expect(badgeFromCounts(inboxCounts(null, false, null, false, { ...exact, open_items: 99 }))).toBe('99')
    expect(badgeFromCounts(inboxCounts(null, false, null, false, { ...exact, open_items: 0 }))).toBeNull()
  })
})
