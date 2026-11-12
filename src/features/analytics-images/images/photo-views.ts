/**
 * Feedback 7 and 8: the photo checklist per category and the size chart flags. Pure.
 *
 *   GET /catalog/requirements?category=   photo_views: [{view, label, slot, role, requirement, why, amazon, flipkart}]
 *   GET /products/{id}                    photo_views: [... + status, image_ids], size_chart_check
 *
 * The checklist is backend data (`services/data/photo_views.json`): each view is required,
 * recommended or optional for a category and marketplace. While the backend has it switched off
 * the lists are empty and the photos card keeps its four fixed tiles (`PHOTO_SLOTS`).
 * Backend reference: apps/api/app/services/photo_views.py.
 */
import type { Schema } from '@/api/types'
import { PHOTO_SLOTS, photoSlotOf, photoSlotsFor, SLOT_LABEL, type ImageRole, type ImageSlot, type PhotoSlotDef, type PhotoSlotId } from './report'

export type PhotoViewRule = Schema<'PhotoViewRuleOut'>
export type PhotoViewState = Schema<'PhotoViewOut'>
export type ViewRequirement = PhotoViewRule['requirement']
export type SizeChartCheck = Schema<'SizeChartCheckOut'>
type Marketplace = Schema<'Marketplace'>

/** The views that are a single-photo tile; the others (lifestyle, packaging label) sit under "More photos". */
const TILE_IDS: readonly PhotoSlotId[] = ['front', 'back', 'close_up', 'size_chart']
const RANK: Record<ViewRequirement, number> = { optional: 0, recommended: 1, required: 2 }

const isTile = (view: string): view is PhotoSlotId => (TILE_IDS as readonly string[]).includes(view)

/**
 * The requirement for the marketplaces the seller sells on: the strictest of theirs. With none
 * ticked (or no per-marketplace value), the rule's own, which is the strictest of all.
 */
export function requirementFor(rule: PhotoViewRule, sellOn?: readonly Marketplace[]): ViewRequirement {
  if (!sellOn?.length) return rule.requirement
  const levels = sellOn.map((m) => rule[m]).filter((x): x is ViewRequirement => !!x)
  if (!levels.length) return 'optional'
  return levels.reduce((a, b) => (RANK[b] > RANK[a] ? b : a))
}

/** The tiles: from the checklist when the backend sends one, else the four fixed tiles. */
export function tilesFor(views: readonly PhotoViewRule[] | null | undefined, opts: { isVariant: boolean; sellOn?: readonly Marketplace[] }): readonly PhotoSlotDef[] {
  if (!views?.length) return photoSlotsFor(opts.isVariant)
  const fixed = new Map(PHOTO_SLOTS.map((d) => [d.id, d]))
  return views.flatMap((v) => {
    if (!isTile(v.view) || (opts.isVariant && v.view === 'size_chart')) return []
    const requirement = requirementFor(v, opts.sellOn)
    const base = fixed.get(v.view)!
    return [{ ...base, label: v.label || base.label, requirement, required: requirement === 'required', hint: v.why || base.hint }]
  })
}

/** Whether the tiles come from the checklist (each tile then shows its own requirement). */
export function fromChecklist(views: readonly unknown[] | null | undefined): boolean {
  return !!views?.length
}

export type ViewStatus = PhotoViewState['status']

export interface ExtraView {
  label: string
  requirement: ViewRequirement
  why: string
  /** Whether a photo meets it: the product read's own status, else from `filled` (a new product). */
  status?: ViewStatus
}

/**
 * "Lifestyle recommended" style lines for the views beyond the tiles that are not optional, each
 * with its status when it is known: a product read's views carry one, and a product not saved yet
 * passes the views its pending photos fill.
 */
export function extraViews(
  views: readonly (PhotoViewRule | PhotoViewState)[] | null | undefined,
  sellOn?: readonly Marketplace[],
  filled?: ReadonlySet<string>,
): ExtraView[] {
  return (views ?? [])
    .filter((v) => !isTile(v.view))
    .map((v): ExtraView => {
      const own = 'status' in v ? v.status : undefined
      const status = own ?? (filled ? (filled.has(v.view) ? 'present' : 'missing') : undefined)
      return { label: v.label, requirement: requirementFor(v, sellOn), why: v.why, ...(status ? { status } : {}) }
    })
    .filter((v) => v.requirement !== 'optional')
}

export interface ViewGap {
  view: string
  label: string
  requirement: ViewRequirement
  /** `missing`, `invalid` (the photo failed its checks), or `unsaved` (a size chart photo but no saved chart). */
  why: 'missing' | 'invalid' | 'unsaved'
}

/**
 * What approval still needs (required) and what is recommended, from a product read. The size
 * chart counts once the seller saved one: a photo alone is not enough where the chart is required.
 */
export function viewGaps(
  views: readonly PhotoViewState[] | null | undefined,
  sizeChart: SizeChartCheck | null | undefined,
  sellOn?: readonly Marketplace[],
): ViewGap[] {
  const out: ViewGap[] = []
  for (const v of views ?? []) {
    const requirement = requirementFor(v, sellOn)
    if (requirement === 'optional') continue
    if (v.view === 'size_chart' && sizeChart) {
      if (!sizeChart.saved) out.push({ view: v.view, label: v.label, requirement, why: v.status === 'present' ? 'unsaved' : 'missing' })
      continue
    }
    if (v.status === 'present') continue
    out.push({ view: v.view, label: v.label, requirement, why: v.status })
  }
  return out
}

/** "Size chart (save the sizes)", "Front (a new photo)", "Back". */
export function gapLabel(g: ViewGap): string {
  if (g.why === 'unsaved') return `${g.label} (save the sizes)`
  if (g.why === 'invalid') return `${g.label} (a new photo)`
  return g.label
}

/** The gaps approval needs, for one short line. */
export function neededForApproval(gaps: readonly ViewGap[]): string[] {
  return gaps.filter((g) => g.requirement === 'required').map(gapLabel)
}

/** The recommended gaps, for one quiet line. */
export function recommendedGaps(gaps: readonly ViewGap[]): string[] {
  return gaps.filter((g) => g.requirement === 'recommended').map(gapLabel)
}

const STATUS_TEXT: Record<ViewStatus, string> = { present: 'added', missing: 'not added yet', invalid: 'needs a new photo' }

/** "Lifestyle recommended (not added yet). Other photos optional." for "More photos". */
export function moreSubtitle(extras: readonly Pick<ExtraView, 'label' | 'requirement' | 'status'>[], fallback: string): string {
  if (!extras.length) return fallback
  const named = extras.map((e) => `${e.label} ${e.requirement}${e.status ? ` (${STATUS_TEXT[e.status]})` : ''}`).join(', ')
  return `${named.charAt(0).toUpperCase()}${named.slice(1)}. Other photos optional.`
}

/**
 * The pending photos of a product not saved yet, against the category's checklist: the required
 * and recommended views with no photo. `hasChart`: the seller typed a size chart.
 */
export function newProductGaps(
  views: readonly PhotoViewRule[] | null | undefined,
  filled: ReadonlySet<string>,
  opts: { hasChart: boolean; sellOn?: readonly Marketplace[] },
): ViewGap[] {
  const out: ViewGap[] = []
  for (const v of views ?? []) {
    const requirement = requirementFor(v, opts.sellOn)
    if (requirement === 'optional') continue
    if (v.view === 'size_chart') {
      if (!opts.hasChart) out.push({ view: v.view, label: v.label, requirement, why: filled.has(v.view) ? 'unsaved' : 'missing' })
      continue
    }
    if (!filled.has(v.view)) out.push({ view: v.view, label: v.label, requirement, why: 'missing' })
  }
  return out
}

/** `size_run`'s match: spaces collapsed, case ignored. */
export const foldSize = (s: string) => s.trim().split(/\s+/).join(' ').toLocaleLowerCase('en')

/** (variant sizes the chart has no row for, chart sizes no variant has), each once, in order. */
export function sizeFlags(chart: readonly string[], sizes: readonly string[]): { missing: string[]; unused: string[] } {
  const inChart = new Set(chart.map(foldSize).filter(Boolean))
  const inSizes = new Set(sizes.map(foldSize).filter(Boolean))
  const once = (list: readonly string[], keep: (f: string) => boolean) => {
    const seen = new Set<string>()
    return list.filter((s) => {
      const f = foldSize(s)
      if (!f || seen.has(f) || !keep(f)) return false
      seen.add(f)
      return true
    })
  }
  return { missing: once(sizes, (f) => !inChart.has(f)), unused: once(chart, (f) => !inSizes.has(f)) }
}

/**
 * The variants' sizes as the backend knows them. With a saved chart: its sizes, less the ones no
 * variant has, plus the ones it lacks. Without one: the style's size run.
 */
export function variantSizes(p: { size_chart?: { rows: readonly { size: string }[] } | null; size_chart_check?: SizeChartCheck | null; size_run?: readonly string[] }): string[] {
  const check = p.size_chart_check
  if (check?.saved && p.size_chart) {
    const unused = new Set((check.unused_sizes ?? []).map(foldSize))
    return [...p.size_chart.rows.map((r) => r.size).filter((s) => !unused.has(foldSize(s))), ...(check.missing_sizes ?? [])]
  }
  return [...(p.size_run ?? [])]
}

/** "S, M and L" (at most 8 named). */
export function sizeList(sizes: readonly string[]): string {
  const shown = sizes.slice(0, 8)
  const more = sizes.length - shown.length
  if (more > 0) return `${shown.join(', ')} and ${more} more`
  if (shown.length <= 1) return shown.join('')
  return `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`
}

/** A saved photo as the product read lists it, for "Change view". */
export interface PlacedPhoto {
  image_id: string
  slot: ImageSlot
  role?: ImageRole | null
  colourway_id?: string | null
}

export interface ViewChoice {
  /** The tile id (`front`, `back`, ...), or the slot for the views under "More photos". */
  key: string
  label: string
  slot: ImageSlot
  role: ImageRole | null
  /** A tile, or one of the kinds under "More photos". */
  group: 'tile' | 'more'
  /** The photo's own view now. */
  current: boolean
  /** Front, Back and Close-up hold one photo per colour: the photo there now swaps into this one's view. */
  swaps: boolean
}

/** The views beyond the tiles, under "More photos": an extra angle, lifestyle, packaging label. */
const MORE_CHOICES: readonly { slot: ImageSlot; label: string }[] = [
  { slot: 'secondary', label: 'Other angle' },
  { slot: 'lifestyle', label: SLOT_LABEL.lifestyle },
  { slot: 'packaging_label', label: SLOT_LABEL.packaging_label },
]

/** The key of the view a saved photo fills: its tile id, else its slot. */
export function viewKeyOf(slot: ImageSlot, role?: ImageRole | null): string {
  return photoSlotOf(slot, role) ?? slot
}

/**
 * Client feedback 7: where a saved photo can move without a new upload. The category's tiles (the
 * checklist, else the four fixed ones; a variant has no size chart), then the "More photos" kinds.
 * A tile whose one photo is taken (same colour) swaps; the photo's own view is marked current.
 */
export function viewChoices(photo: PlacedPhoto, others: readonly PlacedPhoto[], tiles: readonly PhotoSlotDef[]): ViewChoice[] {
  const own = viewKeyOf(photo.slot, photo.role)
  const colour = photo.colourway_id ?? null
  const taken = (key: string) =>
    others.some((o) => o.image_id !== photo.image_id && (o.colourway_id ?? null) === colour && viewKeyOf(o.slot, o.role) === key)
  const single = (slot: ImageSlot, role: ImageRole | null) => slot === 'main' || (slot === 'secondary' && !!role)
  const choices: ViewChoice[] = tiles.map((t) => ({
    key: t.id,
    label: t.label,
    slot: t.slot,
    role: t.role,
    group: 'tile',
    current: t.id === own,
    swaps: t.id !== own && single(t.slot, t.role) && taken(t.id),
  }))
  for (const m of MORE_CHOICES) choices.push({ key: m.slot, label: m.label, slot: m.slot, role: null, group: 'more', current: m.slot === own, swaps: false })
  // A photo in a view this category's list leaves out still shows where it is.
  if (!choices.some((c) => c.current)) {
    const fixed = PHOTO_SLOTS.find((d) => d.id === own)
    if (fixed) choices.unshift({ key: fixed.id, label: fixed.label, slot: fixed.slot, role: fixed.role, group: 'tile', current: true, swaps: false })
  }
  return choices
}
