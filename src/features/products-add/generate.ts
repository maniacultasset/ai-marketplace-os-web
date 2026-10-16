/**
 * "Add marketplace" / "Send to the agent": start AI generation for products on marketplaces.
 * One POST /listings/generate per product x marketplace (the API takes one item per request), each
 * with its own Idempotency-Key, kept for retries of that same item.
 *
 * Backend services/generation.py `_generate_one` decides what is refused, and planGenerate mirrors
 * the parts the client can know up front so the dialog never sends a request it knows will fail:
 *   - a variant (parent_product_id set)           → 422 product_id: generate the style instead;
 *   - a listing already past `created`             → 409 INVALID_STATUS_TRANSITION (without force).
 * Everything else (no template for the category: 422 category; budget: 429) is reported per item.
 */
import { api, unwrap } from '@/api/client'
import { describeError, isApiError } from '@/api/errors'
import { idempotencyHeader, newIdempotencyKey } from '@/api/idempotency'
import type { Schema } from '@/api/types'
import type { Listing, Marketplace, Product } from './catalog-model'

export type JobAccepted = Schema<'JobAccepted'>

export interface GenerateItem {
  product: Pick<Product, 'id' | 'sku' | 'title'>
  marketplace: Marketplace
  key: string
}

export type SkipReason = 'variant' | 'already-listed'

export interface GeneratePlan {
  send: GenerateItem[]
  skipped: { product: Pick<Product, 'id' | 'sku' | 'title'>; marketplace: Marketplace; reason: SkipReason }[]
}

export const SKIP_COPY: Record<SkipReason, string> = {
  variant: 'Variants are listed through their style.',
  'already-listed': 'Already has a listing there.',
}

export function planGenerate(
  products: readonly Pick<Product, 'id' | 'sku' | 'title' | 'parent_product_id'>[],
  marketplaces: readonly Marketplace[],
  listingsOf: (productId: string) => Partial<Record<Marketplace, Pick<Listing, 'status'>>>,
  newKey: () => string = newIdempotencyKey,
): GeneratePlan {
  const plan: GeneratePlan = { send: [], skipped: [] }
  for (const p of products) {
    const product = { id: p.id, sku: p.sku, title: p.title }
    for (const m of marketplaces) {
      if (p.parent_product_id) {
        plan.skipped.push({ product, marketplace: m, reason: 'variant' })
        continue
      }
      const existing = listingsOf(p.id)[m]
      if (existing && existing.status !== 'created') {
        plan.skipped.push({ product, marketplace: m, reason: 'already-listed' })
        continue
      }
      plan.send.push({ product, marketplace: m, key: newKey() })
    }
  }
  return plan
}

export type ItemOutcome =
  | { kind: 'accepted'; item: GenerateItem; accepted: JobAccepted }
  | { kind: 'failed'; item: GenerateItem; error: unknown; message: string }

/** A sentence for a refused generate request. */
export function generateErrorMessage(err: unknown): string {
  if (!isApiError(err)) return describeError(err)
  const field = err.details[0]?.loc?.at(-1)
  if (err.status === 422 && field === 'category') return 'No marketplace template for this category yet.'
  if (err.status === 422 && field === 'product_id') return 'Variants are listed through their style.'
  if (err.type === 'INVALID_STATUS_TRANSITION') return 'Already has a listing there.'
  if (err.status === 404) return 'This product no longer exists.'
  if (err.status === 403) return 'Your role cannot start generation.'
  if (err.status === 429) return err.retryAfter ? `Too many requests. Retry in ${err.retryAfter} s.` : 'The brand’s AI budget or rate limit was reached.'
  return describeError(err)
}

export function generateOne(item: GenerateItem): Promise<JobAccepted> {
  return unwrap(
    api.POST('/listings/generate', {
      params: { header: idempotencyHeader(item.key) },
      body: { product_id: item.product.id, marketplace: item.marketplace, force_regenerate: false },
    }),
  )
}

/**
 * Send items with a small concurrency limit; one failure never stops the rest. A 429 stops sending
 * the remaining items (they are reported as failed with the same reason, ready to retry).
 */
export async function generateMany(
  items: readonly GenerateItem[],
  onProgress?: (done: number) => void,
  send: (item: GenerateItem) => Promise<JobAccepted> = generateOne,
  concurrency = 3,
): Promise<ItemOutcome[]> {
  const out: ItemOutcome[] = new Array(items.length)
  let next = 0
  let done = 0
  let stop: unknown = null
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      const item = items[i]!
      if (stop) {
        out[i] = { kind: 'failed', item, error: stop, message: generateErrorMessage(stop) }
      } else {
        try {
          out[i] = { kind: 'accepted', item, accepted: await send(item) }
        } catch (error) {
          if (isApiError(error) && error.status === 429) stop = error
          out[i] = { kind: 'failed', item, error, message: generateErrorMessage(error) }
        }
      }
      onProgress?.(++done)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
  return out
}
