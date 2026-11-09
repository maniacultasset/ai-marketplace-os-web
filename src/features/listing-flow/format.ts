import { NEED_FIELDS } from '@/features/products/needs'
import { attrLabel } from './mapping'

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

/** "womens_tshirts" → "Womens tshirts" (the slug is all the API returns). */
export function categoryLabel(slug: string | null | undefined): string {
  if (!slug) return 'No category'
  const s = slug.replace(/_+/g, ' ').trim()
  return s ? s[0]!.toUpperCase() + s.slice(1) : slug
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
  return attrLabel(p.replace(/\[(\d+)\]/g, ' $1'))
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
  return message.replace(/\b(?:attributes\.)?([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\b/g, (_, key: string) => PLAIN_KEY[key] ?? attrLabel(key))
}
