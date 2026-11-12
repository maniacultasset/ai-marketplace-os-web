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
 *     checks still decide). The marketplace's limits and rules come from GET
 *     /listings/{id}/requirements (feedback item 16: the same RuleSet and template the checks run
 *     on), never from a copy here. Until it answers, a counter shows the count alone;
 *   - each finding and each 422 refusal sits beside the field it names (`fieldKey`), while
 *     editing too; the card lists only what no field of it shows.
 */
import type { Schema } from '@/api/types'
import { codePoints, CONTROL_MSG, hasStrayControlChars } from '@/lib/validation'
import { BULLET_MAX, BULLETS_MAX, DESCRIPTION_MAX, TITLE_MAX } from './review-model'

export type Section = 'title' | 'bullets' | 'description' | 'keywords' | 'attributes'
type Canonical = Schema<'CanonicalListing'>
export type AttributeValue = NonNullable<Canonical['attributes']>[string]

const fmt = (n: number) => n.toLocaleString('en-IN')

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

export type ListingRequirements = Schema<'ListingRequirementsOut'>
export type FieldRequirement = Schema<'FieldRequirementOut'>
export type AttributeRequirement = Schema<'AttributeRequirementOut'>

/** The marketplace's limits for the counters and warnings; null where the marketplace sets none. */
export interface SectionLimits {
  title: number | null
  bullets: number | null
  bullet: number | null
  description: number | null
  /** Amazon's backend keywords: every term joined by single spaces, in UTF-8 bytes. */
  hiddenBytes: number | null
}

const NO_LIMITS: SectionLimits = { title: null, bullets: null, bullet: null, description: null, hiddenBytes: null }

/** The rule summary of one field path (`content.title`, `*`, …), if the marketplace has one. */
export function fieldRules(req: ListingRequirements | null | undefined, path: FieldRequirement['path']): FieldRequirement | undefined {
  return req?.fields?.find((f) => f.path === path)
}

export function limitsFrom(req: ListingRequirements | null | undefined): SectionLimits {
  if (!req) return NO_LIMITS
  return {
    title: fieldRules(req, 'content.title')?.max_chars ?? null,
    bullets: fieldRules(req, 'content.bullets')?.max_items ?? null,
    bullet: fieldRules(req, 'content.bullets[*]')?.max_chars ?? null,
    description: fieldRules(req, 'content.description')?.max_chars ?? null,
    hiddenBytes: fieldRules(req, 'keywords.hidden_terms')?.max_bytes ?? null,
  }
}

/** "up to 200 characters, at least 5" for one field's length and count rules ('' for none). */
export function lengthText(f: FieldRequirement | undefined, items = 'items'): string {
  if (!f) return ''
  const parts: string[] = []
  const max: [number | null | undefined, string][] = [
    [f.max_chars, 'characters'],
    [f.max_bytes, 'bytes'],
    [f.max_words, 'words'],
  ]
  const min: [number | null | undefined, string][] = [
    [f.min_chars, 'characters'],
    [f.min_bytes, 'bytes'],
    [f.min_words, 'words'],
  ]
  for (const [n, unit] of max) if (n) parts.push(`up to ${fmt(n)} ${unit}`)
  for (const [n, unit] of min) if (n) parts.push(`at least ${fmt(n)} ${unit}`)
  if (f.max_items) parts.push(`up to ${fmt(f.max_items)} ${items}`)
  if (f.min_items) parts.push(`at least ${fmt(f.min_items)} ${items}`)
  return parts.join(', ')
}

const capital = (t: string) => (t ? t[0]!.toUpperCase() + t.slice(1) : t)

export interface BannedList {
  label: string
  terms: readonly string[]
  count: number
}

export interface SectionRuleView {
  /** Short plain lines: the limits, then the other rules. */
  lines: string[]
  banned: BannedList[]
}

/** What the marketplace asks of one section, in plain lines (pure; the card renders it). */
export function sectionRules(section: Exclude<Section, 'attributes'>, req: ListingRequirements | null | undefined): SectionRuleView {
  const lines: string[] = []
  const banned: BannedList[] = []
  const add = (f: FieldRequirement | undefined, label: string | null, items?: string) => {
    if (!f) return
    const len = lengthText(f, items)
    if (len) lines.push(label ? `${label}: ${len}.` : `${capital(len)}.`)
    lines.push(...(f.rules ?? []))
    if (f.banned_count) banned.push({ label: label ? `Not allowed in ${label.toLowerCase()}` : 'Not allowed here', terms: f.banned_terms ?? [], count: f.banned_count })
  }
  if (section === 'title') {
    add(fieldRules(req, 'content.title'), null)
    // The rules for every text field are said once, on the first card.
    const all = fieldRules(req, '*')
    if (all) {
      lines.push(...(all.rules ?? []))
      if (all.banned_count) banned.push({ label: 'Not allowed anywhere in the text', terms: all.banned_terms ?? [], count: all.banned_count })
    }
  } else if (section === 'bullets') {
    const list = fieldRules(req, 'content.bullets')
    const each = fieldRules(req, 'content.bullets[*]')
    const parts = [lengthText(list, 'key features'), each ? lengthText(each).replace(/^up to/, 'each up to').replace(/^at least/, 'each at least') : '']
    const len = parts.filter(Boolean).join(', ')
    if (len) lines.push(`${capital(len)}.`)
    for (const f of [list, each]) {
      lines.push(...(f?.rules ?? []))
      if (f?.banned_count) banned.push({ label: 'Not allowed in key features', terms: f.banned_terms ?? [], count: f.banned_count })
    }
  } else if (section === 'description') {
    add(fieldRules(req, 'content.description'), null)
  } else {
    add(fieldRules(req, 'keywords.search_terms'), 'Search terms', 'terms')
    const hidden = fieldRules(req, 'keywords.hidden_terms')
    if (hidden?.max_bytes) {
      lines.push(`Backend keywords: up to ${fmt(hidden.max_bytes)} bytes in all, counted with one space between terms.`)
      lines.push(...(hidden.rules ?? []))
      if (hidden.banned_count) banned.push({ label: 'Not allowed in backend keywords', terms: hidden.banned_terms ?? [], count: hidden.banned_count })
    } else add(hidden, 'Backend keywords', 'terms')
  }
  return { lines, banned }
}

/* ---- where a finding or a refusal sits ---- */

/**
 * The field a finding or a 422 path names, as the cards place it: `content.bullets.2` (a 422 loc)
 * and `content.bullets[2]` are one bullet; a search term's index is its list; `attributes.color.0`
 * is the color row. Null for no path.
 */
export function fieldKey(path: string | null | undefined): string | null {
  if (!path) return null
  const p = path.trim().replace(/\.(\d+)(?=\.|$)/g, '[$1]')
  if (/^content\.bullets\[\d+\]/.test(p)) return /^content\.bullets\[\d+\]/.exec(p)![0]
  for (const list of ['keywords.search_terms', 'keywords.hidden_terms']) if (p.startsWith(list)) return list
  const attr = /^attributes\.([a-z0-9_]+)/.exec(p)
  if (attr) return `attributes.${attr[1]}`
  return p
}

/* ---- attribute rows ---- */

export type RequirementLevel = AttributeRequirement['level']

export interface AttributeRow {
  key: string
  /** The listing's value; undefined for a key the marketplace asks for that the listing lacks. */
  value?: AttributeValue
  requirement?: AttributeRequirement
}

/** The listing's attributes, then the required, conditional and recommended keys it lacks. */
export function attributeRows(
  attributes: Record<string, AttributeValue>,
  req: ListingRequirements | null | undefined,
  findingKeys: Iterable<string> = [],
): AttributeRow[] {
  const byKey = new Map((req?.attributes ?? []).map((a) => [a.key, a]))
  const keys = Object.keys(attributes).sort()
  const rows: AttributeRow[] = keys.map((key) => ({ key, value: attributes[key], requirement: byKey.get(key) }))
  const have = new Set(keys)
  const wanted = new Set<string>()
  for (const a of req?.attributes ?? []) if (a.level === 'required' || a.level === 'conditional' || a.level === 'recommended') wanted.add(a.key)
  // A key a finding names (MISSING_ATTRIBUTE) gets its row even when the rules list was not read.
  for (const k of findingKeys) if (k.startsWith('attributes.')) wanted.add(k.slice('attributes.'.length))
  const missing = [...wanted].filter((k) => !have.has(k))
  const order: RequirementLevel[] = ['required', 'conditional', 'recommended', 'optional', 'unsupported']
  missing.sort((a, b) => order.indexOf(byKey.get(a)?.level ?? 'optional') - order.indexOf(byKey.get(b)?.level ?? 'optional') || a.localeCompare(b))
  return [...rows, ...missing.map((key) => ({ key, requirement: byKey.get(key) }))]
}

export const LEVEL_LABEL: Partial<Record<RequirementLevel, string>> = {
  required: 'Required',
  conditional: 'Required here',
  recommended: 'Recommended',
  unsupported: 'Not used',
}

/** "Cotton, Silk and 4 more" for an allowed-values hint ('' for any value). */
export function allowedText(a: AttributeRequirement | undefined, shown = 6): string {
  const values = a?.allowed_values ?? []
  if (!values.length) return ''
  const total = Math.max(a?.allowed_count ?? 0, values.length)
  const head = values.slice(0, shown).join(', ')
  return total > shown ? `${head} and ${fmt(total - shown)} more` : head
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
export function overLimit(count: number, limit: number | null, mp: string, unit: string): string | null {
  return limit != null && count > limit ? `${mp} allows ${fmt(limit)} ${unit}. Shorten it, or this version will be blocked by the checks.` : null
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
