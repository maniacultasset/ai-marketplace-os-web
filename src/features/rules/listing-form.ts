/**
 * The dry-run draft: form model, zod validation with the backend's exact limits
 * (mkos_schemas/listing.py CanonicalListing), and conversion to/from the request body
 * `{"listing": CanonicalListing}` (POST /rules/dry-run).
 */
import { z } from 'zod'
import type { ErrorDetail, Schema } from '@/api/types'
import { CATEGORY_HINT, CATEGORY_RE } from './labels'

export type DryRunBody = Schema<'DryRunRequest'>
export type CanonicalListing = Schema<'CanonicalListing'>
export type ValidationResult = Schema<'ValidationResult'>
export type ProductOut = Schema<'ProductOut'>

/** C7: the dry-run body cap. Larger is 413 PAYLOAD_TOO_LARGE. */
export const MAX_BODY_BYTES = 262_144
export const LIMITS = {
  title: 500,
  bullet: 1000,
  bulletsMin: 1,
  bulletsMax: 10,
  description: 5000,
  terms: 50,
  term: 256,
  attributes: 128,
  attrString: 256,
} as const
export const ATTR_KEY_RE = /^[a-z0-9_]{1,64}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type AttrType = 'text' | 'number' | 'boolean' | 'list'
export interface AttrRow {
  key: string
  type: AttrType
  value: string
}

/**
 * Length as the backend counts it: Pydantic max_length counts code points, not UTF-16 units,
 * so an emoji is 1 here (JS `.length` would say 2).
 */
export const charCount = (s: string) => [...s].length

const nonBlank = (max: number, label: string) =>
  z
    .string()
    .refine((s) => s.trim().length > 0, `${label} can't be blank.`)
    .refine((s) => charCount(s) <= max, `${label} must be at most ${max.toLocaleString()} characters.`)

export function splitList(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export const draftSchema = z
  .object({
    marketplace: z.enum(['amazon', 'flipkart'], { error: 'Pick a marketplace.' }),
    category: z.string().trim().regex(CATEGORY_RE, CATEGORY_HINT),
    product_id: z.string().regex(UUID_RE, 'Product ID must be a UUID.'),
    title: nonBlank(LIMITS.title, 'Title'),
    bullets: z
      .array(z.object({ value: nonBlank(LIMITS.bullet, 'Bullet') }))
      .min(LIMITS.bulletsMin, 'Add at least one bullet.')
      .max(LIMITS.bulletsMax, `At most ${LIMITS.bulletsMax} bullets.`),
    description: nonBlank(LIMITS.description, 'Description'),
    search_terms: z.array(nonBlank(LIMITS.term, 'Term')).max(LIMITS.terms, `At most ${LIMITS.terms} terms.`),
    hidden_terms: z.array(nonBlank(LIMITS.term, 'Term')).max(LIMITS.terms, `At most ${LIMITS.terms} terms.`),
    attributes: z
      .array(z.object({ key: z.string(), type: z.enum(['text', 'number', 'boolean', 'list']), value: z.string() }))
      .max(LIMITS.attributes, `At most ${LIMITS.attributes} attributes.`)
      // On the array (not the object) so these show even while other fields are invalid.
      .superRefine((rows, ctx) => {
        const seen = new Set<string>()
        rows.forEach((a, i) => {
          const key = a.key.trim()
          if (!ATTR_KEY_RE.test(key)) {
            ctx.addIssue({ code: 'custom', path: [i, 'key'], message: 'Use a-z, 0-9 and _ (1 to 64).' })
          } else if (seen.has(key)) {
            ctx.addIssue({ code: 'custom', path: [i, 'key'], message: 'Duplicate key.' })
          }
          seen.add(key)
          const msg = attrValueError(a)
          if (msg) ctx.addIssue({ code: 'custom', path: [i, 'value'], message: msg })
        })
      }),
  })

export type DraftValues = z.input<typeof draftSchema>

function attrValueError(a: AttrRow): string | null {
  switch (a.type) {
    case 'text':
      return charCount(a.value) > LIMITS.attrString ? `At most ${LIMITS.attrString} characters.` : null
    case 'number':
      return a.value.trim() === '' || !Number.isFinite(Number(a.value)) ? 'Enter a finite number.' : null
    case 'boolean':
      return a.value === 'true' || a.value === 'false' ? null : 'Pick yes or no.'
    case 'list': {
      const items = splitList(a.value)
      if (items.some((s) => charCount(s) > LIMITS.attrString)) return `Each item at most ${LIMITS.attrString} characters.`
      return null
    }
  }
}

export function emptyDraft(init: { marketplace?: 'amazon' | 'flipkart'; category?: string } = {}): DraftValues {
  return {
    marketplace: init.marketplace ?? ('' as DraftValues['marketplace']),
    category: init.category ?? '',
    product_id: crypto.randomUUID(),
    title: '',
    bullets: [{ value: '' }],
    description: '',
    search_terms: [],
    hidden_terms: [],
    attributes: [],
  }
}

type AttrValue = string | number | boolean | string[]

function attrToValue(a: AttrRow): AttrValue {
  switch (a.type) {
    case 'number': {
      const n = Number(a.value)
      return a.value.trim() !== '' && Number.isFinite(n) ? n : a.value
    }
    case 'boolean':
      return a.value === 'true' ? true : a.value === 'false' ? false : a.value
    case 'list':
      return splitList(a.value)
    default:
      return a.value
  }
}

export function valueToAttr(key: string, v: unknown): AttrRow | null {
  if (typeof v === 'string') return { key, type: 'text', value: v }
  if (typeof v === 'number') return { key, type: 'number', value: String(v) }
  if (typeof v === 'boolean') return { key, type: 'boolean', value: String(v) }
  if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return { key, type: 'list', value: v.join(', ') }
  return null
}

/** Listing keys the structured form edits; anything else from the JSON editor is kept as-is. */
const FORM_KEYS = ['product_id', 'marketplace', 'category', 'content', 'keywords', 'attributes'] as const

/** Form values (+ extra listing keys from the JSON editor) -> request body. Never throws. */
export function toBody(v: DraftValues, extras: Record<string, unknown> = {}): DryRunBody {
  const attributes: Record<string, AttrValue> = {}
  for (const a of v.attributes) attributes[a.key.trim()] = attrToValue(a)
  const listing = {
    ...extras,
    product_id: v.product_id,
    marketplace: v.marketplace,
    category: v.category.trim(),
    content: {
      title: v.title,
      bullets: v.bullets.map((b) => b.value),
      description: v.description,
    },
    keywords: { search_terms: v.search_terms, hidden_terms: v.hidden_terms },
    attributes,
  }
  return { listing } as unknown as DryRunBody
}

export type ParseResult =
  | { ok: true; body: DryRunBody; values: DraftValues; extras: Record<string, unknown> }
  | { ok: false; error: string }

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)

/** Parse the JSON editor text. `values` is the form view of it (for switching back to the form). */
export function parseBody(text: string): ParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    return { ok: false, error: `Not valid JSON: ${e instanceof Error ? e.message : 'parse error'}` }
  }
  if (!isObj(raw)) return { ok: false, error: 'The body must be a JSON object: {"listing": {...}}.' }
  const extraTop = Object.keys(raw).filter((k) => k !== 'listing')
  if (extraTop.length) return { ok: false, error: `Only "listing" is allowed at the top level (found "${extraTop[0]}").` }
  const l = raw.listing
  if (!isObj(l)) return { ok: false, error: '"listing" must be an object.' }

  const content = isObj(l.content) ? l.content : {}
  const keywords = isObj(l.keywords) ? l.keywords : {}
  const attrs = isObj(l.attributes) ? l.attributes : {}
  const attributes: AttrRow[] = []
  for (const [k, val] of Object.entries(attrs)) {
    const row = valueToAttr(k, val)
    if (!row) return { ok: false, error: `listing.attributes.${k} must be text, a number, true/false or a list of text.` }
    attributes.push(row)
  }
  const strs = (x: unknown) => (Array.isArray(x) ? x.map((s) => (typeof s === 'string' ? s : JSON.stringify(s))) : [])
  const str = (x: unknown) => (typeof x === 'string' ? x : x == null ? '' : JSON.stringify(x))
  const bullets = strs(content.bullets)
  const values: DraftValues = {
    marketplace: str(l.marketplace) as DraftValues['marketplace'],
    category: str(l.category),
    product_id: str(l.product_id),
    title: str(content.title),
    bullets: (bullets.length ? bullets : ['']).map((value) => ({ value })),
    description: str(content.description),
    search_terms: strs(keywords.search_terms),
    hidden_terms: strs(keywords.hidden_terms),
    attributes,
  }
  const extras: Record<string, unknown> = {}
  for (const [k, val] of Object.entries(l)) if (!(FORM_KEYS as readonly string[]).includes(k)) extras[k] = val
  return { ok: true, body: raw as unknown as DryRunBody, values, extras }
}

export const bodyBytes = (text: string) => new Blob([text]).size

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KiB`
}

/** Prefill from a real product (GET /products): id, category, title and its attributes. */
export function fromProduct(p: ProductOut, current: DraftValues): DraftValues {
  const attributes: AttrRow[] = []
  for (const [k, val] of Object.entries(p.attributes ?? {})) {
    const row = valueToAttr(k, val)
    if (row) attributes.push(row)
  }
  return {
    ...current,
    product_id: p.id,
    category: p.category,
    title: p.title,
    attributes,
  }
}

/**
 * Map a 422 detail loc (["body","listing",...]) to a form field name, or null.
 * The category error with a valid slug means "no current template" (rules_dry_run).
 */
export function fieldForLoc(loc: ErrorDetail['loc'], values: DraftValues): string | null {
  if (loc[0] !== 'body' || loc[1] !== 'listing') return null
  const [a, b, c] = loc.slice(2).map(String)
  if (a === 'marketplace' || a === 'category' || a === 'product_id') return a
  if (a === 'content') {
    if (b === 'title' || b === 'description') return b
    if (b === 'bullets') return c !== undefined && /^\d+$/.test(c) ? `bullets.${c}.value` : 'bullets'
  }
  if (a === 'keywords' && (b === 'search_terms' || b === 'hidden_terms')) return b
  if (a === 'attributes') {
    if (b === undefined) return null
    const i = values.attributes.findIndex((r) => r.key.trim() === b)
    return i >= 0 ? `attributes.${i}.value` : null
  }
  return null
}

/** The attribute key an ErrorItem path points at ("attributes.color" -> "color"), or null. */
export function attrKeyForItemPath(path: string): string | null {
  if (!path.startsWith('attributes.')) return null
  const key = path.slice('attributes.'.length).split(/[.[]/)[0] ?? ''
  return ATTR_KEY_RE.test(key) ? key : null
}

/** Map a rules-engine ErrorItem field path ("content.bullets[0]", "attributes.color") to a form field. */
export function fieldForItemPath(path: string, values: DraftValues): string | null {
  const m = /^content\.bullets(?:\[(\d+)\])?/.exec(path)
  if (m) return m[1] !== undefined ? `bullets.${m[1]}.value` : 'bullets'
  if (path === 'content.title') return 'title'
  if (path === 'content.description') return 'description'
  if (path.startsWith('keywords.search_terms')) return 'search_terms'
  if (path.startsWith('keywords.hidden_terms')) return 'hidden_terms'
  if (path.startsWith('attributes.')) {
    const key = attrKeyForItemPath(path)
    if (!key) return null
    const i = values.attributes.findIndex((r) => r.key.trim() === key)
    return i >= 0 ? `attributes.${i}.value` : null
  }
  return null
}
