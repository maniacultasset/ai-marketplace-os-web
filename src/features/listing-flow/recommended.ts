/**
 * Client feedback item 10: missing recommended attributes, apart from what blocks approval.
 *
 * The backend's category template names `recommended_attributes` (optional keys that help search
 * and filters). A missing one comes back from the Rules Engine as `MISSING_ATTRIBUTE` at warning
 * severity with no rule id (backend `rules_engine.template.is_recommendation`). It never blocks,
 * never moves the listing and never opens an Inbox issue, so the review screen lists it on its
 * own, under "Recommended to add", and leaves it out of the "must fix" and warning counts.
 *
 * Kuinn never fills one in: the seller adds the value on the product (if they know it), and the
 * next generation uses it.
 */
import type { ErrorItem } from './gates'

type Finding = Pick<ErrorItem, 'error_code' | 'severity' | 'source' | 'rule_id' | 'field'>

/** A missing recommended attribute: the template's own warning (backend `is_recommendation`). */
export function isRecommendation(f: Finding): boolean {
  return f.error_code === 'MISSING_ATTRIBUTE' && f.severity === 'warning' && f.source === 'rules_engine' && !f.rule_id && f.field.startsWith('attributes.')
}

export interface FindingGroups<F> {
  /** Severity error: approval waits for these. */
  blocking: F[]
  /** Missing recommended attributes, one per attribute. */
  recommended: F[]
  /** Every other warning. */
  warnings: F[]
}

/** The three review groups, each in the order the checks gave. */
export function groupFindings<F extends Finding>(findings: readonly F[]): FindingGroups<F> {
  const blocking: F[] = []
  const recommended: F[] = []
  const warnings: F[] = []
  const seen = new Set<string>()
  for (const f of findings) {
    if (f.severity === 'error') blocking.push(f)
    else if (isRecommendation(f)) {
      if (seen.has(f.field)) continue
      seen.add(f.field)
      recommended.push(f)
    } else warnings.push(f)
  }
  return { blocking, recommended, warnings }
}

/** The attribute key of a recommendation ("attributes.fit" → "fit"). */
export function recommendedKey(f: Pick<ErrorItem, 'field'>): string {
  return f.field.slice('attributes.'.length)
}

/** What each recommended attribute is, in seller words. */
const HELP: Readonly<Record<string, string>> = {
  fit: 'How it sits on the body, like regular, relaxed or slim. Shoppers filter by it.',
  neckline: 'The neck style, like round neck or V-neck. Shoppers filter by it.',
  sleeve_length: 'Short, three-quarter or full sleeves. Shoppers filter by it.',
  pattern: 'Solid, striped, printed and so on. It helps the listing show up in search.',
  kurta_type: 'The kurta style, like straight, A-line or anarkali. Shoppers filter by it.',
  lamp_type: 'The kind of lamp, like table, floor or bedside. Shoppers filter by it.',
  lamp_material: 'What the lamp body is made of, like brass, wood or ceramic.',
  shade_material: 'What the shade is made of, like fabric, glass or paper.',
  light_source_type: 'The bulb it takes, like LED or E27. Shoppers check it before buying.',
}

export function recommendedHelp(key: string): string {
  return HELP[key] ?? 'Shoppers use it to search and filter.'
}

/** The product page with its editor open on this attribute. */
export function addOnProductLink(productId: string, key: string) {
  return { to: '/products/$productId' as const, params: { productId }, search: { edit: key } }
}
