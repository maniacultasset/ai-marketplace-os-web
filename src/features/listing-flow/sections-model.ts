/**
 * Pure rules of the listing's section cards on Review (client feedback 14 and 16), mirroring the
 * backend (services/sections.py):
 *   - five sections, each with the canonical paths it owns: Title (content.title), Key features
 *     (content.bullets), Description (content.description), Search terms (keywords.search_terms,
 *     keywords.hidden_terms) and Attributes (attributes.<key>);
 *   - Save is PATCH /listings/{id}/content with the full content and only this section changed. No
 *     AI runs. Every path the edit changes is locked: no regenerate rewrites it until it is
 *     unlocked (`unlock` on the same PATCH, content unchanged, makes no version);
 *   - "Regenerate this section" is POST /listings/{id}/regenerate with `sections`: the agent rewrites
 *     only that section, into a new version that waits for approval. A fully locked section is
 *     refused (422 on `sections`), so the button asks for an unlock first;
 *   - `affected_sections` on the listing names the sections the seller's answers feed ("Update these
 *     sections" regenerates just those, `for_answers: true`);
 *   - limits: the schema's hard caps block Save; a marketplace limit is a warning (the server's
 *     checks still decide). GET /rules does not return a rule's limit, so the table is here
 *     (backend packages/schemas/fixtures/rules.seed.json).
 */
import type { Schema } from '@/api/types'
import { codePoints, CONTROL_MSG, hasStrayControlChars } from '@/lib/validation'
import { BULLET_MAX, BULLETS_MAX, DESCRIPTION_MAX, TITLE_MAX } from './review-model'

export type Section = 'title' | 'bullets' | 'description' | 'keywords' | 'attributes'
type Canonical = Schema<'CanonicalListing'>
export type AttributeValue = NonNullable<Canonical['attributes']>[string]

export const SECTIONS: readonly Section[] = ['title', 'bullets', 'description', 'keywords', 'attributes']

export const SECTION_LABEL: Record<Section, string> = {
  title: 'Title',
  bullets: 'Key features',
  description: 'Description',
  keywords: 'Search terms',
  attributes: 'Attributes',
}

/** The lockable paths of the plain sections (Attributes locks one `attributes.<key>` each). */
export const SECTION_PATHS: Record<Exclude<Section, 'attributes'>, readonly string[]> = {
  title: ['content.title'],
  bullets: ['content.bullets'],
  description: ['content.description'],
  keywords: ['keywords.search_terms', 'keywords.hidden_terms'],
}

/** The schema's caps (mkos_schemas ListingKeywords: 50 terms, 256 characters each). */
export const TERMS_MAX = 50
export const TERM_MAX = 256
export const ATTRIBUTE_MAX = 256

export interface SectionLimits {
  /** The marketplace's title limit (characters); a warning above it. */
  title: number
  /** How many bullets the marketplace takes. */
  bullets: number
  bullet: number
  description: number
  /** Amazon's backend keywords: every term joined by single spaces, in UTF-8 bytes. */
  hiddenBytes: number | null
}

const HARD: SectionLimits = { title: TITLE_MAX, bullets: BULLETS_MAX, bullet: BULLET_MAX, description: DESCRIPTION_MAX, hiddenBytes: null }

/** rules.seed.json: Amazon title 200, 5 bullets of 500, description 2000, backend keywords 250 bytes; Flipkart title 150. */
const MARKETPLACE: Partial<Record<string, Partial<SectionLimits>>> = {
  amazon: { title: 200, bullets: 5, bullet: 500, description: 2000, hiddenBytes: 250 },
  flipkart: { title: 150 },
}

export function limitsFor(marketplace: string): SectionLimits {
  return { ...HARD, ...MARKETPLACE[marketplace] }
}

/** The locked paths that belong to `section`. */
export function sectionLocks(section: Section, locked: readonly string[] | null | undefined): string[] {
  const all = locked ?? []
  if (section === 'attributes') return all.filter((p) => p.startsWith('attributes.'))
  return all.filter((p) => SECTION_PATHS[section].includes(p))
}

/** Every path a section regenerate would rewrite is locked (the backend refuses it). Attributes never is. */
export function fullyLocked(section: Section, locked: readonly string[] | null | undefined): boolean {
  if (section === 'attributes') return false
  const held = new Set(locked ?? [])
  return SECTION_PATHS[section].every((p) => held.has(p))
}

/** "Title, Key features and Description". */
export function sectionList(sections: readonly Section[]): string {
  const names = SECTIONS.filter((s) => sections.includes(s)).map((s) => SECTION_LABEL[s])
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** The section a finding's field belongs to, or null (images, the listing, facts). */
export function sectionOf(field: string | null | undefined): Section | null {
  if (!field) return null
  if (field === 'content.title') return 'title'
  if (field === 'content.bullets' || field.startsWith('content.bullets[')) return 'bullets'
  if (field === 'content.description') return 'description'
  if (field.startsWith('keywords.')) return 'keywords'
  if (field === 'attributes' || field.startsWith('attributes.')) return 'attributes'
  return null
}

/** The bullet a finding points at (`content.bullets[2]` → 2), else null. */
export function bulletIndex(field: string | null | undefined): number | null {
  const m = /^content\.bullets\[(\d+)\]$/.exec(field ?? '')
  return m ? Number(m[1]) : null
}

export const utf8Bytes = (text: string) => new TextEncoder().encode(text).length

/** Terms from a textarea: one per line or comma, trimmed, blanks dropped. */
export const splitTerms = (text: string) =>
  text
    .split(/[\n,]/)
    .map((t) => t.trim())
    .filter(Boolean)

const fmt = (n: number) => n.toLocaleString('en-IN')

function textError(value: string, max: number, what: string, blank: string): string | undefined {
  const v = value.trim()
  if (!v) return blank
  if (hasStrayControlChars(v)) return CONTROL_MSG
  if (codePoints(v) > max) return `Shorten ${what} to ${fmt(max)} characters or fewer.`
  return undefined
}

export const validateTitle = (title: string) => textError(title, TITLE_MAX, 'the title', 'Write a title.')
export const validateDescription = (text: string) => textError(text, DESCRIPTION_MAX, 'the description', 'Write a description.')

/** Per-bullet errors (index → message) and a list error. Blank rows are dropped on save, not errors. */
export function validateBullets(bullets: readonly string[]): { list?: string; items: Record<number, string> } {
  const items: Record<number, string> = {}
  bullets.forEach((b, i) => {
    const v = b.trim()
    if (!v) return
    if (hasStrayControlChars(v)) items[i] = CONTROL_MSG
    else if (codePoints(v) > BULLET_MAX) items[i] = `Shorten this feature to ${fmt(BULLET_MAX)} characters or fewer.`
  })
  const kept = bullets.filter((b) => b.trim())
  const list = !kept.length ? 'Write at least one key feature.' : kept.length > BULLETS_MAX ? `Use ${BULLETS_MAX} key features or fewer.` : undefined
  return { list, items }
}

export function validateTerms(terms: readonly string[]): string | undefined {
  if (terms.length > TERMS_MAX) return `Use ${TERMS_MAX} terms or fewer.`
  if (terms.some((t) => hasStrayControlChars(t))) return CONTROL_MSG
  const long = terms.find((t) => codePoints(t) > TERM_MAX)
  if (long) return `Shorten “${long.slice(0, 24)}…” to ${TERM_MAX} characters or fewer.`
  return undefined
}

/** A marketplace-limit warning for a count over `limit`, else null. */
export function overLimit(count: number, limit: number, mp: string, unit: string): string | null {
  return count > limit ? `${mp} allows ${fmt(limit)} ${unit}. Shorten it, or this version will be blocked by the checks.` : null
}

/* ---- attributes ---- */

export type AttributeKind = 'text' | 'number' | 'boolean' | 'list'

export function attributeKind(value: AttributeValue): AttributeKind {
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number') return 'number'
  if (Array.isArray(value)) return 'list'
  return 'text'
}

/** The value as the input shows it. */
export function attributeText(value: AttributeValue): string {
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

/** The edited text back in the original value's type; an error message when it cannot be. */
export function parseAttribute(kind: AttributeKind, text: string): { value?: AttributeValue; error?: string } {
  const v = text.trim()
  if (kind === 'boolean') return { value: v === 'Yes' }
  if (!v) return { error: 'Enter a value.' }
  if (hasStrayControlChars(v)) return { error: CONTROL_MSG }
  if (kind === 'number') {
    const n = Number(v)
    return Number.isFinite(n) ? { value: n } : { error: 'Enter a number.' }
  }
  if (kind === 'list') {
    const items = splitTerms(v)
    if (items.some((i) => codePoints(i) > ATTRIBUTE_MAX)) return { error: `Shorten each value to ${ATTRIBUTE_MAX} characters or fewer.` }
    return items.length ? { value: items } : { error: 'Enter a value.' }
  }
  if (codePoints(v) > ATTRIBUTE_MAX) return { error: `Shorten it to ${ATTRIBUTE_MAX} characters or fewer.` }
  return { value: v }
}

/** "fabric_type" → "Fabric type". */
export const attributeLabel = (key: string) => {
  const words = key.replace(/_/g, ' ').trim()
  return words ? words[0]!.toUpperCase() + words.slice(1) : key
}

/* ---- why these search terms (client feedback 11) ---- */

type KeywordReason = Schema<'KeywordReason'>

export interface KeywordWhy {
  term: string
  /** The agent's reason, as written. */
  why: string
  /** Where the term comes from: "From your product: Fabric type", "How shoppers search". */
  source: string
  /** Where the copy uses it: "Used in the title, key features and backend keywords". */
  usedIn: string
}

const SOURCE_TEXT: Record<KeywordReason['source'], string> = {
  product_facts: 'From your product',
  category: 'Usual for this category',
  search_intent: 'How shoppers search',
}
const PLACE_TEXT: Record<NonNullable<KeywordReason['used_in']>[number], string> = {
  title: 'the title',
  bullets: 'key features',
  description: 'the description',
  backend: 'backend keywords',
}
const FACT_TEXT: Record<string, string> = { 'identity.brand_name': 'Brand', 'identity.gender': 'Gender' }

const joinWords = (items: readonly string[]) =>
  items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`

/** "attributes.fabric_type" → "Fabric type"; "identity.gender" → "Gender". */
export const factLabel = (path: string) =>
  FACT_TEXT[path] ?? attributeLabel(path.startsWith('attributes.') ? path.slice('attributes.'.length) : path.split('.').pop() ?? path)

/**
 * The reasons of the terms the card lists, in the card's order. A term with no reason (one the
 * seller added, or a listing written before reasons existed) has no row: nothing is guessed.
 */
export function keywordWhy(reasons: readonly KeywordReason[] | undefined, terms: readonly string[]): KeywordWhy[] {
  const byTerm = new Map((reasons ?? []).map((r) => [r.term, r]))
  const rows: KeywordWhy[] = []
  for (const term of new Set(terms)) {
    const r = byTerm.get(term)
    if (!r) continue
    const facts = r.source === 'product_facts' ? (r.fact_keys ?? []).map(factLabel) : []
    const places = (r.used_in ?? []).map((p) => PLACE_TEXT[p])
    rows.push({
      term,
      why: r.reason,
      source: facts.length ? `${SOURCE_TEXT[r.source]}: ${joinWords(facts)}` : SOURCE_TEXT[r.source],
      usedIn: places.length ? `Used in ${joinWords(places)}` : 'Not used yet',
    })
  }
  return rows
}

/* ---- the PATCH bodies ---- */

type ContentPatch = Schema<'ListingContentPatch'>

/** The PATCH body for one section's save: the full content, only this section changed. */
export function sectionPatch(
  canonical: Pick<Canonical, 'content' | 'keywords' | 'attributes'>,
  change:
    | { section: 'title'; title: string }
    | { section: 'bullets'; bullets: readonly string[] }
    | { section: 'description'; description: string }
    | { section: 'keywords'; searchTerms: readonly string[]; hiddenTerms: readonly string[] }
    | { section: 'attributes'; attributes: Record<string, AttributeValue> },
): ContentPatch {
  const c = canonical.content
  const content = { title: c.title, bullets: [...c.bullets], description: c.description }
  if (change.section === 'title') return { content: { ...content, title: change.title.trim() } }
  if (change.section === 'bullets') return { content: { ...content, bullets: change.bullets.map((b) => b.trim()).filter(Boolean) } }
  if (change.section === 'description') return { content: { ...content, description: change.description.trim() } }
  if (change.section === 'keywords') return { content, keywords: { search_terms: [...change.searchTerms], hidden_terms: [...change.hiddenTerms] } }
  return { content, attributes: { ...change.attributes } }
}

/** The PATCH body that only unlocks `paths` (the content as it is: no new version). */
export function unlockPatch(canonical: Pick<Canonical, 'content'>, paths: readonly string[]): ContentPatch {
  const c = canonical.content
  return { content: { title: c.title, bullets: [...c.bullets], description: c.description }, unlock: [...paths] }
}
