/**
 * Product delete: DELETE /products/{product_id} (one) and POST /products/bulk-delete (many, up to
 * 100 per call, each answered on its own). Backend: routers/product_delete.py. Owner and admin
 * only (`settings:manage`). A delete is refused while any listing was sent to a marketplace, so
 * the UI disables it first with the reason (`deleteBlock`); the server still decides.
 *
 * The rows leave the cached product list at once (optimistic); a failed call, or an item the
 * server refused, puts its rows back.
 */
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { api, unwrap } from '@/api/client'
import { isApiError } from '@/api/errors'
import { idempotencyHeader, newIdempotencyKey } from '@/api/idempotency'
import type { Schema } from '@/api/types'
import { toast } from '@/lib/toast'
import { useKeys, type keysFor } from '@/lib/query-keys'
import type { Walked } from '@/features/products-add/catalog'

type Listing = Schema<'ListingOut'>
type Product = Schema<'ProductOut'>
type Keys = ReturnType<typeof keysFor>

/** The backend's bulk cap (schemas/product_delete.py MAX_BULK_DELETE). */
export const BULK_DELETE_MAX = 100

/**
 * Why delete is off for these listings, or null when it is allowed. Mirrors the server's refusal
 * (services/product_delete.py): a listing published, being sent, or ever seen by a marketplace.
 */
export function deleteBlock(listings: readonly (Listing | undefined)[]): string | null {
  for (const l of listings) {
    if (!l) continue
    if (l.status === 'publishing') return 'A listing is being sent to a marketplace. Try again once it finishes.'
    if (l.status === 'published' || l.marketplace_state !== 'not_submitted' || l.external_id)
      return 'A listing was sent to a marketplace, so this product can’t be deleted here.'
  }
  return null
}

export interface DeleteOutcome {
  deleted: string[]
  /** Product id → the server's reason, for the ones it refused. */
  refused: Map<string, string>
}

const REFUSAL: Record<string, string> = {
  INVALID_STATUS_TRANSITION: 'A listing was sent to a marketplace.',
  SUBMISSION_IN_FLIGHT: 'A listing is being sent to a marketplace.',
  LISTING_BUSY: 'A listing is drafting. Try again in a minute.',
  NOT_FOUND: 'It was already deleted.',
  VALIDATION_FAILED: 'A size is deleted with its style.',
}

export const refusalText = (code: string | null | undefined) => REFUSAL[code ?? ''] ?? 'It couldn’t be deleted.'

/** A one-product answer the server gives on purpose (refused, a size, already gone): said by name, like a bulk item. */
const REFUSED_STATUS = new Set([404, 409, 422])

async function deleteOne(id: string): Promise<DeleteOutcome> {
  try {
    await unwrap(api.DELETE('/products/{product_id}', { params: { path: { product_id: id } } }))
  } catch (err) {
    if (isApiError(err) && REFUSED_STATUS.has(err.status)) return { deleted: [], refused: new Map([[id, refusalText(err.type)]]) }
    throw err
  }
  return { deleted: [id], refused: new Map() }
}

/** POST /products/bulk-delete in chunks of 100; one key per chunk of this one user action. */
async function deleteMany(ids: string[]): Promise<DeleteOutcome> {
  const out: DeleteOutcome = { deleted: [], refused: new Map() }
  for (let i = 0; i < ids.length; i += BULK_DELETE_MAX) {
    const chunk = ids.slice(i, i + BULK_DELETE_MAX)
    let res
    try {
      res = await unwrap(
        api.POST('/products/bulk-delete', { params: { header: idempotencyHeader(newIdempotencyKey()) }, body: { product_ids: chunk } }),
      )
    } catch (err) {
      // An earlier chunk was deleted already: report it truthfully and keep the rest, never "nothing was deleted".
      if (!out.deleted.length) throw err
      for (const id of ids.slice(i)) out.refused.set(id, 'It couldn’t be deleted. Try again.')
      return out
    }
    for (const item of res.items) {
      if (item.http_status === 204) out.deleted.push(item.product_id)
      else out.refused.set(item.product_id, refusalText(item.error?.error_code))
    }
  }
  return out
}

/** The product list queries (the catalog walk and the paged list) and their current data. */
function snapshot(qc: QueryClient, keys: Keys) {
  return qc.getQueriesData<Walked<Product> | { data: Product[] }>({ queryKey: keys.products.list() })
}

/** Rows of `ids` and their sizes leave every cached product list. */
function removeFrom(qc: QueryClient, keys: Keys, ids: ReadonlySet<string>) {
  const gone = (p: Product) => ids.has(p.id) || (!!p.parent_product_id && ids.has(p.parent_product_id))
  qc.setQueriesData<Walked<Product> | { data: Product[] }>({ queryKey: keys.products.list() }, (old) => {
    if (!old) return old
    if ('rows' in old) return { ...old, rows: old.rows.filter((p) => !gone(p)) }
    if ('data' in old && Array.isArray(old.data)) return { ...old, data: old.data.filter((p) => !gone(p)) }
    return old
  })
}

export function useDeleteProducts() {
  const keys = useKeys()
  const qc = useQueryClient()
  return useMutation({
    // The caller shows its own toast (named products, the refused ones).
    meta: { toast: false },
    mutationFn: (ids: string[]) => (ids.length === 1 && ids[0] ? deleteOne(ids[0]) : deleteMany(ids)),
    onMutate: async (ids: string[]) => {
      await qc.cancelQueries({ queryKey: keys.products.list() })
      const before = snapshot(qc, keys)
      removeFrom(qc, keys, new Set(ids))
      return { before }
    },
    onError: (_err, _ids, ctx) => {
      for (const [key, data] of ctx?.before ?? []) qc.setQueryData(key, data)
    },
    onSuccess: (out, _ids, ctx) => {
      // Put back exactly the rows the server refused, then keep the deleted ones out.
      if (out.refused.size) {
        for (const [key, data] of ctx?.before ?? []) qc.setQueryData(key, data)
        removeFrom(qc, keys, new Set(out.deleted))
      }
      for (const id of out.deleted) qc.removeQueries({ queryKey: keys.products.detail(id) })
    },
    onSettled: () => {
      // Tasks close, listings are archived and issues leave the inbox on the server.
      void qc.invalidateQueries({ queryKey: keys.products.list() })
      void qc.invalidateQueries({ queryKey: keys.listings.all() })
      void qc.invalidateQueries({ queryKey: keys.issues.all() })
      void qc.invalidateQueries({ queryKey: keys.tasks.all() })
    },
  })
}

export interface DeleteTarget {
  id: string
  sku: string
  title: string
  /** Sizes deleted with this style. */
  variants?: number
}

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** The toast after the call: who went, who stayed and why. */
export function announce(products: readonly DeleteTarget[], out: DeleteOutcome) {
  const name = (id: string) => products.find((p) => p.id === id)?.sku ?? 'A product'
  const [only] = out.deleted
  if (only && !out.refused.size) {
    toast.success(out.deleted.length === 1 ? `${name(only)} deleted` : `${plural(out.deleted.length, 'product', 'products')} deleted`, {
      description: 'Its open questions are closed and nothing more is drafted for it.',
    })
    return
  }
  const refused = [...out.refused.entries()]
  const first = refused[0]
  toast.error(
    out.deleted.length
      ? `${plural(out.deleted.length, 'product', 'products')} deleted, ${refused.length} kept`
      : refused.length === 1 && first
        ? `${name(first[0])} wasn’t deleted`
        : `${plural(refused.length, 'product', 'products')} weren’t deleted`,
    {
      duration: 10000,
      description: refused
        .slice(0, 3)
        .map(([id, why]) => `${name(id)}: ${why}`)
        .join(' '),
    },
  )
}
