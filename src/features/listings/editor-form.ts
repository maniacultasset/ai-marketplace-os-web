/**
 * Listing content editor: the current version (ListingDetail.content, a CanonicalListing) as form
 * values, and form values as the PATCH /listings/{id}/content body (ListingContentPatch:
 * `content`, `keywords`, `attributes`; schemas/listings.py). The form model and its limits are the
 * rules dry-run draft's (`@/features/rules/listing-form`), so both editors validate identically.
 */
import { splitList, valueToAttr, type AttrRow, type DraftValues } from '@/features/rules/listing-form'
import type { CanonicalListing, ContentPatch } from './model'

type AttrValue = string | number | boolean | string[]

export function listingToDraft(c: CanonicalListing): DraftValues {
  const attributes: AttrRow[] = []
  for (const [k, v] of Object.entries(c.attributes ?? {})) {
    const row = valueToAttr(k, v)
    if (row) attributes.push(row)
  }
  return {
    marketplace: c.marketplace,
    category: c.category,
    product_id: c.product_id,
    title: c.content.title,
    bullets: (c.content.bullets.length ? c.content.bullets : ['']).map((value) => ({ value })),
    description: c.content.description,
    search_terms: [...(c.keywords?.search_terms ?? [])],
    hidden_terms: [...(c.keywords?.hidden_terms ?? [])],
    attributes,
  }
}

function attrValue(a: AttrRow): AttrValue {
  switch (a.type) {
    case 'number':
      return Number(a.value)
    case 'boolean':
      return a.value === 'true'
    case 'list':
      return splitList(a.value)
    default:
      return a.value
  }
}

/** Valid (zod-checked) form values → PATCH body. Sends all three parts so the edit is explicit. */
export function draftToPatch(v: DraftValues): ContentPatch {
  const attributes: Record<string, AttrValue> = {}
  for (const a of v.attributes) attributes[a.key.trim()] = attrValue(a)
  return {
    content: {
      title: v.title,
      bullets: v.bullets.map((b) => b.value),
      description: v.description,
    },
    keywords: { search_terms: v.search_terms, hidden_terms: v.hidden_terms },
    attributes,
  }
}

/** Order-insensitive JSON for objects (attribute key order is not meaningful). */
function stable(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(stable).join(',')}]`
  if (x && typeof x === 'object')
    return `{${Object.keys(x)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((x as Record<string, unknown>)[k])}`)
      .join(',')}}`
  return JSON.stringify(x ?? null)
}

const PARTS = [
  { label: 'Title', get: (c: CanonicalListing) => c.content.title },
  { label: 'Bullets', get: (c: CanonicalListing) => c.content.bullets },
  { label: 'Description', get: (c: CanonicalListing) => c.content.description },
  { label: 'Search terms', get: (c: CanonicalListing) => c.keywords?.search_terms ?? [] },
  { label: 'Hidden terms', get: (c: CanonicalListing) => c.keywords?.hidden_terms ?? [] },
  { label: 'Attributes', get: (c: CanonicalListing) => c.attributes ?? {} },
] as const

/** Which parts differ between two versions (for "someone else changed: Title, Bullets"). */
export function changedParts(before: CanonicalListing | null | undefined, after: CanonicalListing | null | undefined): string[] {
  if (!before || !after) return []
  return PARTS.filter((p) => stable(p.get(before)) !== stable(p.get(after))).map((p) => p.label)
}

/** Whether the form differs from the version it was loaded from (ignores the untouched target fields). */
export function draftDiffers(base: CanonicalListing, v: DraftValues): boolean {
  const patch = draftToPatch(v)
  const now: CanonicalListing = {
    ...base,
    content: patch.content,
    keywords: patch.keywords ?? undefined,
    attributes: patch.attributes ?? {},
  }
  return changedParts(base, now).length > 0
}
