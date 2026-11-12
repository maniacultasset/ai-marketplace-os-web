/**
 * Quality gates (hi-fi p13, p18): the nine gates the design names, rolled up from what the API
 * really returns. The backend has no gate concept yet (analysis plan R4, `ErrorItem.gate` is
 * missing), so this is a client-side projection with one rule: a gate says "passed" only when
 * something real checked it.
 *
 *   - A finding (validation stage report, preview mapping report) lands in one gate, by error code,
 *     then `error_class` (backend mkos_schemas/codes.py ERROR_CODE_META), then field path.
 *   - A gate is "checked" when the latest validation ran on the current version AND at least one
 *     enabled rule for this marketplace and category belongs to it (GET /rules), or the adapter
 *     preview covered it (classification: a mapped product type).
 *   - Rule types the backend does not evaluate (NOT_EVALUATED_RULE_TYPES) are never evidence.
 *   - Media is blocked when the listing has no image, and passes only on a vision check
 *     (a `vision_model` validation stage) of the current version. Rules never make it pass.
 *   - Identity: the adapter preview checks every sellable item's barcode or GTIN exemption (backend
 *     adapters/amazon/mapping.py `_identifier`; IDENTIFIER_MISSING blocks a create). It passes
 *     when every sellable item in the preview carries one, and says when that is a confirmed
 *     exemption (client Chrome pass B5: "Not checked yet. No rule covers this yet").
 *   - Submission is decided by the marketplace itself (listing status and marketplace state).
 *   - The listing's open blocking issues on its current version (GET /issues) are findings too:
 *     they are what the server's `needs_you_count` counts (the stored photo checks, the
 *     marketplace check), so the gates never say "0 need you" while the header says
 *     "Needs your info · 3" (prod demo 9 Nov).
 *   - Anything else is "Not checked yet". Never a green dot without evidence.
 *   - A missing recommended attribute (recommended.ts, client feedback item 10) never blocks: a
 *     gate with only those says "N recommended to add", and the counts keep them apart, so the
 *     summary never adds recommendations to what must be fixed.
 */
import type { Schema } from '@/api/types'
import type { Listing, ValidationSummary } from '@/features/listings/model'
import { isRecommendation } from './recommended'

export type ErrorItem = Schema<'ErrorItem'>
export type Rule = Schema<'RuleOut'>
export type ErrorCode = Schema<'ErrorCode'>

export const GATES = [
  { id: 'identity', label: 'Identity' },
  { id: 'classification', label: 'Classification' },
  { id: 'attributes', label: 'Attributes' },
  { id: 'variants', label: 'Variants' },
  { id: 'media', label: 'Media' },
  { id: 'content', label: 'Content' },
  { id: 'compliance', label: 'Compliance' },
  { id: 'commercial', label: 'Commercial' },
  { id: 'submission', label: 'Submission' },
] as const

export type GateId = (typeof GATES)[number]['id']
export type GateState = 'passed' | 'working' | 'warning' | 'blocked' | 'unchecked'

export interface GateResult {
  id: GateId
  label: string
  state: GateState
  /** Findings that put the gate in this state (empty when passed or unchecked). */
  findings: ErrorItem[]
  /** One line for the tooltip / accessible name. */
  note: string
}

const BY_CODE: Partial<Record<ErrorCode, GateId>> = {
  PRICE_ABOVE_MRP: 'commercial',
  CATEGORY_MISMATCH: 'classification',
  CATEGORY_NOT_MAPPED: 'classification',
  UNSUPPORTED_CLAIM: 'content',
  BANNED_TERM: 'content',
  FIELD_TOO_LONG: 'content',
  FIELD_TOO_SHORT: 'content',
  KEYWORD_DUPLICATE: 'content',
  IMAGE_NON_COMPLIANT: 'media',
  VARIANT_MATRIX_INCOMPLETE: 'variants',
  VARIATION_INVALID: 'variants',
  IDENTIFIER_DUPLICATE: 'identity',
  IDENTIFIER_INVALID: 'identity',
  IDENTIFIER_MISSING: 'identity',
  SKU_CONFLICT: 'identity',
  SELLER_SKU_CONFLICT: 'identity',
  COMPLIANCE_DECLARATION_MISSING: 'compliance',
  AUTH_EXPIRED: 'submission',
  ACCOUNT_PERMISSION_DENIED: 'submission',
}

const BY_CLASS: Partial<Record<NonNullable<ErrorItem['error_class']>, GateId>> = {
  identifier_error: 'identity',
  category_mismatch: 'classification',
  variation_error: 'variants',
  media_error: 'media',
  content_error: 'content',
  compliance_error: 'compliance',
  account_permission: 'submission',
  marketplace_technical: 'submission',
}

const COMMERCIAL_KEY = /(^|_)(price|mrp|tax|hsn|gst)(_|$)/i

/** The gate a canonical field path belongs to, or null when the path says nothing. */
export function fieldGate(field: string): GateId | null {
  const f = field.trim()
  if (!f) return null
  if (f === '*' || f.startsWith('content') || f.startsWith('keywords')) return 'content'
  if (f.startsWith('images')) return 'media'
  if (f.startsWith('variants') || f.startsWith('sku[')) return 'variants'
  if (f === 'category') return 'classification'
  if (f.startsWith('attributes.') || f.startsWith('facts.')) {
    const key = f.slice(f.indexOf('.') + 1)
    return COMMERCIAL_KEY.test(key) ? 'commercial' : 'attributes'
  }
  if (f === 'listing') return 'submission'
  return null
}

export function findingGate(item: Pick<ErrorItem, 'error_code' | 'error_class' | 'field' | 'source'>): GateId {
  return (
    BY_CODE[item.error_code] ??
    (item.error_class ? BY_CLASS[item.error_class] : undefined) ??
    fieldGate(item.field) ??
    (item.source === 'amazon_adapter' || item.source === 'flipkart_adapter' ? 'submission' : 'attributes')
  )
}

export function ruleGate(rule: Pick<Rule, 'rule_type' | 'field'>): GateId {
  if (rule.rule_type === 'image_requirement') return 'media'
  if (rule.rule_type === 'claim_requires_attribute') return 'content'
  return fieldGate(rule.field) ?? 'attributes'
}

/** Rules that apply to a listing: same marketplace, its category or every category, enabled. */
export function applicableRules<R extends Pick<Rule, 'marketplace' | 'category' | 'enabled'>>(
  rules: readonly R[],
  marketplace: string,
  category: string | null | undefined,
): R[] {
  return rules.filter((r) => r.enabled && r.marketplace === marketplace && (r.category == null || r.category === category))
}

/** Every finding of the latest validation's newest stage that ran on the current version. */
export function currentFindings(
  validation: Pick<ValidationSummary, 'listing_version_id' | 'stages'> | null | undefined,
  currentVersionId: string | null | undefined,
): { findings: ErrorItem[]; checked: boolean; stage: Schema<'ValidationResult'> | null } {
  if (!validation || !currentVersionId || validation.listing_version_id !== currentVersionId)
    return { findings: [], checked: false, stage: null }
  const stages = (validation.stages ?? []).filter((s) => s.listing_version_id == null || s.listing_version_id === currentVersionId)
  const stage = stages.length ? stages[stages.length - 1]! : null
  return { findings: stage?.report.errors ?? [], checked: true, stage }
}

/**
 * Rule types the backend stores but never evaluates in validation. Mirrors
 * `apps/api/app/services/rules_engine/evaluators.py` NOT_EVALUATED: such a rule is no evidence
 * that anything was checked.
 */
export const NOT_EVALUATED_RULE_TYPES: ReadonlySet<string> = new Set(['image_requirement', 'fact_source', 'fact_backed_attribute'])

/** True when the latest validation ran a vision (image) check on the current version. */
export function visionChecked(
  validation: Pick<ValidationSummary, 'listing_version_id' | 'stages'> | null | undefined,
  currentVersionId: string | null | undefined,
): boolean {
  if (!validation || !currentVersionId || validation.listing_version_id !== currentVersionId) return false
  return (validation.stages ?? []).some(
    (s) => (s.listing_version_id == null || s.listing_version_id === currentVersionId) && s.source === 'vision_model',
  )
}

export interface GateInput {
  listing: Pick<Listing, 'status' | 'status_reason' | 'marketplace_state' | 'current_version_id'>
  validation: Pick<ValidationSummary, 'listing_version_id' | 'stages'> | null | undefined
  /** Rules that apply to this listing (applicableRules). Null while unknown. */
  rules: readonly Pick<Rule, 'rule_type' | 'field'>[] | null
  /** Adapter preview: its mapping errors, whether it resolved a product type, and its items' barcodes. Null if none. */
  preview: { errors: readonly ErrorItem[]; productType: string | null | undefined; identity?: PreviewIdentity | null } | null
  /** Images on the current version. Null or undefined while unknown. */
  imageCount?: number | null
  /** Marketplace display name for notes ("Amazon"). */
  marketplaceName?: string
  /** Open blocking issues on the current version, as findings (issueFindings). */
  issues?: readonly ErrorItem[]
}

type OpenIssue = Pick<
  Schema<'IssueOut'>,
  'status' | 'severity' | 'listing_version_id' | 'field_path' | 'error_code' | 'error_class' | 'source' | 'message' | 'plain_message' | 'marketplace_code' | 'auto_fixable'
>

/**
 * The open blocking issues the server counts in `needs_you_count` (backend
 * listing_issues.open_error_counts): severity error, on the current version or on none.
 */
export function issueFindings(issues: readonly OpenIssue[], currentVersionId: string | null | undefined): ErrorItem[] {
  return issues
    .filter((i) => i.status === 'open' && i.severity === 'error' && (i.listing_version_id == null || i.listing_version_id === currentVersionId))
    .map((i) => ({
      field: i.field_path,
      error_code: i.error_code,
      error_class: i.error_class,
      severity: i.severity,
      source: i.source,
      message: i.plain_message?.trim() || i.message,
      raw_code: i.marketplace_code ?? null,
      retryable: false,
      auto_fixable: i.auto_fixable,
    }))
}

/** Amazon's identifier attributes (backend adapters/amazon/constants.py EXTERNAL_ID_ATTRIBUTE, EXEMPTION_ATTRIBUTE). */
const BARCODE_ATTR = 'externally_assigned_product_identifier'
const EXEMPTION_ATTR = 'supplier_declared_has_product_identifier_exemption'

/** How the preview's sellable items (standalone, child) are identified: a barcode, or an exemption. */
export interface PreviewIdentity {
  sellable: number
  barcodes: number
  exempt: number
}

type PreviewItemLike = { item_role: string; payload?: Record<string, unknown> | null }

/** Null when the preview has no sellable item, or its marketplace sends neither attribute. */
export function previewIdentity(items: readonly PreviewItemLike[] | null | undefined): PreviewIdentity | null {
  const sellable = (items ?? []).filter((i) => i.item_role !== 'parent')
  if (!sellable.length) return null
  const has = (i: PreviewItemLike, key: string) => Array.isArray(i.payload?.[key]) && (i.payload![key] as unknown[]).length > 0
  const barcodes = sellable.filter((i) => has(i, BARCODE_ATTR)).length
  const exempt = sellable.filter((i) => !has(i, BARCODE_ATTR) && has(i, EXEMPTION_ATTR)).length
  return { sellable: sellable.length, barcodes, exempt }
}

/** The passed Identity gate's line, or null when some sellable item has neither. */
function identityNote(id: PreviewIdentity | null | undefined): string | null {
  if (!id || id.barcodes + id.exempt < id.sellable) return null
  if (!id.exempt) return id.sellable === 1 ? 'Has a barcode.' : 'Every item has a barcode.'
  if (!id.barcodes) return 'No barcode: GTIN exemption confirmed. It is sent with the listing.'
  return `${plural(id.barcodes, 'item')} with a barcode, ${id.exempt} GTIN-exempt (confirmed).`
}

const SUBMISSION_BLOCKED = new Set(['marketplace_rejected', 'publish_failed', 'publish_partial', 'publish_attempts_exhausted', 'marketplace_action_required'])

/** One finding per field and code (the first one seen wins). */
export function dedupeFindings<F extends Pick<ErrorItem, 'field' | 'error_code'>>(items: readonly F[]): F[] {
  const seen = new Set<string>()
  return items.filter((f) => {
    const k = `${f.field}|${f.error_code}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

export function rollUpGates({ listing, validation, rules, preview, imageCount, marketplaceName, issues = [] }: GateInput): GateResult[] {
  const { findings, checked } = currentFindings(validation, listing.current_version_id)
  // The rules check and the marketplace mapping can report the same gap (both say colour is
  // missing): one problem counts once. A stored issue the checks already report is that problem
  // too; the other issues are distinct rows (three failed checks of one photo are three), as the
  // server counts them.
  const checks = dedupeFindings([...findings, ...(preview?.errors ?? [])])
  const reported = new Set(checks.map((f) => `${f.field}|${f.error_code}`))
  const all = [...checks, ...issues.filter((i) => !reported.has(`${i.field}|${i.error_code}`))]
  const covered = new Set<GateId>()
  if (checked) for (const r of rules ?? []) if (!NOT_EVALUATED_RULE_TYPES.has(r.rule_type)) covered.add(ruleGate(r))
  if (preview && preview.productType) covered.add('classification')
  const identityPassed = preview?.productType ? identityNote(preview.identity) : null

  return GATES.map(({ id, label }) => {
    const mine = all.filter((f) => findingGate(f) === id)
    const errors = mine.filter((f) => f.severity === 'error')
    if (id === 'submission') {
      const ms = listing.marketplace_state
      if (ms === 'rejected' || (listing.status_reason && SUBMISSION_BLOCKED.has(listing.status_reason)) || errors.length)
        return { id, label, state: 'blocked', findings: mine, note: 'The marketplace refused part of the submission.' }
      if (ms === 'live') return { id, label, state: 'passed', findings: [], note: 'The marketplace reports it live.' }
      if (ms === 'processing' || ms === 'pending_review' || ms === 'partially_live')
        return { id, label, state: 'working', findings: mine, note: 'Sent. Waiting for the marketplace to confirm.' }
      return { id, label, state: 'unchecked', findings: [], note: 'Checked by the marketplace once it is sent.' }
    }
    if (errors.length) return { id, label, state: 'blocked', findings: mine, note: plural(errors.length, 'blocking issue') }
    if (id === 'media') {
      if (imageCount === 0)
        return { id, label, state: 'blocked', findings: [], note: `Add at least one image. ${marketplaceName ?? 'The marketplace'} needs a main image.` }
      if (mine.length) return { id, label, state: 'warning', findings: mine, note: warningNote(mine) }
      if (imageCount != null && imageCount > 0 && visionChecked(validation, listing.current_version_id))
        return { id, label, state: 'passed', findings: [], note: 'Passed the image checks.' }
      return { id, label, state: 'unchecked', findings: [], note: 'Not checked yet.' }
    }
    if (mine.length) return { id, label, state: 'warning', findings: mine, note: warningNote(mine) }
    if (id === 'identity' && identityPassed) return { id, label, state: 'passed', findings: [], note: identityPassed }
    if (covered.has(id)) return { id, label, state: 'passed', findings: [], note: 'Passed the checks that apply.' }
    return { id, label, state: 'unchecked', findings: [], note: checked ? 'No rule covers this yet.' : 'Not checked yet.' }
  })
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

/** "2 warnings", "3 recommended to add", or both, for a gate in the warning state. */
function warningNote(findings: readonly ErrorItem[]): string {
  const recommended = findings.filter(isRecommendation).length
  const other = findings.length - recommended
  const parts = [other ? plural(other, 'warning') : '', recommended ? `${recommended} recommended to add` : '']
  return parts.filter(Boolean).join(', ')
}

/** True for a warning gate whose findings are all missing recommended attributes. */
export function onlyRecommended(gate: Pick<GateResult, 'state' | 'findings'>): boolean {
  return gate.state === 'warning' && gate.findings.length > 0 && gate.findings.every(isRecommendation)
}

/** The gates that need the seller: blocked, or a warning beyond recommended attributes. */
export function needsGates(gates: readonly GateResult[]): GateResult[] {
  return gates.filter((g) => g.state === 'blocked' || (g.state === 'warning' && !onlyRecommended(g)))
}

/**
 * Gate counts. `warning` leaves out the gates that only recommend attributes, and `recommended`
 * counts those attributes (one per field across the gates), so blockers, warnings and
 * recommendations are never added together.
 */
export function gateCounts(gates: readonly GateResult[]) {
  const recommended = new Set(gates.flatMap((g) => g.findings.filter(isRecommendation).map((f) => f.field)))
  return {
    passed: gates.filter((g) => g.state === 'passed').length,
    blocked: gates.filter((g) => g.state === 'blocked').length,
    warning: gates.filter((g) => g.state === 'warning' && !onlyRecommended(g)).length,
    recommended: recommended.size,
    unchecked: gates.filter((g) => g.state === 'unchecked').length,
    total: gates.length,
  }
}

/** The gates card's one line: "1 must fix · 2 to check · 3 recommended · 4 passed · 2 not checked yet". */
export function gatesSummary(counts: ReturnType<typeof gateCounts>): string {
  const parts = [
    `${counts.blocked} must fix`,
    counts.warning ? `${counts.warning} to check` : '',
    counts.recommended ? `${counts.recommended} recommended` : '',
    `${counts.passed} passed`,
    `${counts.unchecked} not checked yet`,
  ]
  return parts.filter(Boolean).join(' · ')
}

/** Findings that are unsupported claims (p13 "claim to check"); only real UNSUPPORTED_CLAIM items. */
export function claimFindings(items: readonly ErrorItem[]): ErrorItem[] {
  return items.filter((i) => i.error_code === 'UNSUPPORTED_CLAIM')
}

const VARIANT_PATH = /^variants\[(.+)\]\./

/**
 * The Identity gate blocked by a missing barcode (IDENTIFIER_MISSING: Amazon refuses to create a
 * listing with no barcode and no GTIN exemption, backend adapters/amazon/mapping.py `_identifier`).
 * `skus`: the variants it names (`variants[SKU].facts.identifier`); empty when it is the product
 * itself (`facts.identifier`). Null when the gate is not blocked for this reason.
 */
export function identifierMissing(gate: Pick<GateResult, 'state' | 'findings'> | undefined): { skus: string[] } | null {
  if (!gate || gate.state !== 'blocked') return null
  const hits = gate.findings.filter((f) => f.error_code === 'IDENTIFIER_MISSING' && f.severity === 'error')
  if (!hits.length) return null
  const skus = [...new Set(hits.flatMap((f) => VARIANT_PATH.exec(f.field)?.[1] ?? []))]
  return { skus }
}
