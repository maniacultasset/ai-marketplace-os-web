/**
 * Inbox: pure model (labels, URL search, counts, gating). No React, no network: unit tested.
 * Contract: GET /issues (IssueOut), POST /issues/{issue_id}/dismiss, GET /tasks (TaskOut).
 * Backend: apps/api/app/api/v1/routers/{issues,tasks}.py, schemas/{issues,tasks}.py, services/issues.py.
 */
import { z } from 'zod'
import { isApiError, isNotFound } from '@/api/errors'
import type { ErrorCode, Page, Schema } from '@/api/types'
import type { IssuesFilters, IssueStatus, Marketplace, TaskStatus } from '@/lib/query-keys'

export type Issue = Schema<'IssueOut'>
export type Task = Schema<'TaskOut'>
export type ErrorSource = Schema<'ErrorSource'>
export type Severity = Schema<'Severity'>
export type TaskKind = Task['kind']
export type IssueResolution = NonNullable<Issue['resolution']>

// ---- enums (runtime lists, unit-tested equal to the contract) ----

export const ISSUE_STATUSES = ['open', 'auto_fixed', 'resolved', 'dismissed'] as const satisfies readonly IssueStatus[]
export const TASK_STATUSES = ['open', 'answered', 'applied', 'cancelled'] as const satisfies readonly TaskStatus[]
export const MARKETPLACES = ['amazon', 'flipkart'] as const satisfies readonly Marketplace[]

export const ISSUE_STATUS_LABEL: Record<IssueStatus, string> = {
  open: 'Open',
  auto_fixed: 'Auto-fixed',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
}

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  open: 'Open',
  answered: 'Answered',
  applied: 'Applied',
  cancelled: 'Cancelled',
}

export const SOURCE_LABEL: Record<ErrorSource, string> = {
  schema: 'Schema check',
  rules_engine: 'Rules engine',
  vision_model: 'Image check',
  ai_model: 'AI model',
  amazon_adapter: 'Amazon',
  flipkart_adapter: 'Flipkart',
  system: 'System',
}
export const SOURCES = [
  'schema',
  'rules_engine',
  'vision_model',
  'ai_model',
  'amazon_adapter',
  'flipkart_adapter',
  'system',
] as const satisfies readonly ErrorSource[]

export const MARKETPLACE_LABEL: Record<Marketplace, string> = { amazon: 'Amazon', flipkart: 'Flipkart' }

export const TASK_KIND_LABEL: Record<TaskKind, string> = {
  missing_fact: 'Missing fact',
  conflicting_facts: 'Conflicting facts',
  unverified_declaration: 'Unverified declaration',
  approval_or_evidence: 'Approval or evidence',
  permission_decision: 'Permission decision',
  reconnect_account: 'Reconnect account',
  image_replacement: 'Image replacement',
  marketplace_error_review: 'Marketplace error review',
}

export const RESOLUTION_LABEL: Record<IssueResolution, string> = {
  deterministic_fix: 'Fixed automatically',
  ai_correction: 'Corrected by AI',
  human_answer: 'Answered by a person',
  human_edit: 'Fixed by an edit',
  regenerated: 'Cleared by regeneration',
  revalidated_clean: 'Passed a re-check',
  marketplace_cleared: 'Cleared by the marketplace',
  accepted_warning: 'Warning accepted',
}

export const RESUME_LABEL: Record<Task['resume_from'], string> = {
  generate: 'generation',
  validate: 'validation',
  publish: 'publishing',
}

/** Every ErrorCode in the contract (unit-tested equal to openapi.json), for URL validation. */
export const ERROR_CODES = [
  'ACCOUNT_PERMISSION_DENIED', 'API_REJECTED_PARTIAL', 'AUTH_EXPIRED', 'BANNED_TERM', 'BATCH_TOO_LARGE',
  'BUDGET_EXCEEDED', 'BULK_APPROVE_REQUIRES_VALIDATED', 'BYTE_BUDGET_EXCEEDED', 'CATEGORY_MISMATCH',
  'CATEGORY_NOT_MAPPED', 'COMPLIANCE_DECLARATION_MISSING', 'CRITICAL_FACT_MISSING', 'CROSS_FIELD_MISMATCH',
  'DUPLICATE_SKU_IN_FILE', 'DUPLICATE_SUBMISSION_BLOCKED', 'FACTS_CHANGED_SINCE_APPROVAL', 'FACT_LEVEL_INVALID',
  'FACT_MISMATCH', 'FACT_NEEDS_CONFIRMATION', 'FACT_SOURCE_FORBIDDEN', 'FIELD_TOO_LONG', 'FIELD_TOO_SHORT',
  'GENERATION_FAILED', 'HEADER_DUPLICATE_COLUMN', 'HEADER_MISSING_COLUMN', 'HEADER_UNKNOWN_COLUMN',
  'IDENTIFIER_DUPLICATE', 'IDENTIFIER_INVALID', 'IDENTIFIER_MISSING', 'IMAGE_NON_COMPLIANT', 'IMPORT_FAILED',
  'IDEMPOTENCY_KEY_REUSED', 'INTERNAL_ERROR', 'INVALID_STATUS_TRANSITION', 'JOB_TIMEOUT', 'JSON_INVALID',
  'KEYWORD_DUPLICATE', 'LAST_OWNER_REQUIRED', 'LISTING_ARCHIVED', 'LISTING_BUSY', 'LISTING_PAUSED',
  'MAKER_CHECKER_VIOLATION', 'MARKETPLACE_UNAVAILABLE', 'MARKETPLACE_UNCONFIRMED', 'MARKETPLACE_UNKNOWN_ERROR',
  'MARKETPLACE_ACCOUNT_CONFLICT', 'METHOD_NOT_ALLOWED', 'MFA_ENROLLMENT_REQUIRED', 'MFA_STEP_UP_REQUIRED', 'MISSING_ATTRIBUTE', 'MODEL_UNAVAILABLE', 'NOT_FOUND',
  'NOT_IMPLEMENTED', 'OAUTH_STATE_INVALID', 'PAYLOAD_TOO_LARGE', 'PERMISSION_DENIED', 'PATTERN_MISMATCH',
  'PRICE_ABOVE_MRP', 'PUBLISH_FAILED', 'RATE_LIMITED', 'REQUIRED_FIELD_MISSING', 'RETRY_EXHAUSTED',
  'SCHEMA_INVALID', 'SELLER_SKU_CONFLICT', 'SKU_CONFLICT', 'STALE_VERSION', 'SUBMISSION_ATTEMPTS_EXHAUSTED',
  'SUBMISSION_IN_FLIGHT', 'SUBMISSION_NOT_APPLIED', 'TIMEOUT', 'TOKEN_LIMIT', 'UNAUTHENTICATED',
  'UNKNOWN_FACT_KEY', 'UNSUPPORTED_CLAIM', 'VALIDATION_FAILED', 'VALUE_NOT_ALLOWED',
  'VARIANT_MATRIX_INCOMPLETE', 'VARIATION_INVALID',
] as const satisfies readonly ErrorCode[]

/** `BANNED_TERM` → "Banned term"; `PRICE_ABOVE_MRP` → "Price above MRP". */
export function humanizeCode(code: string): string {
  const ACRONYM: Record<string, string> = { mrp: 'MRP', sku: 'SKU', api: 'API', ai: 'AI', json: 'JSON', oauth: 'OAuth' }
  const words = code.toLowerCase().split('_').filter(Boolean)
  if (words.length === 0) return code
  return words
    .map((w, i) => ACRONYM[w] ?? (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ')
}

// ---- URL search (route `validateSearch`) ----

export const INBOX_TABS = ['issues', 'tasks'] as const
export type InboxTab = (typeof INBOX_TABS)[number]

export const inboxSearchSchema = z.object({
  /** Which column shows below lg (both show at lg). */
  tab: z.enum(INBOX_TABS).optional().catch(undefined),
  status: z.enum(ISSUE_STATUSES).optional().catch(undefined),
  source: z.enum(SOURCES).optional().catch(undefined),
  marketplace: z.enum(MARKETPLACES).optional().catch(undefined),
  code: z.enum(ERROR_CODES).optional().catch(undefined),
  listing: z.uuid().optional().catch(undefined),
  tasks: z.enum(TASK_STATUSES).optional().catch(undefined),
})
export type InboxSearch = z.infer<typeof inboxSearchSchema>

/** URL search → the GET /issues filters (and the issues.list query key). */
export function issuesFiltersFrom(s: InboxSearch): IssuesFilters {
  return { status: s.status, source: s.source, marketplace: s.marketplace, errorCode: s.code, listingId: s.listing }
}

/** Whether any issue filter beyond the status is applied. */
export function hasIssueFilters(s: InboxSearch): boolean {
  return !!(s.source || s.marketplace || s.code || s.listing)
}

// ---- counts (from loaded data only; never a fabricated total) ----

/** "12", or "50+" when the server says more rows exist beyond what is loaded. */
export function countLabel(loaded: number, hasMore: boolean): string {
  return hasMore ? `${loaded}+` : String(loaded)
}

/** Sidebar badge from the first page of open issues and open tasks. Null hides the badge. */
export function badgeLabel(
  issues: Pick<Page<unknown>, 'data' | 'page'> | undefined,
  tasks: Pick<Page<unknown>, 'data' | 'page'> | undefined,
): string | null {
  if (!issues && !tasks) return null
  const n = (issues?.data.length ?? 0) + (tasks?.data.length ?? 0)
  const more = !!issues?.page.has_more || !!tasks?.page.has_more
  if (n === 0 && !more) return null
  if (n > 99) return '99+'
  return countLabel(n, more)
}

export interface SeveritySplit {
  errors: number
  warnings: number
}

export function severitySplit(issues: readonly Pick<Issue, 'severity'>[]): SeveritySplit {
  let errors = 0
  let warnings = 0
  for (const i of issues) {
    if (i.severity === 'error') errors++
    else warnings++
  }
  return { errors, warnings }
}

/** Muted meta line for the issues toolbar, e.g. "3 errors · 9 warnings loaded". */
export function issuesMeta(split: SeveritySplit, hasMore: boolean): string {
  const parts: string[] = []
  if (split.errors) parts.push(`${split.errors} ${split.errors === 1 ? 'error' : 'errors'}`)
  if (split.warnings) parts.push(`${split.warnings} ${split.warnings === 1 ? 'warning' : 'warnings'}`)
  if (parts.length === 0) return ''
  return `${parts.join(' · ')} ${hasMore ? 'loaded, more below' : 'loaded'}`
}

// ---- actions ----

/**
 * Dismiss is shown only for an open warning (services/issues.py: anything else is
 * 409 INVALID_STATUS_TRANSITION) and only when the role holds listing:approve.
 */
export function canDismiss(issue: Pick<Issue, 'status' | 'severity'>, roleAllows: boolean): boolean {
  return roleAllows && issue.status === 'open' && issue.severity === 'warning'
}

/** The sentence to lead with: the plain-language version when the backend has one. */
export function issueHeadline(issue: Pick<Issue, 'message' | 'plain_message'>): string {
  return issue.plain_message?.trim() || issue.message
}

/** TaskOut.suggestions is `list[Any]`: show scalars as text, skip objects we cannot render honestly. */
export function suggestionTexts(suggestions: readonly unknown[], max = 4): string[] {
  const out: string[] = []
  for (const s of suggestions) {
    if (typeof s === 'string' && s.trim()) out.push(s.trim())
    else if (typeof s === 'number' || typeof s === 'boolean') out.push(String(s))
    else if (s && typeof s === 'object' && 'label' in s && typeof s.label === 'string' && s.label.trim())
      out.push(s.label.trim())
    if (out.length >= max) break
  }
  return out
}

/** Outcome copy for a failed dismiss (pure, so the branches are unit tested). */
export function dismissFailure(err: unknown): { kind: 'info' | 'error'; title: string; description?: string } {
  if (isApiError(err) && err.type === 'INVALID_STATUS_TRANSITION')
    return { kind: 'info', title: 'This issue is already closed', description: 'The list now shows its latest state.' }
  if (isNotFound(err)) return { kind: 'info', title: 'This issue no longer exists', description: 'The list has been refreshed.' }
  return { kind: 'error', title: "Couldn't dismiss the warning" }
}

/** Short id for display next to a copy affordance: first 8 hex chars. */
export const shortId = (id: string) => id.slice(0, 8)
