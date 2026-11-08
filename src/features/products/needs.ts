/**
 * SI12 "Needed" chips: what each marketplace needs before it accepts a listing of a category.
 *
 *   GET /catalog/requirements?category=  (tenant:read)  {category, amazon: [key], flipkart: [key]}
 *
 * Every entry is an attribute-dictionary key. A field shows "Flipkart needs this" (or "Amazon and
 * Flipkart need this") only while it is empty, and only for the marketplaces the seller ticked in
 * "Sell on". Keys with no field on our forms (for example `product_dimensions` from a template) are
 * not counted: the seller could not fill them here, so the count would not be true.
 */
import { useQuery } from '@tanstack/react-query'
import { api, unwrap } from '@/api/client'
import type { Schema } from '@/api/types'
import { useKeys } from '@/lib/query-keys'
import { fromPackageOut, packageHasSize, packageHasWeight } from './seller-fields'

export type Requirements = Schema<'RequirementsOut'>
export type Marketplace = Schema<'Marketplace'>

/** A form field and the dictionary keys that make it needed. */
export interface NeedField {
  id: NeedFieldId
  label: string
  keys: readonly string[]
}

export type NeedFieldId =
  | 'brand_name'
  | 'gender'
  | 'identifier'
  | 'fabric_type'
  | 'color'
  | 'mrp'
  | 'selling_price'
  | 'hsn_code'
  | 'package_size'
  | 'package_weight'
  | 'country_of_origin'
  | 'manufacturer'

/** In form order. */
export const NEED_FIELDS: readonly NeedField[] = [
  { id: 'brand_name', label: 'Brand', keys: ['brand_name'] },
  { id: 'identifier', label: 'Barcode', keys: ['identifier'] },
  { id: 'gender', label: 'Audience', keys: ['gender'] },
  { id: 'fabric_type', label: 'Fabric type', keys: ['fabric_type'] },
  { id: 'color', label: 'Colour', keys: ['color'] },
  { id: 'mrp', label: 'MRP', keys: ['mrp'] },
  { id: 'selling_price', label: 'Selling price', keys: ['selling_price'] },
  { id: 'hsn_code', label: 'HSN code', keys: ['hsn_code'] },
  { id: 'package_size', label: 'Package size', keys: ['package_dimensions'] },
  { id: 'package_weight', label: 'Package weight', keys: ['package_weight'] },
  { id: 'country_of_origin', label: 'Country of origin', keys: ['country_of_origin'] },
  { id: 'manufacturer', label: 'Manufacturer', keys: ['manufacturer'] },
]

const NAME: Record<Marketplace, string> = { amazon: 'Amazon', flipkart: 'Flipkart' }
const ORDER: readonly Marketplace[] = ['amazon', 'flipkart']

/** GET /catalog/requirements for one category; off while no category is chosen. */
export function useRequirements(category: string | null | undefined) {
  const keys = useKeys()
  const c = (category ?? '').trim()
  return useQuery({
    queryKey: [...keys.all(), 'catalog', 'requirements', c] as const,
    queryFn: () => unwrap(api.GET('/catalog/requirements', { params: { query: { category: c } } })),
    enabled: c !== '',
    staleTime: 10 * 60_000,
  })
}

/** The marketplaces in `sellOn` that need `field`, in a fixed order. */
export function neededBy(field: NeedField, req: Requirements | null | undefined, sellOn: readonly Marketplace[]): Marketplace[] {
  if (!req) return []
  return ORDER.filter((m) => sellOn.includes(m) && field.keys.some((k) => (req[m] ?? []).includes(k)))
}

/** "Flipkart needs this", "Amazon and Flipkart need this"; null when no ticked marketplace needs it. */
export function neededText(ms: readonly Marketplace[]): string | null {
  if (!ms.length) return null
  if (ms.length === 1) return `${NAME[ms[0]!]} needs this`
  return `${ms.map((m) => NAME[m]).join(' and ')} need this`
}

export type Filled = Partial<Record<NeedFieldId, boolean>>

export interface Need {
  field: NeedField
  by: Marketplace[]
  text: string
}

/** Every empty field a ticked marketplace needs, in form order. A field missing from `filled` counts as filled. */
export function missingNeeds(req: Requirements | null | undefined, sellOn: readonly Marketplace[], filled: Filled): Need[] {
  return NEED_FIELDS.flatMap((field) => {
    if (filled[field.id] !== false) return []
    const by = neededBy(field, req, sellOn)
    const text = neededText(by)
    return text ? [{ field, by, text }] : []
  })
}

/** The "Needed" text for one field id, when it is missing and needed. */
export function needText(needs: readonly Need[], id: NeedFieldId): string | undefined {
  return needs.find((n) => n.field.id === id)?.text
}

/** "2 missing for Flipkart", "3 missing for Amazon and Flipkart". */
export function missingSummary(needs: readonly Need[]): string | null {
  if (!needs.length) return null
  const by = ORDER.filter((m) => needs.some((n) => n.by.includes(m)))
  return `${needs.length} missing for ${by.map((m) => NAME[m]).join(' and ')}`
}

type ProductOut = Schema<'ProductOut'>

/**
 * What a saved product has, for the "Needed" chips. A style holds no barcode (each variant does)
 * and a variant takes its colour and audience from its style, so those count as filled there.
 */
export function productFilled(p: ProductOut, opts: { isVariant: boolean; isStyle: boolean }): Filled {
  const text = (k: string) => {
    const v = p.attributes?.[k]
    return typeof v === 'string' ? v.trim() !== '' : v !== null && v !== undefined
  }
  const pkg = fromPackageOut(p.package)
  return {
    brand_name: !('brand_name_inherited' in p) || !!p.brand_name?.trim(),
    identifier: opts.isStyle || !!p.product_identifier || p.identifier_exemption === true,
    gender: opts.isVariant || !('gender' in p) || !!p.gender,
    fabric_type: text('fabric_type'),
    color: opts.isVariant || text('color'),
    mrp: !!p.mrp,
    selling_price: !!p.selling_price,
    hsn_code: !!p.hsn_code,
    package_size: packageHasSize(pkg),
    package_weight: packageHasWeight(pkg),
    country_of_origin: !!p.country_of_origin,
    manufacturer: !!p.manufacturer?.legal_name,
  }
}
