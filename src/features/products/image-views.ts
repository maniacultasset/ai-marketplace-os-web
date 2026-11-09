/**
 * Saved photo views. The product read signs each checked photo for about 10 minutes
 * (`image_details[].view_url`, and `thumbnail_url` for the main photo, also on lists). The links
 * are bearer links: they live only in the query cache, never in storage or logs.
 *
 * Refresh: a product (or list) read is re-run a minute before its earliest link expires, and an
 * `<img>` that fails to load asks for one fresh read (at most every 30 s per product), as the
 * candidate previews do.
 */
import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import type { Schema } from '@/api/types'
import { useKeys } from '@/lib/query-keys'

type ImageDetail = Schema<'ProductImageOut'>

interface WithViews {
  image_details?: readonly ImageDetail[] | null
  thumbnail_url?: string | null
  thumbnail_expires_at?: string | null
}

/** Read again this long before a link expires (the server already states the expiry 30 s early). */
export const VIEW_REFRESH_LEAD_MS = 60_000
/** Never poll faster than this, even when a link is about to expire or already has. */
export const VIEW_REFRESH_MIN_MS = 5_000
/** An image error asks for a fresh read at most this often per product (or list). */
export const VIEW_ERROR_RETRY_MS = 30_000

function expiries(p: WithViews | null | undefined): number[] {
  if (!p) return []
  const out: number[] = []
  if (p.thumbnail_url && p.thumbnail_expires_at) out.push(Date.parse(p.thumbnail_expires_at))
  for (const d of p.image_details ?? []) if (d.view_url && d.view_expires_at) out.push(Date.parse(d.view_expires_at))
  return out.filter((t) => Number.isFinite(t))
}

/**
 * How long until these reads should run again so no shown link expires; false when none holds a
 * link (nothing to refresh).
 */
export function viewRefreshDelay(products: readonly (WithViews | null | undefined)[], now = Date.now()): number | false {
  const all = products.flatMap(expiries)
  if (!all.length) return false
  return Math.max(VIEW_REFRESH_MIN_MS, Math.min(...all) - VIEW_REFRESH_LEAD_MS - now)
}

/** Each image's signed view, by image id. */
export function viewsById(p: WithViews | null | undefined): Map<string, string> {
  const out = new Map<string, string>()
  for (const d of p?.image_details ?? []) if (d.view_url) out.set(d.image_id, d.view_url)
  return out
}

/** The product's main photo view: `thumbnail_url`, else the first main image's view. */
export function mainView(p: WithViews | null | undefined): string | undefined {
  if (p?.thumbnail_url) return p.thumbnail_url
  return (p?.image_details ?? []).find((d) => d.slot === 'main' && d.view_url)?.view_url ?? undefined
}

const lastAsked = new Map<string, number>()

/** Calls `run` unless the same `key` ran within `VIEW_ERROR_RETRY_MS`. Exported for tests. */
export function throttled(key: string, run: () => void, now = Date.now()): boolean {
  const last = lastAsked.get(key)
  if (last !== undefined && now - last < VIEW_ERROR_RETRY_MS) return false
  lastAsked.set(key, now)
  run()
  return true
}

/** For an `<img onError>` of a product's photo: read the product again (throttled). */
export function useRefreshProductViews(productId: string | null | undefined) {
  const keys = useKeys()
  const qc = useQueryClient()
  return useCallback(() => {
    if (!productId) return
    throttled(`product:${productId}`, () => void qc.invalidateQueries({ queryKey: keys.products.detail(productId) }))
  }, [keys, qc, productId])
}

/** For an `<img onError>` of a list thumbnail: read the product lists again (throttled). */
export function useRefreshListViews() {
  const keys = useKeys()
  const qc = useQueryClient()
  return useCallback(() => {
    throttled('products:list', () => void qc.invalidateQueries({ queryKey: keys.products.list() }))
  }, [keys, qc])
}
