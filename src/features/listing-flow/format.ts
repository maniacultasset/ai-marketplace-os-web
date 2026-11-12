import { categoryLabel as productCategoryName } from '@/features/products/categories'
import { NEED_FIELDS } from '@/features/products/needs'
import { attrLabel } from './mapping'
import { isRecommendation } from './recommended'

/** Times as the hi-fi writes them: "10:42" today, "14 Oct, 10:42" otherwise. Local time. */
export function clock(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const hm = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  if (sameDay) return hm
  const day = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  return `${day}, ${hm}`
}

export const MARKETPLACE_NAME: Record<string, string> = { amazon: 'Amazon', flipkart: 'Flipkart' }
export const mpName = (m: string) => MARKETPLACE_NAME[m] ?? m

/** The category in the editor's words ("tshirts" → "T-shirts"); the slug is all the API returns. */
export function categoryLabel(slug: string | null | undefined): string {
  return slug ? productCategoryName(slug) : 'No category'
}

const FIELD_NAME: Record<string, string> = {
  'content.title': 'Title',
  'content.description': 'Description',
  'content.bullets': 'Bullets',
  'keywords.search_terms': 'Search terms',
  'content.search_terms': 'Search terms',
  keywords: 'Search terms',
  images: 'Images',
  category: 'Category',
  'facts.identifier': 'Barcode',
  identifier: 'Barcode',
  'facts.gender': 'Gender',
  'facts.brand_name': 'Brand name',
}

/**
 * A finding or claim path in plain words: "content.bullets[2]" → "Bullet 3",
 * "attributes.fabric_type" → "Fabric type", "images[0]" → "Image 1". Unknown paths fall back to attrLabel.
 */
export function fieldLabel(path: string | null | undefined): string {
  if (!path) return 'The listing'
  const p = path.trim()
  if (FIELD_NAME[p]) return FIELD_NAME[p]!
  const bullet = /^content\.bullets\[(\d+)\]$/.exec(p)
  if (bullet) return `Bullet ${Number(bullet[1]) + 1}`
  const image = /^images\[(\d+)\]/.exec(p)
  if (image) return `Image ${Number(image[1]) + 1}`
  const term = /^(?:keywords\.)?search_terms\[(\d+)\]$/.exec(p)
  if (term) return `Search term ${Number(term[1]) + 1}`
  if (p.startsWith('attributes.')) return attrLabel(p.slice('attributes.'.length))
  // Fact paths: "facts.attributes.color" → "Color", "variants[SKU].facts.identifier" → "Barcode".
  const fact = /^(?:variants\[[^\]]+\]\.)?facts\.(.+)$/.exec(p)
  if (fact) return fieldLabel(fact[1]!)
  return attrLabel(p.replace(/\[(\d+)\]/g, ' $1'))
}

/** A message in sentence case: rule messages start lowercase ("title longer than 200 characters"). */
export function sentenceCase(text: string | null | undefined): string {
  const t = (text ?? '').trim()
  if (!t) return ''
  const s = t[0]!.toUpperCase() + t.slice(1)
  return /[.!?]$/.test(s) ? s : `${s}.`
}

/** Text written for the agent or a developer: an internal path, or the "flag the row" guidance. */
export function isAgentText(text: string): boolean {
  return /\b(?:attributes|facts|content|images|variants)[.[][a-z0-9_]/i.test(text) || /flag the row/i.test(text)
}

type FindingText = { message: string; suggestion?: string | null; source: string; value_submitted?: string | null }

/** A check finding for the seller: sentence case, and no suggestion written for the agent. */
export function findingText(f: FindingText): { message: string; suggestion: string | null; value: string | null } {
  // Only a marketplace's answer saw a value that was sent; Kuinn's own checks read the draft.
  const sent = f.source === 'amazon_adapter' || f.source === 'flipkart_adapter'
  return {
    message: sentenceCase(f.message),
    suggestion: f.suggestion && !isAgentText(f.suggestion) ? f.suggestion : null,
    value: f.value_submitted ? `${sent ? 'sent' : 'value'} “${f.value_submitted}”` : null,
  }
}

/** The seller fact keys in the words the product form uses ("country_of_origin" → "Country of origin"). */
const PLAIN_KEY: Readonly<Record<string, string>> = Object.fromEntries(
  NEED_FIELDS.flatMap((f) => [[f.id, f.label] as const, ...f.keys.map((k) => [k, f.label] as const)]),
)

/**
 * A mapping or check message with its raw field keys in plain words (prod QA 9 Nov: "6 mapping
 * problems: country_of_origin is required"): a snake_case key, bare or under `attributes.`, takes
 * the product form's label, else attrLabel's. Other words are left as they are.
 */
export function plainMessage(message: string): string {
  return message
    .replace(/\battributes\.([a-z][a-z0-9_]*)\b/g, (_, key: string) => PLAIN_KEY[key] ?? attrLabel(key))
    .replace(/\b([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\b/g, (_, key: string) => PLAIN_KEY[key] ?? attrLabel(key))
}

const capital = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s)

/** Guidance written for the agent (how to fill the row), never for a seller. */
const AGENT_GUIDANCE = /flag the row|rather than guessing|leave it unset|from the product data/i

/**
 * A finding in seller words (prod QA 9 Nov, item 25: "Set attributes.color from the product
 * data. If the source does not state it, leave it unset and flag the row rather than guessing."):
 * a missing attribute says what to add and where; other messages name fields by their labels;
 * the agent's own guidance becomes one plain next step.
 */
export function sellerFinding(f: {
  field: string
  error_code?: string | null
  message: string
  suggestion?: string | null
  severity?: string | null
  source?: string | null
  rule_id?: string | null
}): {
  message: string
  action: string | null
} {
  const key = f.field.startsWith('attributes.') ? f.field.slice('attributes.'.length) : f.field
  const label = PLAIN_KEY[key] ?? fieldLabel(f.field)
  // A recommended attribute is never "required" (client Chrome pass B4): the level is the
  // backend's (`is_recommendation`), the same one the approval gate and the mapping page read.
  if (isRecommendation(f)) {
    return { message: `${label} is recommended for this category. Not needed for approval.`, action: `Add ${label.toLowerCase()} on the product page if you know it.` }
  }
  if (f.error_code === 'MISSING_ATTRIBUTE') {
    return { message: `${label} is required for this category.`, action: `Add ${label.toLowerCase()} on the product page, then check again.` }
  }
  const message = capital(plainMessage(f.message.trim()))
  const raw = f.suggestion?.trim() || null
  if (!raw) return { message, action: null }
  return { message, action: AGENT_GUIDANCE.test(raw) ? `Fix ${label.toLowerCase()} on the product page, then check again.` : capital(plainMessage(raw)) }
}

/** The draft button's words: it only writes a draft, so it never says "List" (Chrome pass 2). */
export const draftLabel = (marketplaceName: string) => `Draft for ${marketplaceName}`

/** Said beside (or on) every draft button: drafting never sends anything to a marketplace. */
export const DRAFT_HINT = 'Nothing is sent until you approve.'
