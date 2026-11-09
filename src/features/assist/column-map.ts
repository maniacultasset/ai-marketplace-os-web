/**
 * SI14 spreadsheet column map: the seller checks how each header was matched before any row is
 * processed. Contract (backend services/imports/column_maps.py):
 *   POST /imports/column-maps {headers}          201 ready | 202 mapping (Kuinn maps the leftovers)
 *   GET  /imports/column-maps/{map_id}           poll while `mapping`
 *   POST /imports/column-maps/{map_id}/confirm   {mappings:[{position, key|null}]}, from ready|failed
 *   POST /products/bulk  `column_map_id`          applies the confirmed map before the header check
 * A backend without these routes answers 404 or 405: the upload then works exactly as before.
 * The routes have no switch of their own (only `COLUMN_MAP_AI_ENABLED` for the leftovers), so the
 * review shows only when the backend asked Kuinn (`columnReviewOn`). With the switch off the upload
 * keeps today's read-only table and name matching, and no `column_map_id` is sent.
 * Sample cells are never sent: the review needs only the headers.
 */
import { useMutation, useQuery } from '@tanstack/react-query'
import { api, unwrap } from '@/api/client'
import { idempotencyHeader, newIdempotencyKey } from '@/api/idempotency'
import type { Schema } from '@/api/types'
import { COLUMN_GROUPS } from '@/features/imports/csv-template'
import { useKeys } from '@/lib/query-keys'

export type ColumnMap = Schema<'ColumnMapOut'>
export type ColumnMapEntry = Schema<'ColumnMapEntry'>
export type MapMethod = ColumnMapEntry['method']

/** Below this a mapping is confirmed or changed by the seller first. */
export const REVIEW_BELOW = 0.8

export const METHOD_LABEL: Record<MapMethod, string> = {
  exact: 'Exact name',
  alias: 'Known name',
  fuzzy: 'Close match',
  ai: 'Kuinn',
  none: 'No match',
}

/** position -> chosen key; null means "don't import this column". */
export type Answers = Readonly<Record<number, string | null>>

/**
 * Whether the column review is on: the create answered `mapping` (Kuinn maps the leftovers), or a
 * column carries Kuinn's match. Neither happens while `COLUMN_MAP_AI_ENABLED` is off.
 */
export const columnReviewOn = (m: Pick<ColumnMap, 'status' | 'mappings'>) => m.status === 'mapping' || m.mappings.some((e) => e.method === 'ai')

export const needsAnswer = (e: ColumnMapEntry) => e.needs_review || e.confidence < REVIEW_BELOW

export function resolvedKey(e: ColumnMapEntry, answers: Answers): string | null {
  return e.position in answers ? (answers[e.position] ?? null) : (e.key ?? null)
}

/** Columns that still wait for the seller. */
export function unanswered(map: Pick<ColumnMap, 'mappings'>, answers: Answers): ColumnMapEntry[] {
  return map.mappings.filter((e) => needsAnswer(e) && !(e.position in answers))
}

/** Positions whose field another column already fills (the backend refuses two columns per field). */
export function duplicatePositions(map: Pick<ColumnMap, 'mappings'>, answers: Answers): Set<number> {
  const by = new Map<string, number[]>()
  for (const e of map.mappings) {
    const k = resolvedKey(e, answers)
    if (k) by.set(k, [...(by.get(k) ?? []), e.position])
  }
  return new Set([...by.values()].filter((p) => p.length > 1).flat())
}

export function confirmBody(map: Pick<ColumnMap, 'mappings'>, answers: Answers): Schema<'ColumnMapConfirm'> {
  return { mappings: map.mappings.map((e) => ({ position: e.position, key: resolvedKey(e, answers) })) }
}

/** The fields a column may fill, in the template's order. */
export const FIELD_CHOICES: readonly string[] = [
  ...new Set(COLUMN_GROUPS.filter((g) => !g.notStored && !g.photoLinks).flatMap((g) => g.columns)),
]

/** The backend takes 1 to 200 headers of 1 to 120 characters, distinct once trimmed and lower-cased. */
export function mappableHeaders(headers: readonly string[]): boolean {
  if (headers.length < 1 || headers.length > 200) return false
  const norm = headers.map((h) => h.replace(/^﻿/, '').trim().toLowerCase())
  return norm.every((h, i) => h.length >= 1 && headers[i]!.length <= 120) && new Set(norm).size === norm.length
}

export function useCreateColumnMap() {
  return useMutation({
    meta: { toast: false },
    mutationFn: (headers: string[]) =>
      unwrap(api.POST('/imports/column-maps', { params: { header: idempotencyHeader(newIdempotencyKey()) }, body: { headers } })),
  })
}

const POLL_MS = 1500

/** The map, read again while Kuinn maps the leftovers. */
export function useColumnMap(seed: ColumnMap | null) {
  const keys = useKeys()
  return useQuery({
    queryKey: [...keys.imports.all(), 'column-map', seed?.id ?? null] as const,
    queryFn: () => unwrap(api.GET('/imports/column-maps/{map_id}', { params: { path: { map_id: seed!.id } } })),
    enabled: !!seed,
    initialData: seed ?? undefined,
    refetchInterval: (q) => (q.state.data?.status === 'mapping' ? POLL_MS : false),
    staleTime: Infinity,
  })
}

export function useConfirmColumnMap() {
  return useMutation({
    meta: { toast: false },
    mutationFn: ({ id, body, key }: { id: string; body: Schema<'ColumnMapConfirm'>; key: string }) =>
      unwrap(
        api.POST('/imports/column-maps/{map_id}/confirm', {
          params: { path: { map_id: id }, header: idempotencyHeader(key) },
          body,
        }),
      ),
  })
}
