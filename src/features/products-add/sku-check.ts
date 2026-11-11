/**
 * The SKU help on the add form (client feedback 11 Nov, item 3), pure part. Contract:
 *   GET  /skus/availability?sku=  (tenant:read)  {sku, available, product_id?, title?, is_variant, deleted}
 *   POST /skus/suggestion  (product:import, Idempotency-Key)  {category?, brand_name?} -> {sku}
 * The SKU is unique in the brand (styles and variants share it; a deleted product's SKU stays
 * taken). The check runs a moment after typing stops, never on every key, and once more just
 * before the save, so a taken SKU is caught before the create answers 409.
 */
import type { Schema } from '@/api/types'
import { SKU_PATTERN } from '@/features/products/schema'

export type SkuAvailability = Schema<'SkuAvailabilityOut'>

/** How long typing must pause before the SKU is checked. */
export const SKU_CHECK_DELAY_MS = 450

export const SKU_HINT = 'Your SKU. Kuinn sends it to Amazon and Flipkart as the seller SKU.'

export type SkuState =
  | { kind: 'idle' }
  | { kind: 'invalid' }
  | { kind: 'checking' }
  | { kind: 'free' }
  | { kind: 'taken'; productId: string | null; title: string | null; isVariant: boolean; deleted: boolean }
  | { kind: 'unknown' }

/**
 * What the field shows for the typed SKU (pure). `settled` is the value the last pause in typing
 * left; `answer` is the check for `settled` (undefined while it runs, null when it failed).
 */
export function skuState(value: string, settled: string, answer: SkuAvailability | null | undefined): SkuState {
  const v = value.trim()
  if (!v) return { kind: 'idle' }
  if (!SKU_PATTERN.test(v)) return { kind: 'invalid' }
  if (settled.trim() !== v || answer === undefined) return { kind: 'checking' }
  if (answer === null || answer.sku !== v) return { kind: 'unknown' }
  if (answer.available) return { kind: 'free' }
  return {
    kind: 'taken',
    productId: answer.product_id ?? null,
    title: answer.title ?? null,
    isVariant: answer.is_variant === true,
    deleted: answer.deleted === true,
  }
}

/** The error a taken SKU shows on the field, and before the save (pure). */
export function takenMessage(sku: string, a: Pick<SkuAvailability, 'title' | 'is_variant' | 'deleted'>): string {
  if (a.deleted) return `${sku} belonged to a deleted product, so it can’t be used again. Use another, or let Kuinn make one.`
  const what = a.is_variant ? 'a size or colour of' : ''
  const name = a.title ? `“${a.title}”` : 'another product'
  return `${sku} is already used by ${what ? `${what} ` : ''}${name}. Use another, or let Kuinn make one.`
}
