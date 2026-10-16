/**
 * Guided form (hi-fi p09) model: sections, fields, completeness and the POST /products body.
 *
 * Fields map onto `ProductCreate` (backend schemas/products.py): sku, title, category and flat
 * `attributes`. Attribute keys come from the backend attribute dictionary
 * (packages/schemas/.../attribute_dictionary.json, storage `attributes`, owner `standalone`);
 * `critical` mirrors its `is_critical` flag. Price and MRP are column facts that POST /products does
 * not accept, so they are set per variant on the next step (spreadsheet import). Images can only be
 * uploaded once the product exists (create with `images` is 404 `images[0]`).
 */
import { CATEGORY_PATTERN, codePoints, SKU_PATTERN, TITLE_MAX, ATTRIBUTE_TEXT_MAX, ATTRIBUTE_KEY_PATTERN } from '@/features/products/schema'

export type SectionId = 'identity' | 'category' | 'attributes' | 'variants' | 'media' | 'care' | 'price'

export const SECTIONS: readonly { id: SectionId; label: string }[] = [
  { id: 'identity', label: 'Identity' },
  { id: 'category', label: 'Category' },
  { id: 'attributes', label: 'Attributes' },
  { id: 'variants', label: 'Variants' },
  { id: 'media', label: 'Media' },
  { id: 'care', label: 'Care and legal' },
  { id: 'price', label: 'Price' },
]

export interface AttrField {
  key: string
  label: string
  hint?: string
  critical: boolean
  section: 'attributes' | 'care'
}

export const ATTR_FIELDS: readonly AttrField[] = [
  { key: 'fiber_composition', label: 'Fabric composition', hint: 'For example 95% cotton, 5% elastane. Never guessed.', critical: true, section: 'attributes' },
  { key: 'fabric_type', label: 'Fabric type', hint: 'For example cotton jersey, linen.', critical: true, section: 'attributes' },
  { key: 'fit', label: 'Fit', hint: 'Relaxed, regular, slim…', critical: false, section: 'attributes' },
  { key: 'neckline', label: 'Neckline', hint: 'Crew neck, V-neck…', critical: false, section: 'attributes' },
  { key: 'sleeve_length', label: 'Sleeve length', hint: 'Short, half, full…', critical: false, section: 'attributes' },
  { key: 'pattern', label: 'Pattern', hint: 'Solid, striped, printed…', critical: false, section: 'attributes' },
  { key: 'color', label: 'Colour', hint: 'The main colour, as customers see it.', critical: false, section: 'attributes' },
  { key: 'wash_care', label: 'Wash care', hint: 'Exactly as on the care label.', critical: true, section: 'care' },
  { key: 'iron_care', label: 'Iron care', hint: 'Exactly as on the care label.', critical: true, section: 'care' },
]

export interface ExtraAttr {
  key: string
  value: string
}

export interface GuidedValues {
  sku: string
  title: string
  category: string
  attrs: Record<string, string>
  extra: ExtraAttr[]
}

export const emptyGuided = (): GuidedValues => ({ sku: '', title: '', category: '', attrs: {}, extra: [] })

export type GuidedErrors = Partial<Record<string, string>>

/** Client checks mirroring ProductCreate. Keys: sku, title, category, attr.<key>, extra.<i>.key|value. */
export function validateGuided(v: GuidedValues): GuidedErrors {
  const e: GuidedErrors = {}
  const sku = v.sku.trim()
  if (!sku) e.sku = 'Enter a SKU.'
  else if (!SKU_PATTERN.test(sku) || sku.includes('﻿')) e.sku = 'No spaces or "]" allowed, at most 64 characters.'
  const title = v.title.trim()
  if (!title) e.title = 'Enter a product name.'
  else if (codePoints(title) > TITLE_MAX) e.title = `At most ${TITLE_MAX} characters.`
  const category = v.category.trim()
  if (!category) e.category = 'Enter a category.'
  else if (!CATEGORY_PATTERN.test(category)) e.category = '2-64 lowercase letters, digits or _ (for example ethnic_wear_kurta_sets).'
  for (const f of ATTR_FIELDS) {
    const val = (v.attrs[f.key] ?? '').trim()
    if (codePoints(val) > ATTRIBUTE_TEXT_MAX) e[`attr.${f.key}`] = `At most ${ATTRIBUTE_TEXT_MAX} characters.`
  }
  const seen = new Set(ATTR_FIELDS.map((f) => f.key))
  v.extra.forEach((x, i) => {
    const key = x.key.trim()
    const val = x.value.trim()
    if (!key && !val) return
    if (!key) e[`extra.${i}.key`] = 'Choose an attribute.'
    else if (!ATTRIBUTE_KEY_PATTERN.test(key)) e[`extra.${i}.key`] = 'Lowercase letters, digits and _; start with a letter.'
    else if (seen.has(key)) e[`extra.${i}.key`] = 'This attribute is already on the form.'
    else seen.add(key)
    if (key && !val) e[`extra.${i}.value`] = 'Enter a value or remove the row.'
    else if (codePoints(val) > ATTRIBUTE_TEXT_MAX) e[`extra.${i}.value`] = `At most ${ATTRIBUTE_TEXT_MAX} characters.`
  })
  return e
}

/** The section an error key belongs to (to open it when a save fails). */
export function sectionOfError(key: string): SectionId {
  if (key === 'sku' || key === 'title') return 'identity'
  if (key === 'category') return 'category'
  if (key.startsWith('attr.')) return ATTR_FIELDS.find((f) => `attr.${f.key}` === key)?.section ?? 'attributes'
  return 'attributes'
}

/** The exact POST /products body: blank attributes are left out, never sent empty. */
export function toProductCreate(v: GuidedValues): { sku: string; title: string; category: string; attributes: Record<string, string> } {
  const attributes: Record<string, string> = {}
  for (const f of ATTR_FIELDS) {
    const val = (v.attrs[f.key] ?? '').trim()
    if (val) attributes[f.key] = val
  }
  for (const x of v.extra) {
    const key = x.key.trim()
    const val = x.value.trim()
    if (key && val) attributes[key] = val
  }
  return { sku: v.sku.trim(), title: v.title.trim(), category: v.category.trim(), attributes }
}

export type SectionState = { kind: 'done' } | { kind: 'missing'; count: number } | { kind: 'todo' }

/**
 * Completeness per section (p09 section list): a dot when done, a number when critical facts are
 * missing, a dash when not started. Variants, media and price are filled on the next step.
 */
export function sectionStates(v: GuidedValues): Record<SectionId, SectionState> {
  const errs = validateGuided(v)
  const facts = (section: 'attributes' | 'care'): SectionState => {
    const missing = ATTR_FIELDS.filter((f) => f.section === section && f.critical && !(v.attrs[f.key] ?? '').trim()).length
    return missing ? { kind: 'missing', count: missing } : { kind: 'done' }
  }
  return {
    identity: v.sku.trim() && v.title.trim() && !errs.sku && !errs.title ? { kind: 'done' } : { kind: 'todo' },
    category: v.category.trim() && !errs.category ? { kind: 'done' } : { kind: 'todo' },
    attributes: facts('attributes'),
    care: facts('care'),
    variants: { kind: 'todo' },
    media: { kind: 'todo' },
    price: { kind: 'todo' },
  }
}

/** Critical facts still empty, by label (p09 "N to confirm" card). */
export function missingCritical(v: GuidedValues): string[] {
  return ATTR_FIELDS.filter((f) => f.critical && !(v.attrs[f.key] ?? '').trim()).map((f) => f.label)
}

/**
 * Map a 422 / 409 from POST /products onto form keys. Returns the keyed messages and whether
 * anything was left unmapped (shown in the form banner with the reference id).
 */
export function mapCreateErrors(
  err: { status: number; type: string; details: readonly { loc: readonly (string | number)[]; msg: string }[] },
  v: GuidedValues,
): { fields: GuidedErrors; unmapped: boolean } {
  const fields: GuidedErrors = {}
  let unmapped = false
  if (err.type === 'SKU_CONFLICT') {
    fields.sku = 'This SKU already exists in this brand.'
    return { fields, unmapped }
  }
  for (const d of err.details) {
    const [where, field, key] = d.loc
    if (where !== 'body') {
      unmapped = true
      continue
    }
    if (field === 'sku' || field === 'title' || field === 'category') {
      fields[field] ??= d.msg
      continue
    }
    if (field === 'attributes' && typeof key === 'string') {
      const msg = err.type === 'UNKNOWN_FACT_KEY' ? 'Unknown attribute.' : d.msg
      if (ATTR_FIELDS.some((f) => f.key === key)) fields[`attr.${key}`] ??= msg
      else {
        const i = v.extra.findIndex((x) => x.key.trim() === key)
        if (i >= 0) fields[`extra.${i}.key`] ??= msg
        else unmapped = true
      }
      continue
    }
    unmapped = true
  }
  if (err.details.length === 0) unmapped = true
  return { fields, unmapped }
}
