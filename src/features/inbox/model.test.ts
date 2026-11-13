import { describe, expect, it } from 'vitest'
import openapi from '@/api/openapi.json'
import { ApiError, type ApiErrorType } from '@/api/errors'
import { OP_ACTION, allows } from '@/lib/permissions'
import {
  badgeLabel,
  inboxCaption,
  inboxCounts,
  canDismiss,
  dismissFailure,
  countLabel,
  ERROR_CODES,
  hasIssueFilters,
  issuesFiltersFrom,
  humanizeCode,
  inboxSearchSchema,
  ISSUE_STATUSES,
  issueHeadline,
  issuesMeta,
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
  const page = (n: number, has_more: boolean) => ({
    data: Array.from({ length: n }, (_, i) => ({ id: `x${i}`, human_task_id: null })),
    page: { next_cursor: has_more ? 'c' : null, has_more, limit: 50 },
  })
  it('countLabel', () => {
    expect(countLabel(0, false)).toBe('0')
    expect(countLabel(50, true)).toBe('50+')
  })
  it('badgeLabel', () => {
    expect(badgeLabel(undefined, undefined)).toBeNull()
    expect(badgeLabel(page(0, false), page(0, false))).toBeNull()
    expect(badgeLabel(page(3, false), undefined)).toBe('3')
    expect(badgeLabel(page(3, false), page(2, false))).toBe('5')
    expect(badgeLabel(page(50, true), page(0, false))).toBe('50+')
    expect(badgeLabel(page(50, true), page(50, true))).toBe('99+')
    // An issue linked to an open question counts once.
    const tasks = { data: [{ id: 't1' }], page: { has_more: false } }
    const issues = { data: [{ human_task_id: 't1' }, { human_task_id: 'gone' }, { human_task_id: null }], page: { has_more: false } }
    expect(badgeLabel(issues as never, tasks as never)).toBe('3')
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
    expect(c.open).toEqual({ n: 21, more: false })
    expect(c.questions).toEqual({ n: 19, more: false })
    expect(c.issues).toEqual({ n: 24, more: false })
    expect(inboxCaption(c)).toBe('21 open items: 19 questions, 2 issues without a question')
    expect(badgeLabel({ data: issues, page: { has_more: false } } as never, { data: tasks, page: { has_more: false } } as never)).toBe('21')
  })
  it('past one page, the backend exact counts replace "50+" for the badge and every tab', () => {
    const exact = { open_items: 130, questions: 70, blocking_questions: 40, issues: 90, issues_without_question: 60 }
    const c = inboxCounts(tasks, true, issues, false, exact)
    expect(c).toEqual({ open: { n: 130, more: false }, questions: { n: 70, more: false }, issues: { n: 90, more: false }, alone: { n: 60, more: false } })
    expect(badgeLabel({ data: issues, page: { has_more: false } } as never, { data: tasks, page: { has_more: true } } as never, exact)).toBe('99+')
    // without the exact counts yet: the loaded rows with "+"
    expect(inboxCounts(tasks, true, issues, false).open).toEqual({ n: 21, more: true })
  })
  it('the caption names each part in the singular and hides at zero', () => {
    expect(inboxCaption(inboxCounts([{ id: 'a' }], false, [{ human_task_id: 'a' }], false))).toBe('1 open item: 1 question')
    expect(inboxCaption(inboxCounts([], false, [{ human_task_id: null }], false))).toBe('1 open item: 1 issue without a question')
    expect(inboxCaption(inboxCounts([], false, [], false))).toBeNull()
  })
})

describe('Inbox counts with more questions to read (B16 review)', () => {
  it('the issues without a question are uncertain while the questions have more pages', () => {
    const tasks = Array.from({ length: 50 }, (_, i) => ({ id: `t${i}` }))
    const issues = Array.from({ length: 10 }, (_, i) => ({ human_task_id: `later${i}` }))
    const c = inboxCounts(tasks, true, issues, false)
    expect(c.alone).toEqual({ n: 10, more: true })
    expect(inboxCaption(c)).toBe('60+ open items: 50+ questions, 10+ issues without a question')
  })
})
