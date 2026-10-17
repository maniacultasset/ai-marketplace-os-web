/**
 * Brand profile editing model (pure). Mirrors the backend's TenantPatch
 * (.backend apps/api/app/api/v1/schemas/tenants.py):
 *   name        NonBlank, <= 200 chars, never null
 *   tone        1..2000 chars, `null` clears it
 *   guidelines  <= 100 items, each NonBlank <= 500 chars, never null (`[]` clears)
 *   glossary    <= 500 entries, term -> preferred term, each NonBlank <= 100 chars (`{}` clears)
 * A PATCH carries only the fields that changed (the backend refuses an empty patch).
 */
import type { z } from 'zod'
import type { ErrorDetail, Schema } from '@/api/types'
import { codePoints, freeText, orgName } from '@/lib/validation'

export type TenantOut = Schema<'TenantOut'>
export type TenantPatch = Schema<'TenantPatch'>

export const NAME_MAX = 200
export const TONE_MAX = 2000
export const GUIDELINES_MAX = 100
export const GUIDELINE_MAX = 500
export const GLOSSARY_MAX = 500
export const TERM_MAX = 100

export const PROFILE_FIELDS = ['name', 'tone', 'guidelines', 'glossary'] as const
export type ProfileField = (typeof PROFILE_FIELDS)[number]

export const FIELD_LABEL: Record<ProfileField, string> = {
  name: 'Brand name',
  tone: 'Tone of voice',
  guidelines: 'Guidelines',
  glossary: 'Glossary',
}

export interface GuidelineRow {
  id: string
  text: string
}
export interface GlossaryRow {
  id: string
  avoid: string
  use: string
}

/** What the form edits: raw strings, with stable row ids for React keys. */
export interface ProfileDraft {
  name: string
  tone: string
  guidelines: GuidelineRow[]
  glossary: GlossaryRow[]
}

/** The draft as the backend would store it. */
export interface ProfileValues {
  name: string
  tone: string | null
  guidelines: string[]
  glossary: Record<string, string>
}

let seq = 0
export const rowId = () => `r${++seq}`

export const emptyGuideline = (): GuidelineRow => ({ id: rowId(), text: '' })
export const emptyGlossaryRow = (): GlossaryRow => ({ id: rowId(), avoid: '', use: '' })

export function toDraft(t: TenantOut): ProfileDraft {
  return {
    name: t.name,
    tone: t.tone ?? '',
    guidelines: (t.guidelines ?? []).map((text) => ({ id: rowId(), text })),
    glossary: Object.entries(t.glossary ?? {}).map(([avoid, use]) => ({ id: rowId(), avoid, use })),
  }
}

export function valuesOf(t: TenantOut): ProfileValues {
  return {
    name: t.name,
    tone: t.tone ?? null,
    guidelines: [...(t.guidelines ?? [])],
    glossary: { ...(t.glossary ?? {}) },
  }
}

/** Trim everything; blank tone becomes null; fully blank rows are dropped. */
export function normalize(d: ProfileDraft): ProfileValues {
  const tone = d.tone.trim()
  const glossary: Record<string, string> = {}
  for (const r of d.glossary) {
    const avoid = r.avoid.trim()
    const use = r.use.trim()
    if (!avoid && !use) continue
    glossary[avoid] = use
  }
  return {
    name: d.name.trim(),
    tone: tone ? tone : null,
    guidelines: d.guidelines.map((g) => g.text.trim()).filter(Boolean),
    glossary,
  }
}

function sameMap(a: Record<string, string>, b: Record<string, string>) {
  const ka = Object.keys(a)
  if (ka.length !== Object.keys(b).length) return false
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && b[k] === a[k])
}

export function sameField(field: ProfileField, a: ProfileValues, b: ProfileValues): boolean {
  switch (field) {
    case 'name':
      return a.name === b.name
    case 'tone':
      return (a.tone ?? null) === (b.tone ?? null)
    case 'guidelines':
      return a.guidelines.length === b.guidelines.length && a.guidelines.every((g, i) => g === b.guidelines[i])
    case 'glossary':
      return sameMap(a.glossary, b.glossary)
  }
}

export function changedFields(a: ProfileValues, b: ProfileValues): ProfileField[] {
  return PROFILE_FIELDS.filter((f) => !sameField(f, a, b))
}

/** The PATCH body for the fields the draft changed against `base`, or null when nothing changed. */
export function buildPatch(base: TenantOut, draft: ProfileDraft): TenantPatch | null {
  const before = valuesOf(base)
  const after = normalize(draft)
  const fields = changedFields(before, after)
  if (!fields.length) return null
  const patch: TenantPatch = {}
  for (const f of fields) {
    if (f === 'name') patch.name = after.name
    if (f === 'tone') patch.tone = after.tone
    if (f === 'guidelines') patch.guidelines = after.guidelines
    if (f === 'glossary') patch.glossary = after.glossary
  }
  return patch
}

/** Field errors keyed like the form: `name`, `tone`, `guidelines`, `guidelines.<rowId>`, `glossary.<rowId>.avoid|use`, `glossary`, `profile`. */
export type ProfileErrors = Partial<Record<string, string>>

/** The first message `schema` gives for `value`, or undefined when it passes. */
function issue(schema: z.ZodType<string>, value: string): string | undefined {
  const r = schema.safeParse(value)
  return r.success ? undefined : r.error.issues[0]?.message
}

/** Brand name: needs a letter (not digits or symbols only); digits and brand punctuation are fine. */
const BRAND_NAME = orgName('the brand name', NAME_MAX)
/** Only the length and blank checks, for a name already saved (never block a stored value). */
const BRAND_NAME_STORED = freeText('the brand name', NAME_MAX, { required: true })
const TONE = freeText('the brand voice', TONE_MAX)
const GUIDELINE = freeText('the guideline', GUIDELINE_MAX)
const AVOID = freeText('the term to avoid', TERM_MAX, { required: true })
const USE = freeText('the term to use instead', TERM_MAX, { required: true })

/**
 * Client checks that match the backend's limits (code points, as Python counts them); empty object
 * when valid. With `base`, a brand name that is unchanged from the saved one gets only the length
 * and blank checks, so a name stored before these rules never blocks saving the voice.
 */
export function validateDraft(d: ProfileDraft, base?: Pick<TenantOut, 'name'>): ProfileErrors {
  const e: ProfileErrors = {}
  const unchangedName = base !== undefined && d.name.trim() === base.name.trim()
  const name = issue(unchangedName ? BRAND_NAME_STORED : BRAND_NAME, d.name)
  if (name) e.name = name
  const tone = issue(TONE, d.tone)
  if (tone) e.tone = tone

  const guidelines = d.guidelines.filter((g) => g.text.trim())
  if (guidelines.length > GUIDELINES_MAX) e.guidelines = `Keep it to ${GUIDELINES_MAX} guidelines.`
  for (const g of d.guidelines) {
    const msg = issue(GUIDELINE, g.text)
    if (msg) e[`guidelines.${g.id}`] = msg
  }

  const seen = new Map<string, string>()
  let entries = 0
  for (const r of d.glossary) {
    const avoid = r.avoid.trim()
    const use = r.use.trim()
    if (!avoid && !use) continue
    entries++
    const avoidMsg = issue(AVOID, r.avoid)
    if (avoidMsg) e[`glossary.${r.id}.avoid`] = avoidMsg
    else if (seen.has(avoid)) e[`glossary.${r.id}.avoid`] = 'This term is already in the glossary. Remove one of them.'
    else seen.set(avoid, r.id)
    const useMsg = issue(USE, r.use)
    if (useMsg) e[`glossary.${r.id}.use`] = useMsg
  }
  if (entries > GLOSSARY_MAX) e.glossary = `Keep it to ${GLOSSARY_MAX} terms.`
  return e
}

/** Length as the backend counts it, for the "12 / 200" counters. */
export const fieldLength = (s: string) => codePoints(s.trim())

const SECRET_HINT = 'Remove anything that looks like a password, API key or token.'

/**
 * Map a 422's details onto the form. Pydantic errors come as ["body", field, index|key, ...];
 * the service's own checks (credential scan, chunk caps) come as ["body", "guidelines", i],
 * ["body", "glossary"], ["body", "tone"] or ["body", "profile"] with "Invalid value.".
 * Indexes point into the *normalized* list the PATCH sent, so map them back to row ids.
 */
export function mapServerErrors(
  details: readonly ErrorDetail[],
  draft: ProfileDraft,
): { errors: ProfileErrors; unmapped: ErrorDetail[] } {
  const errors: ProfileErrors = {}
  const unmapped: ErrorDetail[] = []
  const sentGuidelines = draft.guidelines.filter((g) => g.text.trim())
  const service = (msg: string) => msg === 'Invalid value.'
  for (const d of details) {
    const [where, field, sub] = d.loc
    if (where !== 'body') {
      unmapped.push(d)
      continue
    }
    if (field === 'name') errors.name ??= d.msg
    else if (field === 'tone') errors.tone ??= service(d.msg) ? SECRET_HINT : d.msg
    else if (field === 'guidelines') {
      const row = typeof sub === 'number' ? sentGuidelines[sub] : undefined
      const msg = service(d.msg) ? SECRET_HINT : d.msg
      if (row) errors[`guidelines.${row.id}`] ??= msg
      else errors.guidelines ??= msg
    } else if (field === 'glossary') errors.glossary ??= service(d.msg) ? SECRET_HINT : d.msg
    else if (field === 'profile')
      errors.profile ??= 'The voice is too long in total. Shorten the tone, guidelines or glossary.'
    else unmapped.push(d)
  }
  return { errors, unmapped }
}

/**
 * STALE_VERSION recovery. Someone saved `server` after the draft was based on `baseline`.
 * The rebased draft is the server's profile with this user's own changes laid on top, so a
 * re-save sends only the user's fields and never reverts the other person's work.
 * `conflicts` are fields both sides changed: the user decides those.
 */
export function rebase(baseline: TenantOut, server: TenantOut, draft: ProfileDraft) {
  const base = valuesOf(baseline)
  const theirsValues = valuesOf(server)
  const mineValues = normalize(draft)
  const mine = changedFields(base, mineValues)
  const theirs = changedFields(base, theirsValues)
  const conflicts = mine.filter((f) => theirs.includes(f) && !sameField(f, mineValues, theirsValues))
  const next = toDraft(server)
  for (const f of mine) {
    if (f === 'name') next.name = draft.name
    if (f === 'tone') next.tone = draft.tone
    if (f === 'guidelines') next.guidelines = draft.guidelines
    if (f === 'glossary') next.glossary = draft.glossary
  }
  return { draft: next, mine, theirs, conflicts }
}

/** Put one field of `source` into the draft (e.g. "Use their version"). */
export function takeField(draft: ProfileDraft, source: TenantOut, field: ProfileField): ProfileDraft {
  const s = toDraft(source)
  return { ...draft, [field]: s[field] }
}

/** Short human preview of a field value for the stale banner. */
export function previewField(field: ProfileField, t: TenantOut): string {
  const v = valuesOf(t)
  switch (field) {
    case 'name':
      return v.name
    case 'tone':
      return v.tone ?? 'No tone set'
    case 'guidelines':
      return v.guidelines.length ? `${v.guidelines.length} guideline${v.guidelines.length === 1 ? '' : 's'}: ${v.guidelines[0]}${v.guidelines.length > 1 ? ' …' : ''}` : 'No guidelines'
    case 'glossary': {
      const n = Object.keys(v.glossary).length
      const first = Object.entries(v.glossary)[0]
      return n ? `${n} term${n === 1 ? '' : 's'}: ${first![0]} → ${first![1]}${n > 1 ? ' …' : ''}` : 'No glossary terms'
    }
  }
}
