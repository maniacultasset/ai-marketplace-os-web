/**
 * Mapping and validation rows (hi-fi p18): your value → marketplace field → rule → state.
 *
 * The backend has no mapping read-model yet (analysis plan R5, `GET /listings/{id}/mapping`
 * missing), so each column comes from a real source and says so when it has nothing:
 *   - Your value: the listing's canonical attributes (ListingDetail.content.attributes).
 *   - Marketplace field: the adapter preview payload (GET /listings/{id}/preview), matched only
 *     when the payload carries a field with the same name. A remapped name is not guessed.
 *   - Rule: the enabled rules for this marketplace and category (GET /rules).
 *   - State: the findings of the latest validation on the current version, plus the preview's own
 *     mapping errors. Passed only when a rule covers the field and the version was checked;
 *     otherwise "Not checked yet".
 */
import type { Schema } from '@/api/types'
import type { ErrorItem, Rule } from './gates'

type JsonValue = Schema<'JsonValue'>
type AttrValue = string | number | boolean | string[]

export type RuleTag = 'Required' | 'Conditional' | 'Allowed values' | 'Other rule' | 'No rule'
export type RowState = 'passed' | 'warning' | 'blocked' | 'unchecked'

export interface MappingRow {
  /** Canonical path, e.g. "attributes.color". */
  path: string
  key: string
  yourValue: string | null
  marketplaceField: { name: string; value: string } | null
  rule: RuleTag
  ruleTypes: string[]
  state: RowState
  findings: ErrorItem[]
}

export function formatAttr(v: AttrValue | null | undefined): string | null {
  if (v == null) return null
  if (Array.isArray(v)) return v.length ? v.join(', ') : null
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  const s = String(v).trim()
  return s || null
}

function formatJson(v: JsonValue): string {
  if (v == null) return ''
  if (Array.isArray(v)) return v.map((x: unknown) => formatJson(x)).filter(Boolean).join(', ')
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if ('value' in o) return `${formatJson(o['value'])}${typeof o['unit'] === 'string' ? ` ${o['unit']}` : ''}`
    if ('media_location' in o) return formatJson(o['media_location'])
    return JSON.stringify(o)
  }
  return String(v)
}

/** The payload's field of this name: top level or under an `attributes` container. */
export function payloadField(payload: Record<string, JsonValue> | undefined, key: string): { name: string; value: string } | null {
  if (!payload) return null
  const nested = payload['attributes']
  const inAttrs = nested && typeof nested === 'object' && !Array.isArray(nested) ? (nested as Record<string, JsonValue>) : null
  const hit = inAttrs && key in inAttrs ? inAttrs[key] : key in payload ? payload[key] : undefined
  if (hit === undefined) return null
  return { name: key, value: formatJson(hit) }
}

function ruleTag(types: readonly string[]): RuleTag {
  if (types.includes('required_attribute')) return 'Required'
  if (types.includes('conditional_required')) return 'Conditional'
  if (types.includes('allowed_values')) return 'Allowed values'
  if (types.length) return 'Other rule'
  return 'No rule'
}

const onPath = (f: ErrorItem, path: string) => f.field === path || f.field.startsWith(`${path}.`) || f.field.startsWith(`${path}[`)

export function mappingRows(input: {
  attributes: Record<string, AttrValue> | undefined
  payload: Record<string, JsonValue> | undefined
  rules: readonly Pick<Rule, 'field' | 'rule_type'>[]
  findings: readonly ErrorItem[]
  checked: boolean
}): MappingRow[] {
  const attrs = input.attributes ?? {}
  const keys = new Set<string>(Object.keys(attrs))
  for (const r of input.rules) if (r.field.startsWith('attributes.')) keys.add(r.field.slice('attributes.'.length))
  for (const f of input.findings) if (f.field.startsWith('attributes.')) keys.add(f.field.slice('attributes.'.length).split(/[.[]/)[0]!)

  const rows = [...keys].sort().map<MappingRow>((key) => {
    const path = `attributes.${key}`
    const types = [...new Set(input.rules.filter((r) => r.field === path).map((r) => r.rule_type))]
    const findings = input.findings.filter((f) => onPath(f, path))
    const state: RowState = findings.some((f) => f.severity === 'error')
      ? 'blocked'
      : findings.length
        ? 'warning'
        : input.checked && types.length
          ? 'passed'
          : 'unchecked'
    return {
      path,
      key,
      yourValue: formatAttr(attrs[key]),
      marketplaceField: payloadField(input.payload, key),
      rule: ruleTag(types),
      ruleTypes: types,
      state,
      findings,
    }
  })
  // Problems first (the design highlights the row that needs you), then by name.
  const rank: Record<RowState, number> = { blocked: 0, warning: 1, passed: 2, unchecked: 2 }
  return rows.sort((a, b) => rank[a.state] - rank[b.state] || a.key.localeCompare(b.key))
}

/** Findings that are not about one attribute (title, images, listing-level), for the list below. */
export function otherFindings(findings: readonly ErrorItem[]): ErrorItem[] {
  return findings.filter((f) => !f.field.startsWith('attributes.'))
}

/** "fabric_type" → "Fabric type". */
export function attrLabel(key: string): string {
  const s = key.replace(/[_.]+/g, ' ').trim()
  return s ? s[0]!.toUpperCase() + s.slice(1) : key
}
