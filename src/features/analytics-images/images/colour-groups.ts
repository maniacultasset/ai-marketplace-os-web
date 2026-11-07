/**
 * Per-colour photos (SI1 colourways). A style lists its `colourways`; each image in
 * `image_details` carries the `colourway_id` it was uploaded under, or none when it is for every
 * colour. The main image is kept once per colour (services/images.py `live_main`), so "has a main"
 * is per group.
 */
import type { Schema } from '@/api/types'
import { imageIdFromKey } from './report'

export type Colourway = Schema<'ColourwayOut'>
export type ProductImageDetail = Schema<'ProductImageOut'>

/** The group key for images with no colourway (they apply to every colour). */
export const ALL_COLOURS = 'all'

export interface ColourGroup {
  /** A colourway id, or `ALL_COLOURS`. */
  key: string
  colourwayId: string | null
  label: string
  /** Storage keys in the order the API lists them. */
  keys: string[]
  hasMain: boolean
}

export interface ColourSource {
  images?: readonly string[]
  image_details?: readonly ProductImageDetail[]
  colourways?: readonly Colourway[]
}

/** Readable colour name: "black" stays as typed, an empty name falls back to its SKU part. */
export function colourLabel(c: Colourway): string {
  return c.colour.trim() || c.colour_sku || 'Colour'
}

/**
 * The product's images grouped as "All colours" first, then one group per colourway in the
 * style's order (empty groups included, so each colour can be given photos). An image filed under
 * a colourway the style no longer lists goes to a trailing "Other colour" group.
 */
export function colourGroups(p: ColourSource): ColourGroup[] {
  const details = new Map<string, ProductImageDetail>()
  for (const d of p.image_details ?? []) details.set(d.image_id, d)
  const colourways = p.colourways ?? []
  const groups: ColourGroup[] = [
    { key: ALL_COLOURS, colourwayId: null, label: 'All colours', keys: [], hasMain: false },
    ...colourways.map((c) => ({ key: c.id, colourwayId: c.id, label: colourLabel(c), keys: [], hasMain: false })),
  ]
  const byKey = new Map(groups.map((g) => [g.key, g]))
  let other: ColourGroup | null = null
  for (const key of p.images ?? []) {
    const id = imageIdFromKey(key)
    const d = id ? details.get(id) : undefined
    const cw = d?.colourway_id ?? null
    let g = byKey.get(cw ?? ALL_COLOURS)
    if (!g) {
      other ??= { key: 'other', colourwayId: null, label: 'Other colour', keys: [], hasMain: false }
      g = other
    }
    g.keys.push(key)
    if (d?.slot === 'main') g.hasMain = true
  }
  return other ? [...groups, other] : groups
}

/** Whether the colour picked for an upload already has a main image (a new main replaces it). */
export function colourHasMain(p: ColourSource, colourwayId: string | null): boolean {
  return colourGroups(p).some((g) => g.colourwayId === colourwayId && g.key !== 'other' && g.hasMain)
}

/** Colours (not "All colours") that have no photo of their own yet. */
export function coloursWithoutPhotos(p: ColourSource): ColourGroup[] {
  return colourGroups(p).filter((g) => g.colourwayId !== null && g.keys.length === 0)
}
