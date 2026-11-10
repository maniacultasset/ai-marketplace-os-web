/**
 * V1.1 size run: after the seller saves a size chart (typed, or a size-chart read they checked),
 * one action makes the size variants from it. The seller ticks the sizes and confirms; nothing is
 * made without that.
 *
 *   POST /products/{id}/size-run  {sizes: [...]}  (product:import, Idempotency-Key)
 *     201 {product_id, variation_theme: 'size', size_run, created: [{id, sku, size}]}
 *     200 the same with `created: []`: every size already exists
 *     422 a variant, a colour style, a barcode / stock reference / own size on a standalone,
 *         a size not on the saved chart; 409 a taken SKU, a listing already sent, a listing
 *         being written
 *
 * SKUs follow the family rule the backend uses (`<style sku>-<SIZE>`); the preview here only
 * shows them, the backend makes them.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef } from 'react'
import { api, unwrap } from '@/api/client'
import { describeError, isApiError } from '@/api/errors'
import { idempotencyHeader, newIdempotencyKey } from '@/api/idempotency'
import type { Schema } from '@/api/types'
import { useKeys } from '@/lib/query-keys'
import type { ProductDetail } from './api'

export type SizeRunOut = Schema<'SizeRunOut'>

export interface SizeOption {
  /** The size as the chart spells it (`XL`). */
  label: string
  /** The variant key (`xl`), as the backend keys a size. */
  key: string
  /** The SKU the variant gets. */
  sku: string
  /** The style already has this size. */
  exists: boolean
}

export interface SizeRunPlan {
  options: SizeOption[]
  /** Why no variant can be made here yet, in plain words; null when the seller can go ahead. */
  blocked: string | null
}

const words = (s: string) => s.split(/\s+/).filter(Boolean)

/** The variant key of a size: lower-cased, spaces collapsed (the import's size key). */
export const sizeKey = (label: string) => words(label).join(' ').toLowerCase()

/** `<style sku>-<SIZE>`: the size upper-cased, each run of spaces as `-`. */
export const sizeSku = (styleSku: string, label: string) => `${styleSku}-${words(label).join('-').toUpperCase()}`

type PlanInput = Pick<
  ProductDetail,
  'sku' | 'parent_product_id' | 'size_chart' | 'size_run' | 'variation_theme' | 'product_identifier' | 'attributes'
>

/**
 * The sizes the saved chart offers, and whether variants can be made from them; null when the
 * action does not apply (a variant, or no saved size chart).
 */
export function sizeRunPlan(p: PlanInput): SizeRunPlan | null {
  if (p.parent_product_id) return null
  const rows = p.size_chart?.rows ?? []
  if (!rows.length) return null
  const have = new Set(p.size_run ?? [])
  const options = rows.map((r) => ({ label: r.size, key: sizeKey(r.size), sku: sizeSku(p.sku, r.size), exists: have.has(sizeKey(r.size)) }))
  let blocked: string | null = null
  if (p.variation_theme === 'color' || p.variation_theme === 'size_color')
    blocked = 'This style is split by colour, so its sizes come from your sheet, one colour at a time.'
  else if (!p.variation_theme && p.product_identifier)
    blocked = 'Remove the barcode first. Each size gets its own barcode once it is a variant.'
  else if (!p.variation_theme && p.attributes?.size != null)
    blocked = 'This product has its own size. Clear it first, then make the size variants.'
  return { options, blocked }
}

const locOf = (err: { details: readonly { loc?: unknown }[] }) => JSON.stringify(err.details.map((d) => d.loc ?? ''))

/** The words for a refused size run. */
export function sizeRunErrorMessage(err: unknown): string {
  if (isApiError(err)) {
    const loc = locOf(err)
    if (err.type === 'SKU_CONFLICT') return 'A SKU for one of these sizes is already used in your catalog. Untick that size, or change that product’s SKU.'
    if (err.type === 'LISTING_BUSY') return 'A listing of this product is being written right now. Try again in a minute.'
    if (err.type === 'INVALID_STATUS_TRANSITION') return 'This product is already on a marketplace, so its sizes can’t change here.'
    if (err.type === 'VARIATION_INVALID') {
      if (loc.includes('product_identifier')) return 'Remove the barcode first. Each size gets its own barcode once it is a variant.'
      if (loc.includes('stock_ref')) return 'Remove the stock reference first. Each size keeps its own stock.'
      if (loc.includes('attributes.size')) return 'This product has its own size. Clear it first, then make the size variants.'
      return 'This style is split by colour, so its sizes come from your sheet.'
    }
    if (err.type === 'VALIDATION_FAILED' && loc.includes('size_chart')) return 'Save the size chart first, then make the size variants.'
    if (err.type === 'VALIDATION_FAILED' && loc.includes('category')) return 'Choose a category first, then make the size variants.'
  }
  return describeError(err)
}

/** POST the ticked sizes. One Idempotency-Key per confirm; a retry of the same confirm reuses it. */
export function useCreateSizeRun(productId: string) {
  const keys = useKeys()
  const qc = useQueryClient()
  const key = useRef<{ sizes: string; key: string } | null>(null)
  return useMutation({
    meta: { toast: false },
    mutationFn: (sizes: readonly string[]): Promise<SizeRunOut> => {
      const body = JSON.stringify(sizes)
      if (key.current?.sizes !== body) key.current = { sizes: body, key: newIdempotencyKey() }
      return unwrap(
        api.POST('/products/{product_id}/size-run', {
          params: { path: { product_id: productId }, header: idempotencyHeader(key.current.key) },
          body: { sizes: [...sizes] },
        }),
      )
    },
    onSuccess: () => {
      key.current = null
      // New variants: the product, its family and its listings (moved back to checking) change.
      void qc.invalidateQueries({ queryKey: keys.products.all() })
      void qc.invalidateQueries({ queryKey: keys.listings.all() })
      void qc.invalidateQueries({ queryKey: keys.issues.all() })
    },
  })
}
