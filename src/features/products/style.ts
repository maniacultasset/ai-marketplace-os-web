/**
 * Style (`style`): Amazon's required "Style" for apparel (18 Nov: a T-shirt was refused with
 * "'Style' is required but missing"). The seller types it or taps a suggestion; left empty, the
 * backend derives it from the seller's own facts (T-shirts: neckline, else fit; kurta sets: kurta
 * style; bottomwear: fit and leg style). Pure.
 */
import { isBottomwear } from './size-profile'

/** The apparel categories whose Amazon template needs a Style. */
export const STYLE_CATEGORIES: readonly string[] = ['tshirts', 'ethnic_wear_kurta_sets', 'jeans', 'trousers', 'track_pants', 'shorts', 'skirts']

/** Tap suggestions for Style, per category. The seller can always type their own words. */
export const STYLE_SUGGESTIONS: Readonly<Record<string, readonly string[]>> = {
  tshirts: ['Round Neck', 'Polo', 'V-Neck', 'Henley', 'Oversized', 'Graphic Print'],
  ethnic_wear_kurta_sets: ['Straight', 'A-Line', 'Anarkali', 'Kaftan', 'Angrakha'],
  jeans: ['Slim Fit', 'Skinny', 'Straight', 'Bootcut', 'Relaxed', 'Wide Leg'],
  trousers: ['Slim Fit', 'Skinny', 'Straight', 'Bootcut', 'Relaxed', 'Wide Leg'],
  track_pants: ['Jogger', 'Straight', 'Cargo'],
  shorts: ['Casual', 'Cargo', 'Denim', 'Sports'],
  skirts: ['A-Line', 'Pencil', 'Flared', 'Pleated'],
}

export const STYLE_HINT = 'Amazon needs this. If you leave it empty, Kuinn uses your neckline or fit.'

const slug = (c: string | null | undefined) => (c ?? '').trim()

export const isStyleCategory = (category: string | null | undefined) => STYLE_CATEGORIES.includes(slug(category))

/** The Style suggestions for a category; none outside apparel. */
export function styleSuggestions(category: string | null | undefined): readonly string[] {
  return STYLE_SUGGESTIONS[slug(category)] ?? []
}

/**
 * Whether the backend can derive a Style from the seller's own facts (same order as the backend):
 * T-shirts from the neckline or fit, kurta sets from the kurta style, bottomwear from fit or leg style.
 */
export function styleDerivable(category: string | null | undefined, attrs: Readonly<Record<string, string | undefined>>): boolean {
  const has = (k: string) => !!(attrs[k] ?? '').trim()
  const c = slug(category)
  if (c === 'tshirts') return has('neckline') || has('fit')
  if (c === 'ethnic_wear_kurta_sets') return has('kurta_type')
  if (isBottomwear(c)) return has('fit') || has('leg_style')
  return false
}

/** Style counts as given: the seller's own words, or a value the backend derives. */
export function styleFilled(category: string | null | undefined, attrs: Readonly<Record<string, string | undefined>>): boolean {
  return !!(attrs.style ?? '').trim() || styleDerivable(category, attrs)
}
