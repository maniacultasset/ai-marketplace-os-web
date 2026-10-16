/**
 * Listings: contract types and the pure rules the screens follow. Every rule here mirrors the
 * backend (read-only reference under `.backend/apps/api/app/services`):
 *   - edit gate:        services/listing_edit.py `_gate`
 *   - approve / reject: services/review.py `_gate`, `REVIEWABLE`, `bulk_check`, maker_checker.py
 *   - publish:          services/publish.py, services/publish_rules.py `publish_event`
 *   - retry-fields:     services/publish.py `RETRY_FIELDS_REASONS`
 *   - refresh-status:   services/publish.py `refresh_status`
 *   - regenerate:       services/generation.py (`created` → 409, busy → 409)
 * The server still decides; these only hide or explain what it would refuse.
 */
import type { ErrorCode, Schema } from '@/api/types'
import type { Action } from '@/lib/permissions'

export type Listing = Schema<'ListingOut'>
export type ListingDetail = Schema<'ListingDetail'>
export type CanonicalListing = Schema<'CanonicalListing'>
export type ListingStatus = Schema<'ListingStatus'>
export type MarketplaceState = Schema<'MarketplaceState'>
export type ItemMarketplaceState = Schema<'ItemMarketplaceState'>
export type Marketplace = Schema<'Marketplace'>
export type AuditEvent = Schema<'AuditEventOut'>
export type Submission = Schema<'SubmissionOut'>
export type MarketplacePreview = Schema<'MarketplacePreview'>
export type ValidationSummary = Schema<'ValidationSummary'>
export type ValidationStage = Schema<'ValidationResult'>
export type BatchResult = Schema<'BatchResult'>
export type BatchAccepted = Schema<'BatchAccepted'>
export type BatchItemResult = Schema<'BatchItemResult'>
export type JobAccepted = Schema<'JobAccepted'>
export type GenerateBody = Schema<'GenerateListingRequest'>
export type ApproveItem = Schema<'ApproveItem'>
export type PublishItem = Schema<'PublishItem'>
export type ContentPatch = Schema<'ListingContentPatch'>
export type ErrorSource = Schema<'ErrorSource'>

type Tone = 'muted' | 'brand' | 'success' | 'warning' | 'danger'

export const LISTING_STATUSES: readonly ListingStatus[] = [
  'needs_review',
  'validated',
  'approved',
  'publishing',
  'published',
  'blocked',
  'failed',
  'generating',
  'created',
]

export const STATUS_META: Record<ListingStatus, { label: string; tone: Tone; hint: string }> = {
  created: { label: 'Draft', tone: 'muted', hint: 'No content yet. Generate it to start.' },
  generating: { label: 'Generating', tone: 'brand', hint: 'AI is writing this listing.' },
  validated: { label: 'Ready to approve', tone: 'brand', hint: 'Passed every check. A reviewer can approve it.' },
  needs_review: { label: 'Needs review', tone: 'warning', hint: 'Passed with warnings. Read them before approving.' },
  approved: { label: 'Approved', tone: 'success', hint: 'Approved. It can be published.' },
  publishing: { label: 'Publishing', tone: 'brand', hint: 'Being sent to the marketplace.' },
  published: { label: 'Published', tone: 'success', hint: 'Sent to the marketplace.' },
  blocked: { label: 'Blocked', tone: 'danger', hint: 'Needs attention before it can move on.' },
  failed: { label: 'Failed', tone: 'danger', hint: 'The last step failed.' },
}

/** `listings.status_reason` values the backend writes (services/*), in plain words. */
const REASON_LABEL: Record<string, string> = {
  validation_errors: 'Checks found blocking issues',
  corrections_exhausted: 'AI could not fix every issue',
  rejected: 'Rejected by a reviewer',
  generation_failed: 'Generation failed',
  publish_failed: 'Publishing failed',
  publish_partial: 'Some fields were not accepted',
  marketplace_rejected: 'The marketplace rejected it',
  marketplace_action_required: 'The marketplace needs an action',
  publish_attempts_exhausted: 'All publish attempts used',
}

export function statusReasonLabel(reason: string | null | undefined): string | null {
  if (!reason) return null
  return REASON_LABEL[reason] ?? sentence(reason)
}

export const MARKETPLACE_STATE_META: Record<MarketplaceState | ItemMarketplaceState, { label: string; tone: Tone }> = {
  not_submitted: { label: 'Not submitted', tone: 'muted' },
  processing: { label: 'Processing', tone: 'brand' },
  pending_review: { label: 'In marketplace review', tone: 'warning' },
  live: { label: 'Live', tone: 'success' },
  partially_live: { label: 'Partially live', tone: 'warning' },
  inactive: { label: 'Inactive', tone: 'muted' },
  rejected: { label: 'Rejected', tone: 'danger' },
  removed: { label: 'Removed', tone: 'muted' },
}

export const SOURCE_LABEL: Record<ErrorSource, string> = {
  schema: 'Schema',
  rules_engine: 'Rules',
  vision_model: 'Image check',
  ai_model: 'AI model',
  amazon_adapter: 'Amazon mapping',
  flipkart_adapter: 'Flipkart mapping',
  system: 'System',
}

/** `snake_case` → "Snake case". */
export function sentence(slug: string): string {
  const s = slug.replace(/[_.]+/g, ' ').trim()
  return s ? s[0]!.toUpperCase() + s.slice(1) : s
}

export const isBusy = (status: ListingStatus) => status === 'generating' || status === 'publishing'

const REVIEWABLE: ReadonlySet<ListingStatus> = new Set(['validated', 'needs_review'])
const RETRY_REASONS = new Set(['publish_failed', 'publish_partial', 'marketplace_rejected'])
const RETRY_FIELDS_REASONS = new Set(['publish_partial', 'publish_failed'])

/** publish_rules.publish_event: the event a publish request would fire, or null (409). */
export function publishEvent(
  status: ListingStatus,
  reason: string | null | undefined,
): 'publish' | 'retry_publish' | 'resume_publish' | null {
  if (status === 'approved') return 'publish'
  if (status === 'failed' && reason && RETRY_REASONS.has(reason)) return 'retry_publish'
  if (status === 'blocked' && reason === 'marketplace_action_required') return 'resume_publish'
  return null
}

/** Reject reasons (backend batches.py REASON_CODES; the contract only says "slug"). */
export const REJECT_REASONS = [
  { code: 'inaccurate_fact', label: 'Inaccurate fact' },
  { code: 'off_brand_voice', label: 'Off-brand voice' },
  { code: 'policy_violation', label: 'Policy violation' },
  { code: 'poor_quality', label: 'Poor quality' },
  { code: 'wrong_category', label: 'Wrong category' },
  { code: 'image_issue', label: 'Image issue' },
  { code: 'other', label: 'Other' },
] as const
export type RejectReason = (typeof REJECT_REASONS)[number]['code']

/* ---------------------------------------------------------------------------------------------- */
/* Maker-checker hint                                                                              */
/* ---------------------------------------------------------------------------------------------- */

export type MakerHint = 'edited' | 'regenerated' | null

/**
 * Whether the history shows that `meId` contributed to the current version chain (so the server
 * would answer MAKER_CHECKER_VIOLATION). Walks newest first and stops at the latest regeneration,
 * which starts a new chain (maker_checker.py). Only certain contributions are reported: the server
 * stays the authority (a generation by me is not in the audit log, so it can still refuse).
 */
export function makerHint(eventsNewestFirst: readonly AuditEvent[], meId: string | null | undefined): MakerHint {
  if (!meId) return null
  for (const e of eventsNewestFirst) {
    const mine = e.actor_type === 'user' && e.actor_user_id === meId
    if (e.action === 'listing.edited' && mine) return 'edited'
    const regen =
      e.action === 'listing.regenerate_requested' ||
      (e.action === 'listing.rejected' && e.after?.['status'] === 'generating')
    if (regen) return mine ? 'regenerated' : null
  }
  return null
}

/**
 * Who wrote the text of the current version. The backend copies `confidence_score` and
 * `generated_by_agent_run_id` into an edited version (listing_edit.py), so the version cannot say;
 * the history can: the newest of an edit and a (re)generation request decides. Generation itself
 * writes no audit event, and the first version is always the agent's. `unknown` while unread.
 */
export function contentAuthor(
  eventsNewestFirst: readonly AuditEvent[] | null | undefined,
  /** False while older pages are unread: no deciding event yet then means "don't know". */
  complete = true,
): 'agent' | 'team' | 'unknown' {
  if (!eventsNewestFirst) return 'unknown'
  for (const e of eventsNewestFirst) {
    if (e.action === 'listing.edited') return 'team'
    if (e.action === 'listing.regenerate_requested' || (e.action === 'listing.rejected' && e.after?.['status'] === 'generating')) return 'agent'
  }
  return complete ? 'agent' : 'unknown'
}

/* ---------------------------------------------------------------------------------------------- */
/* What the current user can do with one listing                                                   */
/* ---------------------------------------------------------------------------------------------- */

export interface ActionState {
  /** Render the control at all (role holds the action, feature built, relevant for the status). */
  show: boolean
  enabled: boolean
  /** Why it is disabled, in one sentence. */
  reason?: string
}

export interface ListingActions {
  generate: ActionState
  edit: ActionState
  validate: ActionState
  regenerate: ActionState
  approve: ActionState
  reject: ActionState
  publish: ActionState & { label: string }
  retryFields: ActionState
  refreshStatus: ActionState
}

export interface ListingActionInput {
  listing: Pick<
    Listing,
    'status' | 'status_reason' | 'current_version_id' | 'approved_version_id'
  >
  /** Latest validation of the listing (ListingDetail.validation). */
  validation?: Pick<ValidationSummary, 'passed' | 'listing_version_id'> | null
  can: (action: Action) => boolean
  maker?: MakerHint
  /** BUILT['listings.publish']. */
  publishBuilt: boolean
}

const off = (reason?: string): ActionState => ({ show: true, enabled: false, reason })
const on: ActionState = { show: true, enabled: true }
const hidden: ActionState = { show: false, enabled: false }

const BUSY_REASON: Record<'generating' | 'publishing', string> = {
  generating: 'Generation is running. Try again when it finishes.',
  publishing: 'Publishing is in progress. Try again when it finishes.',
}

export function listingActions({ listing, validation, can, maker, publishBuilt }: ListingActionInput): ListingActions {
  const { status, status_reason: reason, current_version_id: current, approved_version_id: approved } = listing
  const busy = status === 'generating' || status === 'publishing' ? BUSY_REASON[status] : null
  const hasVersion = !!current && status !== 'created'

  const generate: ActionState = can('listing:generate') && status === 'created' ? on : hidden

  const edit: ActionState = !can('listing:edit')
    ? hidden
    : busy
      ? off(busy)
      : !hasVersion
        ? off('Generate content first.')
        : on

  const validate: ActionState = !can('listing:edit')
    ? hidden
    : status === 'generating'
      ? off(BUSY_REASON.generating)
      : !current
        ? off('Generate content first.')
        : on

  const regenerate: ActionState = !can('listing:regenerate')
    ? hidden
    : busy
      ? off(busy)
      : status === 'created'
        ? off('Generate this listing first.')
        : on

  let approve: ActionState
  if (!can('listing:approve')) approve = hidden
  else if (busy) approve = off(busy)
  else if (!hasVersion) approve = off('There is no content to approve yet.')
  else if (status === 'approved' || (approved && approved === current)) approve = off('This version is already approved.')
  else if (!REVIEWABLE.has(status))
    approve = off(
      status === 'blocked'
        ? 'Blocked listings can’t be approved. Fix the issues or regenerate first.'
        : status === 'published'
          ? 'Already published. Edit or regenerate to review a new version.'
          : 'Only listings that are ready or need review can be approved.',
    )
  else if (!validation || !validation.passed || validation.listing_version_id !== current)
    approve = off(
      can('listing:edit')
        ? 'Approval needs a passing check on this version. Run checks first.'
        : 'Approval needs a passing check on this version. Ask an operator or owner to run checks.',
    )
  else if (maker)
    approve = off(
      maker === 'edited'
        ? 'You edited this version, so another reviewer must approve it.'
        : 'You asked for this version, so another reviewer must approve it.',
    )
  else approve = on

  const reject: ActionState = !can('listing:approve')
    ? hidden
    : busy
      ? off(busy)
      : !hasVersion || !REVIEWABLE.has(status)
        ? off('Only listings that are ready or need review can be rejected.')
        : on

  const event = publishEvent(status, reason)
  const publishLabel =
    event === 'retry_publish' ? 'Publish again' : event === 'resume_publish' ? 'Resume publishing' : 'Publish'
  let publish: ActionState
  if (!publishBuilt || !can('listing:publish')) publish = hidden
  else if (busy) publish = off(busy)
  else if (status === 'blocked' && reason === 'publish_attempts_exhausted')
    publish = off('All three publish attempts for this version are used. Edit or regenerate to try again.')
  else if (!event)
    publish = off(status === 'published' ? 'Already published.' : 'Approve this listing before publishing.')
  else if (!current || approved !== current)
    publish = off('The content changed after approval. Approve the current version first.')
  else publish = on

  const retryFields: ActionState =
    publishBuilt && can('listing:publish') && status === 'failed' && !!reason && RETRY_FIELDS_REASONS.has(reason)
      ? on
      : hidden

  const refreshStatus: ActionState =
    publishBuilt && can('listing:publish') && (status === 'published' || (status === 'failed' && reason === 'publish_partial'))
      ? on
      : hidden

  return {
    generate,
    edit,
    validate,
    regenerate,
    approve,
    reject,
    publish: { ...publish, label: publishLabel },
    retryFields,
    refreshStatus,
  }
}

/* ---------------------------------------------------------------------------------------------- */
/* Bulk actions on the review queue                                                                */
/* ---------------------------------------------------------------------------------------------- */

export interface Eligibility<T> {
  eligible: T[]
  skipped: { listing: T; reason: string }[]
}

type BulkRow = Pick<Listing, 'id' | 'status' | 'status_reason' | 'current_version_id' | 'approved_version_id'>

/** review.py: every item needs its current version; a multi-item approve accepts only `validated`. */
export function approveEligibility<T extends BulkRow>(rows: readonly T[]): Eligibility<T> {
  const multi = rows.length > 1
  const out: Eligibility<T> = { eligible: [], skipped: [] }
  for (const r of rows) {
    if (!r.current_version_id || r.status === 'created') out.skipped.push({ listing: r, reason: 'No content yet' })
    else if (r.approved_version_id && r.approved_version_id === r.current_version_id)
      out.skipped.push({ listing: r, reason: 'Already approved' })
    else if (!REVIEWABLE.has(r.status)) out.skipped.push({ listing: r, reason: STATUS_META[r.status].label })
    else if (multi && r.status !== 'validated')
      out.skipped.push({ listing: r, reason: 'Needs review: approve it on its own' })
    else out.eligible.push(r)
  }
  return out
}

/** publish.py: a publish event for the status, and the approved version is the current one. */
export function publishEligibility<T extends BulkRow>(rows: readonly T[]): Eligibility<T> {
  const out: Eligibility<T> = { eligible: [], skipped: [] }
  for (const r of rows) {
    if (isBusy(r.status)) out.skipped.push({ listing: r, reason: STATUS_META[r.status].label })
    else if (!publishEvent(r.status, r.status_reason)) out.skipped.push({ listing: r, reason: 'Not approved' })
    else if (!r.current_version_id || r.approved_version_id !== r.current_version_id)
      out.skipped.push({ listing: r, reason: 'Changed after approval' })
    else out.eligible.push(r)
  }
  return out
}

export const approveItems = (rows: readonly BulkRow[]): ApproveItem[] =>
  rows.map((r) => ({ listing_id: r.id, listing_version_id: r.current_version_id!, decision: 'approve', regenerate: false }))

export const publishItems = (rows: readonly BulkRow[]): PublishItem[] =>
  rows.map((r) => ({ listing_id: r.id, listing_version_id: r.current_version_id }))

/** Per-item refusal copy (review.py / publish.py `_MESSAGES`, rewritten for people). */
export const ITEM_ERROR_COPY: Partial<Record<ErrorCode, string>> = {
  MAKER_CHECKER_VIOLATION: 'You generated or edited this version, so someone else must approve it.',
  STALE_VERSION: 'The listing changed or its checks are out of date. Open it, run checks, and try again.',
  BULK_APPROVE_REQUIRES_VALIDATED: 'It needs review. Approve it on its own after reading the warnings.',
  INVALID_STATUS_TRANSITION: 'Its current status doesn’t allow this.',
  LISTING_BUSY: 'It is generating or publishing right now.',
  LISTING_PAUSED: 'The listing is paused.',
  LISTING_ARCHIVED: 'The listing is archived.',
  IMAGE_NON_COMPLIANT: 'An image blocks approval. Fix or replace it first.',
  AUTH_EXPIRED: 'Connect or reconnect the marketplace account first.',
  SUBMISSION_ATTEMPTS_EXHAUSTED: 'All publish attempts for this version are used.',
  DUPLICATE_SUBMISSION_BLOCKED: 'Nothing changed since the last attempt, so it was not sent again.',
  SUBMISSION_IN_FLIGHT: 'A submission of this listing is still open.',
  NOT_IMPLEMENTED: 'Publishing to this marketplace is not available yet.',
  NOT_FOUND: 'Not found. It may have been removed.',
  BUDGET_EXCEEDED: 'The daily generation budget is spent. Try again later.',
  PERMISSION_DENIED: 'Your role can’t do this.',
}

export interface BatchOutcome {
  ok: BatchItemResult[]
  failed: { item: BatchItemResult; code: ErrorCode | null; message: string; requestId: string | null }[]
}

export function summarizeBatch(result: Pick<BatchResult, 'items'>): BatchOutcome {
  const out: BatchOutcome = { ok: [], failed: [] }
  for (const item of result.items) {
    if (item.http_status >= 200 && item.http_status < 300 && !item.error) {
      out.ok.push(item)
      continue
    }
    const code = item.error?.error_code ?? null
    const message =
      (code && ITEM_ERROR_COPY[code]) ?? item.error?.errors?.[0]?.message ?? `Refused (HTTP ${item.http_status}).`
    out.failed.push({ item, code, message, requestId: item.error?.request_id ?? null })
  }
  return out
}

/* ---------------------------------------------------------------------------------------------- */
/* History                                                                                         */
/* ---------------------------------------------------------------------------------------------- */

const HISTORY_LABEL: Record<string, string> = {
  'listing.edited': 'Edited the content',
  'listing.approved': 'Approved',
  'listing.approve_denied': 'Approval refused (maker-checker)',
  'listing.rejected': 'Rejected',
  'listing.regenerate_requested': 'Asked for a regeneration',
  'listing.publish_requested': 'Asked to publish',
  'listing.revalidated': 'Re-ran the checks',
}

export function historyLabel(action: string): string {
  return HISTORY_LABEL[action] ?? sentence(action.replace(/^listing\./, ''))
}

/** The status an audit `before`/`after` snapshot names, when it is a known one. */
export function snapshotStatus(snap: Record<string, unknown> | null | undefined): ListingStatus | null {
  const s = snap?.['status']
  return typeof s === 'string' && s in STATUS_META ? (s as ListingStatus) : null
}

export const JOB_KIND_LABEL: Record<string, string> = {
  listing_generate: 'Generation',
  listing_publish: 'Publishing',
  listing_status_sync: 'Marketplace status check',
}

export const STAGE_LABEL: Record<string, string> = {
  load_context: 'Loading product and brand',
  retrieve_brand: 'Reading brand guidelines',
  content_agent: 'Writing content',
  keyword_agent: 'Choosing keywords',
  attribute_agent: 'Filling attributes',
  image_agent: 'Checking images',
  merge_outputs: 'Assembling the listing',
  validate_schema: 'Checking the schema',
  validate_rules: 'Running rules',
  validate_vision: 'Checking images',
  correct: 'Fixing issues',
  quality_check: 'Final quality check',
}
