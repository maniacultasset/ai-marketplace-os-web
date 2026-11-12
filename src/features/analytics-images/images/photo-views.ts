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
import { PHOTO_SLOTS, photoSlotsFor, type PhotoSlotDef, type PhotoSlotId } from './report'

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
