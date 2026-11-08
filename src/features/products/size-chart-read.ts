/**
 * SI12 size chart read: the seller asks for the sizes on the size-chart photo, checks them in the
 * size chart editor and saves. Nothing is saved by the read itself.
 *
 *   POST /products/{id}/size-chart-read  (product:import, Idempotency-Key)
 *     202 {status: queued|reading, job_id}   a read started: poll the product
 *     200 {status: read|unreadable}          this photo was read before: no new job
 *     422 no size-chart photo (or a variant), 409 the photo is still being checked,
 *     503 AI paused (SI10 codes), 429 past the daily cap
 *   GET /products/{id}  `size_chart_suggestion: {image_id, status, chart, confidence}`
 *
 * The rows go into the editor with the photo's id; saving sends `size_chart` with
 * `size_chart_image_id` (edit-model `buildPatch`).
 */
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { api, unwrap } from '@/api/client'
import { describeError, isApiError } from '@/api/errors'
import { idempotencyHeader, newIdempotencyKey } from '@/api/idempotency'
import type { Schema } from '@/api/types'
import { AI_PAUSED_TEXT, isAiPausedError, markAiPaused } from '@/features/ai-credit/model'
import { useKeys } from '@/lib/query-keys'
import { fetchProduct, productQuery, type ProductDetail } from './api'

export type SizeChartSuggestion = Schema<'SizeChartSuggestionOut'>
export type SizeChartReadStatus = SizeChartSuggestion['status']
type SizeChart = Schema<'SizeChart'>

const FINAL: readonly SizeChartReadStatus[] = ['read', 'unreadable', 'failed', 'unavailable']
export const isFinalRead = (s: SizeChartReadStatus | undefined) => !!s && FINAL.includes(s)

export type ReadState =
  | { kind: 'idle' }
  | { kind: 'reading' }
  | { kind: 'read'; rows: number }
  | { kind: 'unreadable' }
  | { kind: 'failed' }
  | { kind: 'error'; message: string; paused?: boolean }

/** The live size-chart photo of a product (a style or a standalone product), if any. */
export function sizeChartImageId(p: Pick<ProductDetail, 'image_details'>): string | null {
  return (p.image_details ?? []).find((d) => d.slot === 'size_chart')?.image_id ?? null
}

/** The words for a refused start. */
export function readErrorMessage(err: unknown): { message: string; paused?: boolean } {
  if (isAiPausedError(err)) return { message: AI_PAUSED_TEXT, paused: true }
  if (isApiError(err)) {
    if (err.status === 429) return { message: 'Today’s limit for reading photos is used up. Try again tomorrow, or enter the sizes yourself.' }
    if (err.status === 409) return { message: 'The size chart photo is still being checked. Try again in a minute.' }
    if (err.status === 422) return { message: 'Add a size chart photo on the Media tab first.' }
  }
  return { message: describeError(err) }
}

/** What a finished read means for the seller. */
export function outcomeOf(s: SizeChartSuggestion | null | undefined, imageId: string): ReadState | null {
  if (!s || s.image_id !== imageId || !isFinalRead(s.status)) return null
  if (s.status === 'read' && s.chart?.rows.length) return { kind: 'read', rows: s.chart.rows.length }
  if (s.status === 'read' || s.status === 'unreadable') return { kind: 'unreadable' }
  return { kind: 'failed' }
}

const POLL_MS = 1500
const POLL_FOR_MS = 120_000

/**
 * Start a read and follow it on the product read. `onRead` gets the chart and the photo id once
 * the read has rows; the caller loads them into the editor.
 */
export function useSizeChartRead(productId: string, onRead: (chart: SizeChart, imageId: string) => void) {
  const keys = useKeys()
  const qc = useQueryClient()
  const [state, setState] = useState<ReadState>({ kind: 'idle' })
  const alive = useRef(true)
  const onReadRef = useRef(onRead)
  useEffect(() => {
    onReadRef.current = onRead
  })
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const settle = (p: ProductDetail, imageId: string): boolean => {
    const s = p.size_chart_suggestion
    const out = outcomeOf(s, imageId)
    if (!out) return false
    if (out.kind === 'read' && s?.chart) onReadRef.current(s.chart, imageId)
    setState(out)
    return true
  }

  const follow = async (imageId: string) => {
    const until = Date.now() + POLL_FOR_MS
    while (alive.current && Date.now() < until) {
      const p = await fetchProduct(productId)
      if (!alive.current) return
      qc.setQueryData(productQuery(keys, productId).queryKey, (old) => (old ? { ...old, size_chart_suggestion: p.size_chart_suggestion } : p))
      if (settle(p, imageId)) return
      await new Promise((r) => setTimeout(r, POLL_MS))
    }
    if (alive.current) setState({ kind: 'failed' })
  }

  const start = async () => {
    setState({ kind: 'reading' })
    try {
      const out = await unwrap(
        api.POST('/products/{product_id}/size-chart-read', {
          params: { path: { product_id: productId }, header: idempotencyHeader(newIdempotencyKey()) },
        }),
      )
      await follow(out.image_id)
    } catch (err) {
      if (isAiPausedError(err)) markAiPaused()
      if (alive.current) setState({ kind: 'error', ...readErrorMessage(err) })
    }
  }

  return { state, start, reset: () => setState({ kind: 'idle' }) }
}
