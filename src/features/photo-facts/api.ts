/**
 * Photo facts (SI3), checked against the backend:
 *
 *   PATCH /products/{id}  products.py products_update (product:import; If-Match)
 *                         `{confirm_attributes: [key]}` confirms a photo value,
 *                         `{attributes: {key: null}}` removes it (the reject)
 */
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useRef, useState } from 'react'
import { isApiError } from '@/api/errors'
import { isStaleVersion } from '@/api/etag'
import { fetchProduct, patchProduct, productQuery, type ProductDetail } from '@/features/products/api'
import { useKeys } from '@/lib/query-keys'
import type { PendingOp, PhotoFact } from './model'

const omit = <T,>(o: Record<string, T>, k: string) => {
  if (!(k in o)) return o
  const next = { ...o }
  delete next[k]
  return next
}

function actionError(err: unknown, op: PendingOp): string {
  if (isApiError(err)) {
    if (err.status === 0) return 'Can’t reach the server. Try again.'
    if (err.status === 403) return 'You can’t change this product with your role.'
    if (err.status === 422) return 'This photo value changed. The latest is shown.'
  }
  return op === 'confirm' ? 'Couldn’t confirm this. Try again.' : 'Couldn’t remove this. Try again.'
}

/**
 * Confirm and reject, optimistic: the row changes at once (`pending`), and goes back with an
 * inline error when the save fails. Saves run one after another. Each is sent with the ETag the
 * click was made over, and only while the photo value is still there (an earlier save may have
 * brought a teammate's value). A 409 STALE_VERSION re-reads the product and sends the same action
 * once more only while it still applies.
 *
 * A saved action stays in `pending` until the saved product reaches the page (the cache notifies
 * a tick later), so the row never flashes back to its old state in between: it holds while the
 * page still shows the product it was saved over.
 */
export function usePhotoFactActions(product: ProductDetail) {
  const productId = product.id
  const keys = useKeys()
  const qc = useQueryClient()
  /** `over`: the product the page showed when the save landed (absent while it is in flight). */
  const [ops, setOps] = useState<Record<string, { op: PendingOp; over?: ProductDetail }>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const chain = useRef<Promise<unknown>>(Promise.resolve())

  const run = useCallback(
    (op: PendingOp, fact: Pick<PhotoFact, 'key' | 'value'>) => {
      const { key } = fact
      const query = productQuery(keys, productId)
      setOps((o) => ({ ...o, [key]: { op } }))
      setErrors((e) => omit(e, key))
      const body = op === 'confirm' ? { confirm_attributes: [key] } : { attributes: { [key]: null } }
      const still = (p: ProductDetail | undefined) => {
        const f = p?.photo_facts?.find((x) => x.key === key)
        return !!f && f.value === fact.value && (op === 'reject' || !f.confirmed)
      }
      // The ETag of the product the click was made over: never a newer one a teammate's save
      // brought in, or a reject could delete their value (useUpdateProduct follows the same rule).
      const clickedOver = qc.getQueryData(query.queryKey)?.etag
      const drop = () => setOps((o) => omit(o, key))
      const task = async () => {
        try {
          // An earlier save in the queue may have brought a newer product: act only while the
          // photo value is still there and still needs this action.
          if (!still(qc.getQueryData(query.queryKey))) return drop()
          let next: ProductDetail
          try {
            next = await patchProduct(productId, body, clickedOver)
          } catch (err) {
            if (!isStaleVersion(err)) throw err
            const fresh = await fetchProduct(productId)
            qc.setQueryData(query.queryKey, fresh)
            if (!still(fresh)) return drop()
            next = await patchProduct(productId, body, fresh.etag)
          }
          const over = qc.getQueryData(query.queryKey)
          setOps((o) => (o[key] ? { ...o, [key]: { op, over } } : o))
          qc.setQueryData(query.queryKey, next)
          void qc.invalidateQueries({ queryKey: keys.products.list() })
          // A removed value changes the facts the listings were made from.
          if (op === 'reject') void qc.invalidateQueries({ queryKey: keys.listings.lists() })
        } catch (err) {
          setOps((o) => omit(o, key))
          setErrors((e) => ({ ...e, [key]: actionError(err, op) }))
          void qc.invalidateQueries({ queryKey: keys.products.detail(productId) })
        }
      }
      chain.current = chain.current.then(task, task)
      return chain.current
    },
    [keys, qc, productId],
  )

  const pending = useMemo(
    () => Object.fromEntries(Object.entries(ops).flatMap(([k, x]) => (!x.over || x.over === product ? [[k, x.op]] : []))) as Record<string, PendingOp>,
    [ops, product],
  )
  return {
    pending,
    /** Keys whose save is still on its way (not yet answered by the server). */
    saving: useMemo(() => new Set(Object.entries(ops).flatMap(([k, x]) => (x.over ? [] : [k]))), [ops]),
    errors,
    confirm: (fact: Pick<PhotoFact, 'key' | 'value'>) => run('confirm', fact),
    reject: (fact: Pick<PhotoFact, 'key' | 'value'>) => run('reject', fact),
  }
}
