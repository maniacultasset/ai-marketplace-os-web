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
 *   - Submission is decided by the marketplace itself (listing status and marketplace state).
 *   - Anything else is "Not checked yet". Never a green dot without evidence.
 */
import type { Schema } from '@/api/types'
import type { Listing, ValidationSummary } from '@/features/listings/model'

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

export interface GateInput {
  listing: Pick<Listing, 'status' | 'status_reason' | 'marketplace_state' | 'current_version_id'>
  validation: Pick<ValidationSummary, 'listing_version_id' | 'stages'> | null | undefined
  /** Rules that apply to this listing (applicableRules). Null while unknown. */
  rules: readonly Pick<Rule, 'rule_type' | 'field'>[] | null
  /** Adapter preview: its mapping errors and whether it resolved a product type. Null if none. */
  preview: { errors: readonly ErrorItem[]; productType: string | null | undefined } | null
}

const SUBMISSION_BLOCKED = new Set(['marketplace_rejected', 'publish_failed', 'publish_partial', 'publish_attempts_exhausted', 'marketplace_action_required'])

export function rollUpGates({ listing, validation, rules, preview }: GateInput): GateResult[] {
  const { findings, checked } = currentFindings(validation, listing.current_version_id)
  const all = [...findings, ...(preview?.errors ?? [])]
  const covered = new Set<GateId>()
  if (checked) for (const r of rules ?? []) covered.add(ruleGate(r))
  if (preview && preview.productType) covered.add('classification')

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
    if (mine.length) return { id, label, state: 'warning', findings: mine, note: plural(mine.length, 'warning') }
    if (covered.has(id)) return { id, label, state: 'passed', findings: [], note: 'Passed the checks that apply.' }
    return { id, label, state: 'unchecked', findings: [], note: checked ? 'No rule covers this yet.' : 'Not checked yet.' }
  })
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

export function gateCounts(gates: readonly GateResult[]) {
  return {
    passed: gates.filter((g) => g.state === 'passed').length,
    blocked: gates.filter((g) => g.state === 'blocked').length,
    warning: gates.filter((g) => g.state === 'warning').length,
    unchecked: gates.filter((g) => g.state === 'unchecked').length,
    total: gates.length,
  }
}

/** Findings that are unsupported claims (p13 "claim to check"); only real UNSUPPORTED_CLAIM items. */
export function claimFindings(items: readonly ErrorItem[]): ErrorItem[] {
  return items.filter((i) => i.error_code === 'UNSUPPORTED_CLAIM')
}
