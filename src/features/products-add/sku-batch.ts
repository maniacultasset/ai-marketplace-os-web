/**
 * The duplicate SKU check before a variants save or a bulk upload (client feedback 11 Nov, item 3).
 * Contract:
 *   POST /skus/availability-check  (tenant:read)  {skus: 1-1000}  ->  {checked, taken: SkuAvailabilityOut[]}
 * Only the taken SKUs come back, each once. The rules are those of the single check (sku-check.ts):
 * styles and variants share the SKUs, a deleted product's SKU stays taken, another brand's never
 * counts. Repeats inside one submission are found here, without the server.
 *
 * What a clash means differs by screen, as the import treats it (backend services/imports/runner.py):
 * - variants grid: a SKU held by this style's own variant updates it; one held by any other product
 *   is a clash; a deleted product's SKU brings that product back as this variant (a note).
 * - bulk upload: any existing SKU updates that product (a note); one held by a variant, on a row
 *   with no parent_style_id, fails the row; every repeat after the first row fails.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { api, unwrap } from '@/api/client'
import { SKU_PATTERN } from '@/features/products/schema'
import { useKeys } from '@/lib/query-keys'
import type { SkuAvailability } from './sku-check'
import { SKU_CHECK_DELAY_MS } from './sku-check'
import type { VariantRow } from './variants-model'

/** The most SKUs one call takes; a longer list is sent in chunks. */
export const SKU_BATCH_MAX = 1000

export type TakenSkus = ReadonlyMap<string, SkuAvailability>

/** The distinct, well-formed SKUs to send, in first-seen order (pure). */
export function checkable(skus: readonly string[]): string[] {
  const out = new Set<string>()
  for (const raw of skus) {
    const s = raw.trim()
    if (s && SKU_PATTERN.test(s) && !s.includes('\u0000')) out.add(s)
  }
  return [...out]
}

/** Split into calls of at most SKU_BATCH_MAX (pure). */
export function chunks<T>(xs: readonly T[], size = SKU_BATCH_MAX): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size))
  return out
}

export async function fetchTakenSkus(skus: readonly string[]): Promise<TakenSkus> {
  const taken = new Map<string, SkuAvailability>()
  for (const part of chunks(checkable(skus))) {
    const res = await unwrap(api.POST('/skus/availability-check', { body: { skus: part } }))
    for (const t of res.taken) taken.set(t.sku, t)
  }
  return taken
}

/**
 * The taken SKUs among `skus`, checked a moment after they stop changing. `fresh()` checks the
 * current list now (from the cache when it was just checked), for the save.
 */
export function useTakenSkus(skus: readonly string[], enabled = true) {
  const keys = useKeys()
  const qc = useQueryClient()
  const list = useMemo(() => checkable(skus), [skus])
  const id = list.join('\n')
  const [settled, setSettled] = useState(id)
  useEffect(() => {
    const t = setTimeout(() => setSettled(id), SKU_CHECK_DELAY_MS)
    return () => clearTimeout(t)
  }, [id])
  const key = (k: string) => [...keys.all(), 'skus', 'availability-check', k] as const
  const query = useQuery({
    queryKey: key(settled),
    queryFn: () => fetchTakenSkus(settled ? settled.split('\n') : []),
    enabled: enabled && settled !== '',
    staleTime: 15_000,
    retry: false,
  })
  // While the list settles, a check the save just made for it already answers.
  const current = settled === id ? (query.isError ? undefined : query.data) : qc.getQueryData<TakenSkus>(key(id))
  return {
    /** The answer for the current list, or undefined while it is checked (or the check failed). */
    taken: current,
    failed: settled === id && query.isError,
    fresh: (): Promise<TakenSkus> =>
      id === '' ? Promise.resolve(new Map()) : qc.fetchQuery({ queryKey: key(id), queryFn: () => fetchTakenSkus(list), staleTime: 15_000, retry: false }),
  }
}

const holder = (t: SkuAvailability) => {
  const name = t.title ? `“${t.title}”` : 'another product'
  return t.is_variant ? `a size or colour of ${name}` : name
}

export interface VariantSkuCheck {
  /** `<cellKey>.sku` → what is wrong (the save waits for these). */
  errors: Record<string, string>
  /** `<cellKey>.sku` → a note that does not stop the save. */
  notes: Record<string, string>
}

/**
 * The grid's SKUs against the brand (pure). `ownIds` are the style and its saved variants: a SKU
 * they hold is updated in place, never a clash.
 */
export function variantSkuClashes(rows: readonly VariantRow[], taken: TakenSkus, ownIds: ReadonlySet<string>): VariantSkuCheck {
  const errors: Record<string, string> = {}
  const notes: Record<string, string> = {}
  for (const r of rows) {
    const t = taken.get(r.sku)
    if (!t) continue
    if (t.deleted) notes[`${r.key}.sku`] = `${r.sku} belonged to a deleted product. Saving brings it back as this variant. Change the SKU if you don’t want that.`
    else if (!t.product_id || !ownIds.has(t.product_id)) errors[`${r.key}.sku`] = `${r.sku} is already used by ${holder(t)}. Give this variant another SKU.`
  }
  return { errors, notes }
}

export interface CsvSkuRow {
  /** The CSV record number, header = 1 (the import report's `row_number`). */
  row: number
  sku: string
  /** The row names a style in parent_style_id. */
  hasParent: boolean
}

export interface SkuRepeat {
  sku: string
  /** Every row with this SKU, the first one included. */
  rows: number[]
}

/** SKUs used on more than one row: every repeat after the first row fails (pure; runner `mark_duplicates`). */
export function repeatedSkus(rows: readonly CsvSkuRow[]): SkuRepeat[] {
  const at = new Map<string, number[]>()
  for (const r of rows) at.set(r.sku, [...(at.get(r.sku) ?? []), r.row])
  return [...at].flatMap(([sku, rs]) => (rs.length > 1 ? [{ sku, rows: rs }] : []))
}

export interface CsvSkuFinding {
  row: number
  sku: string
  message: string
}

export interface CsvSkuFindings {
  /** Rows the import will fail. */
  fails: CsvSkuFinding[]
  /** Rows that update or bring back a product already in the brand. */
  updates: CsvSkuFinding[]
}

/** The file's SKUs against the brand (pure). Only each SKU's first row is judged: repeats fail anyway. */
export function csvSkuFindings(rows: readonly CsvSkuRow[], taken: TakenSkus): CsvSkuFindings {
  const fails: CsvSkuFinding[] = []
  const updates: CsvSkuFinding[] = []
  const seen = new Set<string>()
  for (const r of rows) {
    if (seen.has(r.sku)) continue
    seen.add(r.sku)
    const t = taken.get(r.sku)
    if (!t) continue
    if (t.deleted) updates.push({ row: r.row, sku: r.sku, message: `${r.sku} belonged to a deleted product. This row brings it back.` })
    else if (t.is_variant && !r.hasParent)
      fails.push({ row: r.row, sku: r.sku, message: `${r.sku} is ${holder(t)}. Add its style in parent_style_id, or use a new SKU.` })
    else updates.push({ row: r.row, sku: r.sku, message: `${r.sku} updates ${t.is_variant ? holder(t) : (t.title ? `“${t.title}”` : 'the product that has it')}.` })
  }
  return { fails, updates }
}
