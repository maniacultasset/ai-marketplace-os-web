/**
 * "Tell Kuinn about your brand" (client feedback item 19): the seller's brand voice answers.
 *
 * Saved through PATCH /brand-profile `{ brand_description, brand_voice }` (If-Match: the ETag from
 * GET /brand-profile; backend app/services/brand_voice.py `BrandVoice` owns the caps mirrored
 * here). An absent answer is empty; every answer empty saves as no voice. The voice shapes tone
 * and emphasis only: product facts always win.
 */
import type { Schema } from '@/api/types'

export type BrandVoiceOut = Schema<'BrandVoiceOut'>
export type BrandVoiceIn = Schema<'BrandVoice'>
export type PriceSegment = NonNullable<BrandVoiceOut['price_segment']>

export const DESCRIPTION_MAX = 2000
export const AUDIENCE_MAX = 300
export const POSITIONING_MAX = 500
export const EXAMPLE_MAX = 1500
export const PHRASE_MAX = 200
export const WORD_MAX = 60
export const DIFFERENTIATORS_MAX = 8
export const WORDS_MAX = 30
export const CLAIMS_MAX = 15

export const PRICE_SEGMENTS: readonly { value: PriceSegment; label: string; hint: string }[] = [
  { value: 'budget', label: 'Budget', hint: 'Low price, good value' },
  { value: 'mid', label: 'Mid', hint: 'Fair price, everyday quality' },
  { value: 'premium', label: 'Premium', hint: 'Higher price, finer make' },
  { value: 'luxury', label: 'Luxury', hint: 'Top price, rare or crafted' },
]

export interface VoiceDraft {
  description: string
  audience: string
  price_segment: PriceSegment | null
  positioning: string
  differentiators: string[]
  words_to_use: string[]
  words_to_avoid: string[]
  claim_limits: string[]
  example_copy: string
}

export type ListKey = 'differentiators' | 'words_to_use' | 'words_to_avoid' | 'claim_limits'
export type TextKey = 'description' | 'audience' | 'positioning' | 'example_copy'

export const LIST_CAP: Record<ListKey, { items: number; length: number }> = {
  differentiators: { items: DIFFERENTIATORS_MAX, length: PHRASE_MAX },
  words_to_use: { items: WORDS_MAX, length: WORD_MAX },
  words_to_avoid: { items: WORDS_MAX, length: WORD_MAX },
  claim_limits: { items: CLAIMS_MAX, length: PHRASE_MAX },
}
export const TEXT_CAP: Record<TextKey, number> = {
  description: DESCRIPTION_MAX,
  audience: AUDIENCE_MAX,
  positioning: POSITIONING_MAX,
  example_copy: EXAMPLE_MAX,
}

/** The questionnaire's steps, in order. The last one is the read-back summary. */
export const VOICE_STEPS = [
  { id: 'about', title: 'What is your brand?', sub: 'A line or two, in your own words.' },
  { id: 'audience', title: 'Who buys it?', sub: 'Who you make it for, and when they wear it.' },
  { id: 'price', title: 'Where does your price sit?', sub: 'Kuinn matches the words to it. It never writes a price.' },
  { id: 'different', title: 'What makes it different?', sub: 'How you want to be seen, and what sets you apart.' },
  { id: 'words', title: 'Which words fit, and which don’t?', sub: 'Kuinn uses the first and stays away from the second.' },
  { id: 'claims', title: 'Claims you never make', sub: 'For example “No organic claims” or “Never say handmade”.' },
  { id: 'example', title: 'Copy you like', sub: 'A short piece of product copy that sounds like you.' },
  { id: 'summary', title: 'How Kuinn will write for you', sub: 'Check it reads right. You can change any line.' },
] as const

export type VoiceStepId = (typeof VOICE_STEPS)[number]['id']

export const emptyVoiceDraft = (): VoiceDraft => ({
  description: '',
  audience: '',
  price_segment: null,
  positioning: '',
  differentiators: [],
  words_to_use: [],
  words_to_avoid: [],
  claim_limits: [],
  example_copy: '',
})

export function toVoiceDraft(profile: { brand_description?: string | null; brand_voice?: BrandVoiceOut | null } | undefined): VoiceDraft {
  const v = profile?.brand_voice
  return {
    description: profile?.brand_description ?? '',
    audience: v?.audience ?? '',
    price_segment: v?.price_segment ?? null,
    positioning: v?.positioning ?? '',
    differentiators: [...(v?.differentiators ?? [])],
    words_to_use: [...(v?.words_to_use ?? [])],
    words_to_avoid: [...(v?.words_to_avoid ?? [])],
    claim_limits: [...(v?.claim_limits ?? [])],
    example_copy: v?.example_copy ?? '',
  }
}

const textOrNull = (s: string) => (s.trim() ? s.trim() : null)

/** Trimmed, blanks dropped, repeats (any case) dropped, in order: the backend does the same. */
export function cleanList(items: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of items) {
    const item = raw.trim()
    const key = item.toLocaleLowerCase()
    if (!item || seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

/** Add `value` to a list unless it is blank or already there (any case). */
export function addToList(items: readonly string[], value: string): string[] {
  return cleanList([...items, value])
}

export function toVoiceBody(d: VoiceDraft): { brand_description: string | null; brand_voice: BrandVoiceIn | null } {
  const voice: BrandVoiceIn = {
    audience: textOrNull(d.audience),
    price_segment: d.price_segment,
    positioning: textOrNull(d.positioning),
    differentiators: cleanList(d.differentiators),
    words_to_use: cleanList(d.words_to_use),
    words_to_avoid: cleanList(d.words_to_avoid),
    claim_limits: cleanList(d.claim_limits),
    example_copy: textOrNull(d.example_copy),
  }
  return { brand_description: textOrNull(d.description), brand_voice: isVoiceEmpty(voice) ? null : voice }
}

export function isVoiceEmpty(v: BrandVoiceIn | BrandVoiceOut | null | undefined): boolean {
  if (!v) return true
  return (
    !v.audience &&
    !v.price_segment &&
    !v.positioning &&
    !v.differentiators?.length &&
    !v.words_to_use?.length &&
    !v.words_to_avoid?.length &&
    !v.claim_limits?.length &&
    !v.example_copy
  )
}

/** Nothing answered at all (description included): the questionnaire was never done or was cleared. */
export const isDraftEmpty = (d: VoiceDraft) => !textOrNull(d.description) && toVoiceBody(d).brand_voice === null

/** The same answers as the saved profile (so Save has nothing to send). */
export function sameAsSaved(d: VoiceDraft, saved: VoiceDraft): boolean {
  return JSON.stringify(toVoiceBody(d)) === JSON.stringify(toVoiceBody(saved))
}

/** Per-field problems the backend would refuse, in the seller's words. */
export function voiceProblems(d: VoiceDraft): Partial<Record<TextKey | ListKey, string>> {
  const out: Partial<Record<TextKey | ListKey, string>> = {}
  for (const key of Object.keys(TEXT_CAP) as TextKey[]) {
    const max = TEXT_CAP[key]
    if (d[key].trim().length > max) out[key] = `Keep it to ${max.toLocaleString('en-IN')} characters.`
  }
  for (const key of Object.keys(LIST_CAP) as ListKey[]) {
    const cap = LIST_CAP[key]
    const items = cleanList(d[key])
    if (items.length > cap.items) out[key] = `Up to ${cap.items} items.`
    else if (items.some((i) => i.length > cap.length)) out[key] = `Keep each one to ${cap.length} characters.`
  }
  return out
}

/** Which step holds a field (to send the seller back to fix it). */
export const STEP_OF: Record<TextKey | ListKey | 'price_segment', VoiceStepId> = {
  description: 'about',
  audience: 'audience',
  price_segment: 'price',
  positioning: 'different',
  differentiators: 'different',
  words_to_use: 'words',
  words_to_avoid: 'words',
  claim_limits: 'claims',
  example_copy: 'example',
}

const join = (items: readonly string[]) =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
const quoted = (items: readonly string[]) => join(items.map((i) => `“${i}”`))

export interface SummaryLine {
  step: VoiceStepId
  label: string
  text: string
}

/** The read-back, one short line per answer, in step order. Unanswered steps are left out. */
export function voiceSummary(d: VoiceDraft): SummaryLine[] {
  const body = toVoiceBody(d)
  const v = body.brand_voice
  const lines: SummaryLine[] = []
  if (body.brand_description) lines.push({ step: 'about', label: 'Your brand', text: body.brand_description })
  if (!v) return lines
  if (v.audience) lines.push({ step: 'audience', label: 'Writes for', text: v.audience })
  if (v.price_segment) {
    const seg = PRICE_SEGMENTS.find((s) => s.value === v.price_segment)!
    lines.push({ step: 'price', label: 'Price', text: `${seg.label}: ${seg.hint.toLowerCase()}` })
  }
  if (v.positioning) lines.push({ step: 'different', label: 'Presents it as', text: v.positioning })
  if (v.differentiators?.length) lines.push({ step: 'different', label: 'Brings out', text: join(v.differentiators) })
  if (v.words_to_use?.length) lines.push({ step: 'words', label: 'Uses words like', text: quoted(v.words_to_use) })
  if (v.words_to_avoid?.length) lines.push({ step: 'words', label: 'Never uses', text: quoted(v.words_to_avoid) })
  if (v.claim_limits?.length) lines.push({ step: 'claims', label: 'Never claims', text: join(v.claim_limits) })
  if (v.example_copy) lines.push({ step: 'example', label: 'Sounds like', text: v.example_copy })
  return lines
}
