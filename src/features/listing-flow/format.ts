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
