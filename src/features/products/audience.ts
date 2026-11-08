/**
 * SI8 seller inputs: the audience (`gender`, drives Amazon department and target gender), the brand
 * a product lists under (`brand_name`, else the brand default), and a variant's own axes
 * (`variant_attributes`). SI9: the newest photo read (`photo_read`). Every field is optional at
 * runtime: an older backend omits it, and the screens then hide the row or control.
 */
import type { Schema } from '@/api/types'

type ProductOut = Schema<'ProductOut'>
export type Gender = NonNullable<ProductOut['gender']>
export type PhotoRead = Schema<'PhotoReadOut'>

export const GENDERS: readonly Gender[] = ['women', 'men', 'unisex', 'girls', 'boys', 'baby']

export const GENDER_LABEL: Record<Gender, string> = {
  women: 'Women',
  men: 'Men',
  unisex: 'Unisex',
  girls: 'Girls',
  boys: 'Boys',
  baby: 'Baby',
}

export const AUDIENCE_HINT = 'Who it is for. Amazon needs it to list kurta sets and T-shirts.'
export const BRAND_HINT = 'Leave it on the brand profile unless this product sells under another of your brand names.'

/** The backend sends the field (SI8 or later). */
export const hasAudience = (p: object): boolean => 'gender' in p
export const hasBrandName = (p: object): boolean => 'brand_name' in p

/** Brand row: the effective brand on a single read, and whether it came from the brand profile. */
export function brandView(p: Pick<ProductOut, 'brand_name' | 'brand_name_inherited'>): { name: string | null; inherited: boolean } {
  return { name: p.brand_name?.trim() || null, inherited: p.brand_name_inherited === true }
}

/** A variant's own colour and size from `variant_attributes` (`color`, `size`), labelled. */
export function variantAxes(p: Pick<ProductOut, 'variant_attributes'>): { key: string; label: string; value: string }[] {
  const v = p.variant_attributes ?? {}
  const label: Record<string, string> = { color: 'Colour', size: 'Size' }
  const order = ['color', 'size']
  return Object.entries(v)
    .filter(([, value]) => typeof value === 'string' && value.trim() !== '')
    .sort(([a], [b]) => (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 99 : order.indexOf(b)))
    .map(([key, value]) => ({ key, label: label[key] ?? key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '), value }))
}

/** "Navy · M" for a variant row, or null when the API sends no axes. */
export function variantAxesText(p: Pick<ProductOut, 'variant_attributes'>): string | null {
  const axes = variantAxes(p)
  return axes.length ? axes.map((a) => a.value).join(' · ') : null
}

/* ------------------------------------------------------------------------------------- Photo read */

export interface PhotoReadView {
  chip: 'live' | 'draft' | 'error' | 'not-listed'
  label: string
  detail: string
}

/** SI9 `photo_read`: one chip and one plain line. */
export function photoReadView(r: PhotoRead): PhotoReadView {
  switch (r.status) {
    case 'read':
      return {
        chip: 'live',
        label: 'Photos read',
        detail:
          r.written || r.asked
            ? [r.written ? `${r.written} ${r.written === 1 ? 'detail' : 'details'} filled` : null, r.asked ? `${r.asked} ${r.asked === 1 ? 'question' : 'questions'} for you` : null]
                .filter(Boolean)
                .join(', ') + '.'
            : 'Nothing new to add from the photos.',
      }
    case 'unchanged':
      return { chip: 'draft', label: 'Photos unchanged', detail: 'Same photos as last time, so they were not read again.' }
    case 'failed':
      return { chip: 'error', label: 'Photo read failed', detail: 'The photos could not be read this time. The listing was still saved.' }
    case 'not_read':
      return { chip: 'not-listed', label: 'Photos not read', detail: 'No photo to read, or nothing left to read from them.' }
  }
}
