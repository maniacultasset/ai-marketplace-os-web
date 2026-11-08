/**
 * SI12 source chips: `ProductOut.field_sources` (per attribute-dictionary key, where the value came
 * from) as the chip the field shows. Pure.
 *
 *   sheet       → From sheet       the CSV import
 *   you         → You              the seller in the app
 *   photo       → From photo       read from a photo, not confirmed (Confirm on the photo facts)
 *   confirmed   → Confirmed        a photo value the seller confirmed
 *   size_chart  → Size chart       the seller's chart saved from the size-chart photo
 *   brand       → Brand profile    the brand default
 *
 * A key with no entry gets no chip from here: the caller decides (a value typed now is "You").
 */
import type { Source } from '@/components/la/source-badge'
import type { Schema } from '@/api/types'

export type FieldSourceOut = Schema<'FieldSourceOut'>
type WithSources = { field_sources?: Record<string, FieldSourceOut> | null }

/** The dictionary keys each form field may be reported under (typed columns have one key each). */
export const FIELD_SOURCE_KEYS: Readonly<Record<string, readonly string[]>> = {
  package: ['package_dimensions', 'package_weight', 'package'],
  size_chart: ['size_measurements', 'size_chart'],
  fiber_composition: ['fiber_composition', 'fabric_composition'],
}

export function toSource(s: FieldSourceOut): Source {
  switch (s.kind) {
    case 'sheet':
      return { kind: 'sheet' }
    case 'you':
      return { kind: 'you' }
    case 'photo':
      return { kind: 'photo', unconfirmed: true }
    case 'confirmed':
      return { kind: 'confirmed' }
    case 'size_chart':
      return { kind: 'size-chart' }
    case 'brand':
      return { kind: 'brand-profile' }
  }
}

/** The raw entry for `key` (or its aliases), if the backend sent one. */
export function rawFieldSource(p: WithSources | null | undefined, key: string): FieldSourceOut | undefined {
  const all = p?.field_sources
  if (!all) return undefined
  for (const k of FIELD_SOURCE_KEYS[key] ?? [key]) {
    const hit = all[k]
    if (hit) return hit
  }
  return undefined
}

/** The chip for `key`, or undefined when the backend sent none. */
export function fieldSource(p: WithSources | null | undefined, key: string): Source | undefined {
  const raw = rawFieldSource(p, key)
  return raw ? toSource(raw) : undefined
}

/**
 * The chip a form field shows while editing: the saved source as long as the value is the saved one,
 * "You" once the seller changed it, nothing while empty.
 */
export function editingSource(saved: Source | undefined, unchanged: boolean, filled: boolean): Source | undefined {
  if (!filled) return undefined
  if (unchanged && saved) return saved
  return { kind: 'you' }
}

/**
 * The chip on a form field's hint line. `source` overrides the default ("You" once filled): pass the
 * saved source (From sheet, From photo…) or null for none. `needed` names who needs an empty field
 * ("Flipkart needs this") and marks it as needing input.
 */
export interface ChipProps {
  source?: Source | null
  needed?: string
}

export function chipFor(filled: boolean, { source, needed }: ChipProps, critical?: boolean, error?: unknown): { source: Source | undefined; needsInput: boolean } {
  const shown: Source | undefined =
    !filled && needed ? { kind: 'needed', detail: needed } : source !== undefined ? (source ?? undefined) : filled ? { kind: 'you' } : undefined
  return { source: shown, needsInput: !filled && !error && (!!needed || !!critical) }
}
