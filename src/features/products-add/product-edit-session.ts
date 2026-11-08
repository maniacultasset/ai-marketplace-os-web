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
import { styleBarcode, type BarcodeHolder } from '@/features/products/barcode'
import {
  buildPatch,
  changedOnServer,
  mapPatchErrors,
  rebaseDraft,
  toEditDraft,
  validateEdit,
  withHsnSuggestion,
  type EditDraft,
  type EditErrors,
  type ManufacturerSource,
} from '@/features/products/edit-model'
import { fromSizeChart, type SizeChart } from '@/features/products/intake-model'
import { toast } from '@/lib/toast'

export type SaveOutcome = 'saved' | 'unchanged' | 'invalid' | 'stale' | 'failed'

/**
 * `isStyle`: the product has variants (a style), so its barcode field is the exemption only. False
 * while the variants are still loading: a barcode typed on a style then comes back as a 422 on the
 * field.
 */
export function useProductEditSession(
  product: ProductDetail,
  isVariant: boolean,
  source: ManufacturerSource,
  isStyle = false,
  /** A style's variants: its exemption switch reads from them (barcode.ts `styleExemption`). */
  variants: readonly BarcodeHolder[] = [],
) {
  const barcodeLevel = isStyle ? 'style' : 'item'
  const styleBc = useMemo(() => (isStyle ? styleBarcode(variants) : null), [isStyle, variants])
  const draftOf = (p: ProductDetail): EditDraft => {
    const out = toEditDraft(p, source)
    return styleBc ? { ...out, barcode: styleBc } : out
  }
  const update = useUpdateProduct(product.id)
  const [editing, setEditing] = useState(false)
  /** The version the edit is based on: its ETag goes in If-Match, its values are the diff base. */
  const [base, setBase] = useState<ProductDetail>(product)
  const [d, setD] = useState<EditDraft>(() => draftOf(product))
  const [touched, setTouched] = useState<ReadonlySet<string>>(() => new Set())
  const [submitted, setSubmitted] = useState(0)
  const [server, setServer] = useState<EditErrors>({})
  const [stale, setStale] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [saving, setSaving] = useState(false)

  const baseDraft = useMemo(() => {
    const out = toEditDraft(base, source)
    return styleBc ? { ...out, barcode: styleBc } : out
  }, [base, source, styleBc])
  const client = useMemo(() => validateEdit(d, isVariant), [d, isVariant])
  const errors: EditErrors = { ...server }
  for (const [k, v] of Object.entries(client)) if (submitted > 0 || touched.has(k)) errors[k] ??= v
  const body = buildPatch(baseDraft, d, isVariant, barcodeLevel)
  const dirty = Object.keys(body).length > 0
  /** Only the HSN suggestion would be saved: not a change the seller made, so Cancel never asks. */
  const onlySuggestion = d.hsnSuggested && Object.keys(body).every((k) => k === 'hsn_code')

  const start = () => {
    setBase(product)
    setD(withHsnSuggestion(draftOf(product), product))
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
  const cancel = () => (dirty && !onlySuggestion ? setConfirmCancel(true) : stop())

  const touch = (k: string) => setTouched((t) => (t.has(k) ? t : new Set(t).add(k)))
  const patch = (p: Partial<EditDraft>, ...clear: string[]) => {
    setD((x) => ({ ...x, ...p }))
    setConfirmCancel(false)
    if (clear.length) setServer((s) => Object.fromEntries(Object.entries(s).filter(([k]) => !clear.some((c) => k === c || k.startsWith(`${c}.`)))))
  }
  const setAttr = (k: string, v: string) => patch({ attrs: { ...d.attrs, [k]: v } }, `attr.${k}`)
  /** SI12: the rows read from the size-chart photo go into the editor for the seller to check and save. */
  const loadSizeChart = (chart: SizeChart, imageId: string) => patch({ sizeChart: fromSizeChart(chart), sizeChartImageId: imageId }, 'size_chart')

  /** Someone else's version is the new base; the person's own changes go on top of it. */
  const rebaseOnto = (fresh: ProductDetail) => {
    setD((mine) => rebaseDraft(baseDraft, mine, draftOf(fresh)))
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
      const sent = buildPatch(draftOf(on), d, isVariant, barcodeLevel)
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
    onlySuggestion,
    loadSizeChart,
    saving,
    save,
    isVariant,
    isStyle,
    source,
  }
}

export type ProductEditSession = ReturnType<typeof useProductEditSession>
