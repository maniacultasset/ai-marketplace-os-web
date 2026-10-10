import type { Schema } from '@/api/types'

export type Rule = Schema<'RuleOut'>
export type RuleType = Rule['rule_type']
export type Marketplace = Schema<'Marketplace'>

export const MARKETPLACES: readonly Marketplace[] = ['amazon', 'flipkart']

export const MARKETPLACE_LABEL: Record<Marketplace, string> = {
  amazon: 'Amazon',
  flipkart: 'Flipkart',
}

/** `^[a-z0-9_]{2,64}$` — the backend `Slug` used by rule filters and listing.category. */
export const CATEGORY_RE = /^[a-z0-9_]{2,64}$/
export const CATEGORY_HINT = 'Lowercase letters, digits and underscores, 2 to 64 characters.'

/**
 * What each rule type checks, written from the rule definitions in the backend contract
 * (`mkos_schemas/rules.py`). The API does not expose a rule's parameters (limits, term lists,
 * match mode, allowed values, image check), only its type and target field, so each text holds
 * for every variant of its type and never names a parameter the rule may not use.
 */
export const RULE_TYPE_INFO: Record<RuleType, { label: string; checks: string }> = {
  max_length: { label: 'Max length', checks: 'The field must not be longer than the rule’s limit.' },
  min_length: { label: 'Min length', checks: 'The field must be at least as long as the rule’s limit.' },
  banned_terms: {
    label: 'Banned terms',
    checks:
      'The field must not contain any of the rule’s banned terms. Depending on the rule, terms match as whole words, as substrings or as patterns.',
  },
  required_attribute: {
    label: 'Required attribute',
    checks: 'The attribute must be present and not empty. Some rules also limit it to a set of values.',
  },
  max_items: { label: 'Max items', checks: 'The list must not have more items than the rule allows.' },
  min_items: { label: 'Min items', checks: 'The list must have at least the number of items the rule requires.' },
  allowed_values: { label: 'Allowed values', checks: 'The value must be one of the rule’s allowed values.' },
  conditional_required: {
    label: 'Conditional required',
    checks: 'The attribute becomes required when other fields meet the rule’s conditions.',
  },
  cross_field: { label: 'Cross field', checks: 'Two fields must satisfy a comparison with each other.' },
  claim_requires_attribute: {
    label: 'Claim needs attribute',
    checks: 'A claim in the text (for example “organic”) needs a matching attribute to back it.',
  },
  image_requirement: {
    label: 'Image requirement',
    checks:
      'The listing images must pass the rule’s image check, such as resolution, aspect ratio, background, fill, text overlay, watermark, logo, format or file size.',
  },
  pattern: { label: 'Pattern', checks: 'The value is checked against the rule’s pattern: it must match it, or must not, depending on the rule.' },
  fact_source: { label: 'Fact source', checks: 'Facts used in the listing must come from sources the rule allows.' },
  fact_backed_attribute: {
    label: 'Fact-backed attribute',
    checks: 'The attribute value must match the product’s recorded facts.',
  },
}

export function ruleTypeLabel(t: string): string {
  return RULE_TYPE_INFO[t as RuleType]?.label ?? t
}

/** `*` targets every text field of the listing. */
export function fieldLabel(field: string): string {
  return field === '*' ? 'All text fields' : field
}
