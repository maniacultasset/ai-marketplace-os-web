/**
 * The product editor's state, held by the detail page above its tabs: switching tabs while
 * editing keeps the draft (the editor itself unmounts with its tab panel).
 *
 * Save: PATCH /products/{id} with If-Match = the ETag of `base`, the version the edit is on.
 * - No ETag cached (a product cached from a create response): read it first; if it changed,
 *   rebase like a 409.
 * - 409 STALE_VERSION: read the latest, put the person's own changes on top of it
 *   (`rebaseDraft`), and ask them to check and save again. A failed read shows its error.
 * - A save the server applied as a no-op is not reported as "saved".
 */
import { useMemo, useState } from 'react'
import { isStaleVersion } from '@/api/etag'
import { isApiError } from '@/api/errors'
import { fetchProduct, useUpdateProduct, type ProductDetail } from '@/features/products/api'
import {
  buildPatch,
  changedOnServer,
  mapPatchErrors,
  rebaseDraft,
  toEditDraft,
  validateEdit,
  type EditDraft,
  type EditErrors,
  type ManufacturerSource,
} from '@/features/products/edit-model'
import { toast } from '@/lib/toast'

export type SaveOutcome = 'saved' | 'unchanged' | 'invalid' | 'stale' | 'failed'

export function useProductEditSession(product: ProductDetail, isVariant: boolean, source: ManufacturerSource) {
  const update = useUpdateProduct(product.id)
  const [editing, setEditing] = useState(false)
  /** The version the edit is based on: its ETag goes in If-Match, its values are the diff base. */
  const [base, setBase] = useState<ProductDetail>(product)
  const [d, setD] = useState<EditDraft>(() => toEditDraft(product, source))
  const [touched, setTouched] = useState<ReadonlySet<string>>(() => new Set())
  const [submitted, setSubmitted] = useState(0)
  const [server, setServer] = useState<EditErrors>({})
  const [stale, setStale] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [saving, setSaving] = useState(false)

  const baseDraft = useMemo(() => toEditDraft(base, source), [base, source])
  const client = useMemo(() => validateEdit(d, isVariant), [d, isVariant])
  const errors: EditErrors = { ...server }
  for (const [k, v] of Object.entries(client)) if (submitted > 0 || touched.has(k)) errors[k] ??= v
  const body = buildPatch(baseDraft, d, isVariant)
  const dirty = Object.keys(body).length > 0

  const start = () => {
    setBase(product)
    setD(toEditDraft(product, source))
    setTouched(new Set())
    setSubmitted(0)
    setServer({})
    setStale(false)
    setError(null)
    setConfirmCancel(false)
    setEditing(true)
  }
  const stop = () => {
    setEditing(false)
    setConfirmCancel(false)
    setStale(false)
    setError(null)
  }
  /** Cancel: with unsaved changes it asks first (inline, never a browser dialog). */
  const cancel = () => (dirty ? setConfirmCancel(true) : stop())

  const touch = (k: string) => setTouched((t) => (t.has(k) ? t : new Set(t).add(k)))
  const patch = (p: Partial<EditDraft>, ...clear: string[]) => {
    setD((x) => ({ ...x, ...p }))
    setConfirmCancel(false)
    if (clear.length) setServer((s) => Object.fromEntries(Object.entries(s).filter(([k]) => !clear.some((c) => k === c || k.startsWith(`${c}.`)))))
  }
  const setAttr = (k: string, v: string) => patch({ attrs: { ...d.attrs, [k]: v } }, `attr.${k}`)

  /** Someone else's version is the new base; the person's own changes go on top of it. */
  const rebaseOnto = (fresh: ProductDetail) => {
    setD((mine) => rebaseDraft(baseDraft, mine, toEditDraft(fresh, source)))
    setBase(fresh)
    setStale(true)
  }

  const save = async (): Promise<SaveOutcome> => {
    setSubmitted((n) => n + 1)
    setError(null)
    if (Object.keys(validateEdit(d, isVariant)).length) return 'invalid'
    if (!dirty) {
      stop()
      return 'unchanged'
    }
    setSaving(true)
    try {
      let on = base
      if (!on.etag) {
        const fresh = await fetchProduct(product.id)
        if (fresh.updated_at !== on.updated_at) {
          rebaseOnto(fresh)
          return 'stale'
        }
        on = fresh
        setBase(fresh)
      }
      const sent = buildPatch(toEditDraft(on, source), d, isVariant)
      const after = await update.mutateAsync({ body: sent, etag: on.etag })
      if (changedOnServer(on, after, isVariant)) toast.success('Product saved', { description: 'Listings made before this change are checked again before they publish.' })
      else toast.info('Nothing changed', { description: 'The product already had these values.' })
      stop()
      return changedOnServer(on, after, isVariant) ? 'saved' : 'unchanged'
    } catch (err) {
      if (isStaleVersion(err)) {
        try {
          rebaseOnto(await fetchProduct(product.id))
          return 'stale'
        } catch (readErr) {
          setError(readErr)
          return 'failed'
        }
      }
      if (isApiError(err) && err.status === 422) {
        const { fields, unmapped } = mapPatchErrors(err, d)
        setServer(fields)
        if (unmapped || !Object.keys(fields).length) setError(err)
        return 'invalid'
      }
      setError(err)
      return 'failed'
    } finally {
      setSaving(false)
    }
  }

  return {
    editing,
    start,
    cancel,
    discard: stop,
    keepEditing: () => setConfirmCancel(false),
    confirmCancel,
    base,
    baseDraft,
    d,
    patch,
    setAttr,
    touch,
    errors,
    submitted,
    stale,
    error,
    dirty,
    saving,
    save,
    isVariant,
    source,
  }
}

export type ProductEditSession = ReturnType<typeof useProductEditSession>
