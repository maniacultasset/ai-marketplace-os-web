/**
 * Guided form (hi-fi p09): one product at a time, section by section.
 *
 * Real calls: GET /brand-profile (the default manufacturer), POST /images/upload-url (the main
 * photo goes to the store before the product exists), POST /products with every V1 input, then
 * the other photos (./new-images.tsx) and, on "Send to agent now", POST /listings/generate per
 * chosen marketplace (./generate.ts). The unsent draft is kept in this browser only (localStorage,
 * per brand) so a reload does not lose typing; photos are not kept, and the form says so.
 *
 * The side panel ("Before you save") shows the critical facts still missing, the marketplaces
 * chosen and the category. Readiness is checked only once the agent drafts the listing. The
 * category is a dropdown of the categories the agent can list, read from the backend
 * (features/products/catalog-categories.ts), with what each marketplace is sent for it and a
 * "Suggest" button (./category-suggest.tsx). The SKU is checked while it is typed and once more
 * before the save, and Kuinn can make one (./sku-field.tsx).
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { format } from 'date-fns'
import { useEffect, useMemo, useRef, useState } from 'react'
import { api, unwrap } from '@/api/client'
import { isApiError } from '@/api/errors'
import { newIdempotencyKey } from '@/api/idempotency'
import {
  AttentionCard,
  Banner,
  CONCEPT_ICON,
  FooterBar,
  Glyph,
  Icon,
  IconGlyph,
  IconTile,
  LaCard,
  LaField,
  MarketplaceName,
  SourceBadge,
  TagChip,
  fieldHintId,
} from '@/components/la'
import { ScrollPane, SplitLayout } from '@/components/app/split-layout'
import { ReferenceId } from '@/components/states/reference-id'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { checkImageReadable, type ImageRole, type ImageSlot } from '@/features/analytics-images/images/report'
import { StageUnavailable, stageImageForNewProduct, uploadImage } from '@/features/analytics-images/images/upload'
import { fetchProduct, useBrandManufacturer } from '@/features/products/api'
import { BarcodeField } from '@/features/products/barcode-field'
import { CompositionEditor, MoneyField, PartyFields, PickOrOtherField, SizeChartEditor, TextField } from '@/features/products/intake-fields'
import {
  bodyErrorKey,
  COLOURS,
  discountPercent,
  FABRIC_TYPES,
  hasSizeRows,
  partyPlace,
  type PartyDraft,
  type PartyField,
  type PartyOut,
} from '@/features/products/intake-model'
import { ATTRIBUTE_KEY_SUGGESTIONS, ATTRIBUTE_TEXT_MAX, SKU_PATTERN, TITLE_MAX } from '@/features/products/schema'
import { categoryLabel } from '@/features/products/categories'
import { useCategorySuggestEnabled, useLampsEnabled } from '@/features/assist/flags'
import { CategorySelect } from '@/features/products/category-select'
import { mappingText, unmappedText, useCatalogCategories } from '@/features/products/catalog-categories'
import { invalidateListingWork } from '@/features/listings/api'
import { tenantName, useMe, useSession } from '@/lib/auth'
import { AudienceSelect, BrandField } from '@/features/products/audience-fields'
import { OP_ACTION, useCan } from '@/lib/permissions'
import { useAiPaused } from '@/features/ai-credit/use-ai-paused'
import { useKeys } from '@/lib/query-keys'
import { toast } from '@/lib/toast'
import { focusFirstInvalid } from '@/lib/validation'
import { cn } from '@/lib/utils'
import { useAllProducts } from './catalog'
import type { Marketplace, Product } from './catalog-model'
import { generateMany, planGenerate } from './generate'
import {
  ATTR_FIELDS,
  emptyGuided,
  errorOrder,
  isEmptyGuided,
  reviveGuided,
  type AttrField,
  type GuidedContext,
  type ProductCreateBody,
  mapCreateErrors,
  missingCritical,
  SECTIONS,
  sectionOfError,
  sectionStates,
  toProductCreate,
  validateGuided,
  type GuidedErrors,
  type GuidedValues,
  type SectionId,
  type SectionState,
} from './guided-model'
import { serializeListOn } from './list-on'
import { CategorySuggest } from './category-suggest'
import { draftBody } from './category-draft'
import { SkuField } from './sku-field'
import { takenMessage, type SkuAvailability } from './sku-check'
import { NewProductImages } from './new-images'
import { filledViews } from './new-images-model'
import { neededForApproval, newProductGaps } from '@/features/analytics-images/images/photo-views'
import { newPendingImage, placePending, type PendingImage } from './new-images-model'
import { CountryField, HsnField, PackageFields } from '@/features/products/seller-field-inputs'
import { packageHasSize, packageHasWeight, suggestHsn } from '@/features/products/seller-fields'
import { missingNeeds, missingSummary, needText, useRequirements, type Filled, type NeedFieldId } from '@/features/products/needs'
import { normalizeBarcode } from '@/features/products/barcode'

const DRAFT_PREFIX = 'la.guided-draft.'

function readDraft(key: string): { values: GuidedValues; savedAt: string } | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const d = JSON.parse(raw) as { values?: GuidedValues; savedAt?: string }
    if (!d.values || typeof d.values.sku !== 'string' || !d.savedAt) return null
    return { values: reviveGuided(d.values), savedAt: d.savedAt }
  } catch {
    return null
  }
}

function writeDraft(key: string, values: GuidedValues | null): string | null {
  try {
    if (!values) {
      localStorage.removeItem(key)
      return null
    }
    const savedAt = new Date().toISOString()
    localStorage.setItem(key, JSON.stringify({ values, savedAt }))
    return savedAt
  } catch {
    return null
  }
}

function SectionMark({ state }: { state: SectionState }) {
  if (state.kind === 'error')
    return (
      <span className="inline-flex h-[22px] min-w-[22px] items-center justify-center gap-0.5 rounded-full border border-danger-line bg-danger-bg px-1.5 text-caption font-bold text-danger">
        <Glyph status="error" />
        {state.count > 1 ? state.count : null}
        <span className="sr-only"> {state.count === 1 ? 'error' : 'errors'} to fix</span>
      </span>
    )
  if (state.kind === 'missing')
    return (
      <span className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full border border-attention-line bg-attention-bg px-1.5 text-caption font-bold text-attention">
        {state.count}
        <span className="sr-only"> critical inputs missing</span>
      </span>
    )
  if (state.kind === 'done')
    return (
      <span className="inline-flex size-[22px] items-center justify-center rounded-full border border-success-line bg-success-bg text-success">
        <Glyph status="live" />
        <span className="sr-only">done</span>
      </span>
    )
  return (
    <span className="inline-flex size-[22px] items-center justify-center rounded-full border border-dashed border-line-strong bg-field text-ink-2 shadow-inset-sm">
      <Glyph status="not-listed" />
      <span className="sr-only">not started</span>
    </span>
  )
}

/** How long the save waits for the last SKU check before it goes ahead (the create still refuses a taken SKU). */
const SKU_CHECK_WAIT_MS = 2500

/** The check of `sku` when it is taken in this brand; null when it is free, or the check is slow or failed. */
async function skuTaken(sku: string): Promise<SkuAvailability | null> {
  if (!SKU_PATTERN.test(sku)) return null
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), SKU_CHECK_WAIT_MS)
  })
  try {
    const found = await Promise.race([unwrap(api.GET('/skus/availability', { params: { query: { sku } } })), late])
    return found && !found.available ? found : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export function GuidedForm({ listOn, startAt = 'identity' }: { listOn: Marketplace[]; startAt?: SectionId }) {
  const navigate = useNavigate()
  const keys = useKeys()
  const qc = useQueryClient()
  const can = useCan()
  const aiPaused = useAiPaused()
  const { tenantId } = useSession()
  const draftKey = `${DRAFT_PREFIX}${tenantId ?? 'none'}`
  const [initial] = useState(() => readDraft(draftKey))
  const [rawValues, setValues] = useState<GuidedValues>(() => initial?.values ?? emptyGuided())
  // The categories and the classifier switch from the backend (client feedback 11 Nov); the
  // product-detail read stays as the fallback for the switch (SI14).
  const catalog = useCatalogCategories()
  const catalogItems = catalog.data?.items ?? null
  // SI14: "Let Kuinn suggest" counts only while the backend's classifier is on.
  const suggestOnFromProduct = useCategorySuggestEnabled()
  const suggestOn = suggestOnFromProduct || catalog.data?.suggest_enabled === true
  const lamps = useLampsEnabled()
  const values = useMemo(() => (suggestOn || !rawValues.kuinnSuggests ? rawValues : { ...rawValues, kuinnSuggests: false }), [rawValues, suggestOn])
  const [savedAt, setSavedAt] = useState<string | null>(initial?.savedAt ?? null)
  const [section, setSection] = useState<SectionId>(startAt)
  /** Errors from the last save attempt's API response, cleared per field as it is edited. */
  const [serverErrors, setServerErrors] = useState<GuidedErrors>({})
  /** Fields the person has left (blurred): their client errors show from then on. */
  const [touched, setTouched] = useState<ReadonlySet<string>>(() => new Set())
  /** Save attempts: after the first, every client error shows and re-checks on each change. */
  const [submitCount, setSubmitCount] = useState(0)
  /** Bumped to move focus to the first invalid field once its section has rendered. */
  const [focusTick, setFocusTick] = useState(0)
  const bodyRef = useRef<HTMLElement>(null)
  const [formError, setFormError] = useState<unknown>(null)
  const [created, setCreated] = useState<Product | null>(null)
  const [busy, setBusy] = useState<'next' | 'send' | null>(null)
  /** What saving is doing right now: the product, its photos, their checks, then each draft. */
  const [phase, setPhase] = useState<SavePhase | null>(null)
  const navRef = useRef<HTMLUListElement>(null)
  /**
   * The existing product behind a 409 SKU_CONFLICT. POST /products has no Idempotency-Key, so a
   * retry after a lost response (status 0) answers 409 for the product the first attempt created
   * (backend services/products.py). Linking to it keeps the person from making a second SKU.
   */
  const [conflict, setConflict] = useState<Product | null>(null)

  const products = useAllProducts()
  const storeName = tenantName(useMe().data)

  // The brand's default manufacturer: every product inherits it unless it sets its own.
  const brand = useBrandManufacturer()
  const brandParty = brand.data?.data.default_manufacturer ?? null
  const canManageBrand = can(OP_ACTION['PATCH /brand-profile'])

  /* ----------------------------------------------------------------------------- Images */

  const [images, setImagesState] = useState<PendingImage[]>([])
  const imagesRef = useRef<PendingImage[]>([])
  const setImages = (fn: (list: PendingImage[]) => PendingImage[]) => {
    imagesRef.current = fn(imagesRef.current)
    setImagesState(imagesRef.current)
  }
  const patchImage = (localId: string, next: Partial<PendingImage>) =>
    setImages((list) => list.map((i) => (i.localId === localId ? { ...i, ...next } : i)))
  /** Staging uploads in flight, awaited before the product is saved. */
  const staging = useRef(new Map<string, Promise<void>>())
  /** When a create in this session got no answer (status 0). Null: every create was answered. */
  const [lostCreateAt, setLostCreateAt] = useState<number | null>(null)
  // A pending focus move: it runs once the form is enabled again (focus() on a field inside the
  // disabled fieldset does nothing).
  const pendingFocus = useRef(false)
  useEffect(() => {
    const ref = imagesRef
    return () => ref.current.forEach((i) => URL.revokeObjectURL(i.previewUrl))
  }, [])

  const stage = (img: PendingImage) => {
    patchImage(img.localId, { stage: { kind: 'staging' } })
    const run = stageImageForNewProduct(img.file, img.slot)
      .then(({ productId, storageKey }) => patchImage(img.localId, { stage: { kind: 'staged', productId, storageKey } }))
      .catch((error: unknown) => {
        // No signed upload here (for example no CORS on the bucket): it uploads after the save instead.
        patchImage(img.localId, { stage: error instanceof StageUnavailable ? { kind: 'queued' } : { kind: 'failed', error } })
      })
      .finally(() => staging.current.delete(img.localId))
    staging.current.set(img.localId, run)
  }

  const addImages = (files: File[], slot: ImageSlot, role: ImageRole | null = null) => {
    const added = files.map((f) => newPendingImage(f, slot, role))
    setImages((list) => {
      // Front, Back, Close-up and Size chart hold one photo each: a new one replaces the old.
      const { next, dropped } = placePending(list, added)
      for (const gone of dropped) URL.revokeObjectURL(gone.previewUrl)
      return next
    })
    setServerErrors((e) => {
      const next = { ...e }
      delete next.images
      return next
    })
    const queued = added.filter((a) => a.stage.kind === 'queued')
    // Decode each file before it is staged or uploaded: a file that is not a photo never reads
    // "Ready". The check sits in `staging`, so a save waits for it like for a staged photo.
    const toUpload: PendingImage[] = []
    const checks = queued.map((a) => {
      const run = checkImageReadable(a.file).then(async (problem) => {
        if (problem) {
          patchImage(a.localId, { stage: { kind: 'invalid', message: problem } })
          return
        }
        if (created) toUpload.push(a)
        else if (a.slot === 'main') {
          stage(a)
          await staging.current.get(a.localId)
        }
      })
      staging.current.set(a.localId, run)
      void run.finally(() => {
        if (staging.current.get(a.localId) === run) staging.current.delete(a.localId)
      })
      return run
    })
    // Already saved (for example "Continue with it"): photos go straight to the product.
    if (created)
      void Promise.all(checks).then(() => {
        if (toUpload.length) void uploadAfterSave(created.id, toUpload).finally(() => setPhase(null))
      })
  }
  const removeImage = (localId: string) =>
    setImages((list) => {
      const gone = list.find((i) => i.localId === localId)
      if (gone) URL.revokeObjectURL(gone.previewUrl)
      return list.filter((i) => i.localId !== localId)
    })
  const retryImage = (localId: string) => {
    const img = imagesRef.current.find((i) => i.localId === localId)
    if (!img) return
    if (created) void uploadAfterSave(created.id, [img])
    else if (img.slot === 'main') stage(img)
    else patchImage(localId, { stage: { kind: 'queued' } })
  }

  /** Upload the photos that wait for the product, one by one. Returns how many failed. */
  const uploadAfterSave = async (productId: string, list: readonly PendingImage[]): Promise<number> => {
    let failed = 0
    let done = 0
    for (const img of list) {
      setPhase({ kind: 'images', done, total: list.length })
      patchImage(img.localId, { stage: { kind: 'uploading' } })
      try {
        await uploadImage({ file: img.file, productId, slot: img.slot, role: img.role, multipartKey: img.multipartKey })
        patchImage(img.localId, { stage: { kind: 'done' } })
      } catch (error) {
        failed++
        patchImage(img.localId, { stage: { kind: 'failed', error }, ...(isApiError(error) && error.type === 'IDEMPOTENCY_KEY_REUSED' ? { multipartKey: newIdempotencyKey() } : {}) })
      }
      done++
    }
    if (list.length) void qc.invalidateQueries({ queryKey: keys.products.detail(productId) })
    return failed
  }

  const hasMain = images.some((i) => i.slot === 'main' && i.stage.kind !== 'invalid')
  const listable = useMemo(() => (catalogItems ? catalogItems.filter((c) => c.enabled).map((c) => c.category) : null), [catalogItems])
  const ctx: GuidedContext = {
    brandManufacturer: brand.data ? brandParty !== null : null,
    hasMain,
    imageCount: images.filter((i) => i.stage.kind !== 'invalid').length,
    listable,
    amazon: listOn.includes('amazon'),
  }

  /* ------------------------------------------------------------------------------ Draft */

  // Autosave the unsent draft (debounced) in this browser.
  useEffect(() => {
    if (created) return
    const t = setTimeout(() => setSavedAt(writeDraft(draftKey, isEmptyGuided(values) ? null : values)), 600)
    return () => clearTimeout(t)
  }, [values, draftKey, created])

  // Client errors are re-checked on every change; one shows once its field was left or a save was
  // tried (react-hook-form's onTouched + reValidateMode onChange). Server errors win until edited.
  const clientErrors = useMemo(() => validateGuided(values, listable), [values, listable])
  const errors = useMemo<GuidedErrors>(() => {
    const out: GuidedErrors = {}
    for (const [k, msg] of Object.entries(clientErrors)) {
      // A required field left empty is flagged only once a save is tried, never just for losing
      // focus (calm first visit: the autofocused name would turn red as soon as the page blurs).
      const emptyRequired = (k === 'title' || k === 'sku' || k === 'category') && !values[k].trim()
      if (submitCount > 0 || (touched.has(k) && !emptyRequired)) out[k] = msg
    }
    return { ...out, ...serverErrors }
  }, [clientErrors, serverErrors, touched, submitCount, values])
  const touch = (key: string) => setTouched((t) => (t.has(key) ? t : new Set(t).add(key)))
  useEffect(() => {
    if (!focusTick || !pendingFocus.current || busy !== null) return
    pendingFocus.current = false
    focusFirstInvalid(bodyRef.current)
  }, [focusTick, busy])

  const states = sectionStates(values, ctx, errors)
  const missing = missingCritical(values, ctx)
  // "Continue with it" only for this session's own product: a create here got no answer, and the
  // product with this SKU has the same name and category and was made since that try. Any other
  // product with the SKU is someone else's and gets "use a different SKU".
  const canContinue =
    !!conflict &&
    lostCreateAt !== null &&
    conflict.title === values.title.trim() &&
    conflict.category === values.category &&
    Date.parse(conflict.created_at) >= lostCreateAt - 5_000

  // Client feedback 11 Nov: what each ticked marketplace is sent for the chosen category.
  const catalogItem = values.category.trim() ? catalogItems?.find((c) => c.category === values.category.trim()) : undefined
  const categoryMapping = catalogItem ? mappingText(catalogItem, listOn) : null
  const categoryUnmapped = catalogItem ? unmappedText(catalogItem, listOn) : null

  // SI12: what the ticked marketplaces need for this category, while it is empty.
  const requirements = useRequirements(values.category)
  const filled: Filled = {
    brand_name: !values.ownBrand || !!values.brandName.trim(),
    identifier: values.barcode.exempt || normalizeBarcode(values.barcode.value) !== '',
    gender: !!values.gender,
    fabric_type: !!(values.attrs.fabric_type ?? '').trim(),
    color: !!(values.attrs.color ?? '').trim(),
    mrp: !!values.mrp.trim(),
    selling_price: !!values.sellingPrice.trim(),
    hsn_code: !!values.hsn.trim(),
    package_size: packageHasSize(values.pkg),
    product_size: packageHasSize(values.item),
    package_weight: packageHasWeight(values.pkg),
    country_of_origin: !!values.country.trim(),
    // Unknown while the brand loads: not counted until it is known.
    manufacturer: values.ownManufacturer || brand.data === undefined || brandParty !== null,
    size_chart: hasSizeRows(values.sizeChart),
  }
  const needs = missingNeeds(requirements.data, listOn, filled)
  // Feedback 7: the photos approval will need, said before the draft starts (it never blocks it).
  const photoViews = requirements.data?.photo_views
  const photosNeeded = neededForApproval(
    newProductGaps(photoViews, filledViews(images), { hasChart: hasSizeRows(values.sizeChart), sellOn: listOn }),
  )
  const need = (id: NeedFieldId) => needText(needs, id)
  const needSummary = missingSummary(needs)

  /** Server errors for edited fields go away: keys equal to, or under, each prefix. */
  const clearServer = (...prefixes: string[]) =>
    setServerErrors((e) => {
      const next = { ...e }
      for (const k of Object.keys(next)) if (prefixes.some((p) => k === p || k.startsWith(`${p}.`))) delete next[k]
      return next
    })
  const FIELD_KEY: Partial<Record<keyof GuidedValues, string[]>> = {
    sku: ['sku'],
    title: ['title'],
    category: ['category'],
    kuinnSuggests: ['category'],
    styleNumber: ['style_number'],
    mrp: ['mrp', 'selling_price'],
    sellingPrice: ['selling_price'],
    composition: ['composition', 'attr.fiber_composition'],
    sizeChart: ['size_chart'],
    manufacturer: ['manufacturer'],
    ownManufacturer: ['manufacturer'],
    gender: ['gender'],
    ownBrand: ['brand_name'],
    brandName: ['brand_name'],
    hsn: ['hsn_code'],
    country: ['country_of_origin'],
    pkg: ['package'],
  }
  const set = (patch: Partial<GuidedValues>) => {
    if ('sku' in patch) setConflict(null)
    setValues((v) => {
      const next = { ...v, ...patch }
      // The category's HSN heading is offered while the seller has not typed their own.
      if ('category' in patch && (!v.hsn.trim() || v.hsnSuggested)) {
        const hsn = suggestHsn(next.category)
        next.hsn = hsn ?? ''
        next.hsnSuggested = !!hsn
      }
      return next
    })
    clearServer(...Object.keys(patch).flatMap((k) => FIELD_KEY[k as keyof GuidedValues] ?? [k]))
  }
  const setAttr = (key: string, val: string) => {
    setValues((v) => ({ ...v, attrs: { ...v.attrs, [key]: val } }))
    clearServer(`attr.${key}`)
  }

  const create = useMutation({
    meta: { toast: false },
    mutationFn: (body: ProductCreateBody) => unwrap(api.POST('/products', { body })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.products.list() }),
    onError: (err) => {
      if (isApiError(err) && err.status === 0) void qc.invalidateQueries({ queryKey: keys.products.list() })
    },
  })

  const showErrors = (fields: GuidedErrors) => {
    setServerErrors(fields)
    const first = errorOrder(Object.keys(fields))[0]
    if (first) {
      setSection(sectionOfError(first))
      pendingFocus.current = true
      setFocusTick((n) => n + 1)
    }
    return first
  }

  /** After the product exists: photos that were not attached by the create go up now. */
  const afterCreate = async (p: Product): Promise<number> => {
    const list = imagesRef.current
    for (const i of list) if (i.stage.kind === 'staged' && i.stage.productId === p.id) patchImage(i.localId, { stage: { kind: 'done' } })
    const rest = imagesRef.current.filter((i) => i.stage.kind === 'queued' || i.stage.kind === 'staged' || i.stage.kind === 'failed')
    return uploadAfterSave(p.id, rest)
  }

  /** Validate and create the product once; later actions reuse it. */
  const ensureCreated = async (): Promise<Product | null> => {
    if (created) return created
    setFormError(null)
    setSubmitCount((n) => n + 1)
    const first = errorOrder(Object.keys(validateGuided(values, listable)))[0]
    if (first) {
      setSection(sectionOfError(first))
      pendingFocus.current = true
      setFocusTick((n) => n + 1)
      return null
    }
    setPhase({ kind: 'saving' })
    // Client feedback 11 Nov: a SKU already in the brand is caught here, before the create
    // answers 409. A slow or failed check never blocks the save (the create still refuses it).
    // After a create that got no answer the check is skipped: the product holding the SKU may be
    // that create's, and only the create's 409 path offers "Continue with it".
    const taken = lostCreateAt === null ? await skuTaken(values.sku.trim()) : null
    if (taken) {
      setPhase(null)
      setServerErrors((e) => ({ ...e, sku: takenMessage(values.sku.trim(), taken) }))
      setSection(sectionOfError('sku'))
      pendingFocus.current = true
      setFocusTick((n) => n + 1)
      return null
    }
    // The main photo may still be going to the store: wait for it, then attach it to the create.
    await Promise.allSettled([...staging.current.values()])
    const stagedMain = imagesRef.current.find((i) => i.slot === 'main' && i.stage.kind === 'staged')
    const uploads =
      stagedMain && stagedMain.stage.kind === 'staged'
        ? { id: stagedMain.stage.productId, images: [{ storage_key: stagedMain.stage.storageKey, slot: stagedMain.slot }] }
        : undefined
    const attempt = async (withUploads: boolean): Promise<Product> => create.mutateAsync(toProductCreate(values, withUploads ? uploads : undefined))
    const startedAt = Date.now()
    try {
      let p: Product
      try {
        p = await attempt(true)
      } catch (err) {
        // The staged photo could not be attached (expired or missing in the store): save the
        // product without it, and upload it the usual way right after.
        const imageRefused = uploads && isApiError(err) && (err.status === 404 || (err.status === 422 && err.details.some((d) => bodyErrorKey(d.loc) === 'images')))
        if (!imageRefused) throw err
        if (stagedMain) patchImage(stagedMain.localId, { stage: { kind: 'queued' } })
        p = await attempt(false)
      }
      setCreated(p)
      writeDraft(draftKey, null)
      setSavedAt(null)
      const failed = await afterCreate(p)
      if (failed)
        toast.error(`Saved, but ${failed === 1 ? 'one photo' : `${failed} photos`} did not upload`, {
          description: 'Retry them here, or add them on the product’s Media tab.',
        })
      return p
    } catch (err) {
      if (isApiError(err) && (err.status === 422 || err.status === 409)) {
        if (err.type === 'SKU_CONFLICT') {
          const sku = values.sku.trim()
          const fresh = await products.refetch()
          setConflict(fresh.data?.rows.find((p) => p.sku === sku) ?? null)
        }
        const { fields, unmapped } = mapCreateErrors(err, values)
        const firstKey = showErrors(fields)
        if (unmapped || !firstKey) setFormError(err)
      } else {
        // No answer (connection dropped): the create may have gone through. Only then can a later
        // SKU conflict be this session's own product.
        if (isApiError(err) && err.status === 0) setLostCreateAt((t) => t ?? startedAt)
        setFormError(err)
      }
      return null
    } finally {
      setPhase(null)
    }
  }

  const onNext = async () => {
    setBusy('next')
    const p = await ensureCreated()
    setBusy(null)
    if (!p) return
    toast.success('Product saved', { description: `${p.sku} is in your catalog. Add its variants next.` })
    const on = serializeListOn(listOn)
    void navigate({ to: '/add/variants', search: { product: p.id, ...(on ? { on } : {}) } })
  }

  const onSend = async () => {
    setBusy('send')
    const p = await ensureCreated()
    if (!p) {
      setBusy(null)
      setPhase(null)
      return
    }
    if (!p.category) {
      // SI14: no category yet, so no draft can start. Kuinn's suggestion waits on the product page.
      toast.success('Product saved', { description: 'Kuinn is suggesting a category. Choose it on the product page, then start the drafts.' })
    } else if (listOn.length && can('listing:generate') && !aiPaused) {
      // The agent reads photos once their check has prepared them: wait for that (briefly), so
      // the first draft already has the photos.
      if (imagesRef.current.some((i) => i.stage.kind === 'done')) {
        setPhase({ kind: 'checking' })
        await waitForImageChecks(p.id)
      }
      const plan = planGenerate([p], listOn, () => ({}))
      const total = plan.send.length
      setPhase({ kind: 'drafts', done: 0, total })
      const out = await generateMany(plan.send, (done) => setPhase({ kind: 'drafts', done, total }))
      const ok = out.filter((o) => o.kind === 'accepted')
      invalidateListingWork(qc, keys, ok.flatMap((o) => (o.kind === 'accepted' && o.accepted.listing_id ? [o.accepted.listing_id] : [])))
      const failed = out.filter((o) => o.kind === 'failed')
      if (failed.length) {
        toast.error(`Saved, but ${failed.length === 1 ? 'one draft' : `${failed.length} drafts`} did not start`, {
          description: failed.map((f) => (f.kind === 'failed' ? f.message : '')).join(' '),
        })
      } else {
        toast.success('Sent to the agent', { description: `Drafting ${p.sku} for ${ok.length} ${ok.length === 1 ? 'marketplace' : 'marketplaces'}.` })
      }
    } else {
      toast.success('Product saved', {
        description: listOn.length && aiPaused
          ? 'AI drafting is paused, so no draft was started. Start it from the product once drafting is back.'
          : listOn.length ? 'Your role can’t start drafts. An owner or operator can.' : 'No marketplace was chosen, so no draft was started.',
      })
    }
    setBusy(null)
    setPhase(null)
    void navigate({ to: '/products/$productId', params: { productId: p.id } })
  }

  const sectionLabel = SECTIONS.find((s) => s.id === section)!.label
  const idx = SECTIONS.findIndex((s) => s.id === section)
  const isPending = busy !== null
  const nextSection = SECTIONS[idx + 1]
  const phaseLabel = phase ? PHASE_LABEL(phase) : null
  const sendLabel = busy === 'send' && phaseLabel ? phaseLabel : listOn.length && !aiPaused ? 'Send to agent now' : 'Save product'

  // Phones: the section list scrolls sideways; keep the current one in view. 'nearest' never moves the page.
  // Desktop: the form pane scrolls on its own; a new section starts at its top.
  const firstSection = useRef(true)
  useEffect(() => {
    navRef.current?.querySelector<HTMLElement>('[aria-current="step"]')?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' })
    if (firstSection.current) firstSection.current = false
    else bodyRef.current?.scrollTo?.({ top: 0 })
  }, [section])

  const attrField = (f: AttrField) =>
    f.pick ? (
      <PickOrOtherField
        key={f.key}
        id={`g-attr-${f.key}`}
        label={f.label}
        critical={f.critical}
        options={f.pick === 'fabric' ? FABRIC_TYPES : COLOURS}
        value={values.attrs[f.key] ?? ''}
        onChange={(v) => setAttr(f.key, v)}
        onBlur={() => touch(`attr.${f.key}`)}
        error={errors[`attr.${f.key}`]}
        submitCount={submitCount}
        hint={f.hint}
        needed={f.key === 'fabric_type' || f.key === 'color' ? need(f.key) : undefined}
        otherPlaceholder={f.pick === 'fabric' ? 'For example Cotton Flex' : 'For example Rani Pink'}
      />
    ) : (
      <TextField
        key={f.key}
        id={`g-attr-${f.key}`}
        label={f.label}
        critical={f.critical}
        value={values.attrs[f.key] ?? ''}
        onChange={(v) => setAttr(f.key, v)}
        onBlur={() => touch(`attr.${f.key}`)}
        error={errors[`attr.${f.key}`]}
        submitCount={submitCount}
        maxLength={ATTRIBUTE_TEXT_MAX * 2}
        hint={f.hint}
      />
    )

  const compositionErrors = Object.fromEntries(
    Object.entries(errors).flatMap(([k, v]) => (k.startsWith('composition.') ? [[k.slice('composition.'.length), v]] : [])),
  )
  const partyErrors = Object.fromEntries(
    Object.entries(errors).flatMap(([k, v]) => (k.startsWith('manufacturer.') ? [[k.slice('manufacturer.'.length), v]] : [])),
  )

  const body = (() => {
    switch (section) {
      case 'identity':
        return (
          <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
            <TextField
              id="g-title"
              label="Product name"
              required
              value={values.title}
              onChange={(title) => set({ title })}
              onBlur={() => touch('title')}
              error={errors.title}
              hint="What you call it. The agent writes marketplace titles."
              submitCount={submitCount}
              maxLength={TITLE_MAX * 2}
              autoFocus
              className="md:col-span-2"
            />
            <BrandField
              id="g-brand_name"
              own={values.ownBrand}
              onOwnChange={(ownBrand) => set({ ownBrand })}
              value={values.brandName}
              onChange={(brandName) => set({ brandName })}
              onBlur={() => touch('brand_name')}
              defaultName={storeName}
              error={errors.brand_name}
              submitCount={submitCount}
              className="md:col-span-2"
            />
            <TextField
              id="g-style_number"
              label="Style number"
              value={values.styleNumber}
              onChange={(styleNumber) => set({ styleNumber })}
              onBlur={() => touch('style_number')}
              error={errors.style_number}
              hint="Your design or style code, like KS-1042. Optional."
              submitCount={submitCount}
              maxLength={64 + 8}
              code
            />
            <SkuField
              id="g-sku"
              value={values.sku}
              onChange={(sku) => set({ sku })}
              onBlur={() => touch('sku')}
              error={errors.sku}
              submitCount={submitCount}
              category={values.category}
              brandName={values.ownBrand ? values.brandName : storeName}
            />
            <BarcodeField
              id="g-barcode"
              needed={need('identifier')}
              amazon={listOn.includes('amazon')}
              value={values.barcode}
              onChange={(barcode) => set({ barcode })}
              onBlur={() => touch('barcode')}
              error={errors.barcode}
              submitCount={submitCount}
              className="md:col-span-2"
            />
          </div>
        )
      case 'category':
        return (
          <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
            <div className="flex flex-col gap-2.5">
              <CategorySelect
                id="g-category"
                value={values.category}
                onChange={(category) => set({ category, kuinnSuggests: false })}
                onBlur={() => touch('category')}
                lampsEnabled={lamps.enabled}
                catalog={catalogItems}
                error={errors.category}
                submitCount={submitCount}
                required={!values.kuinnSuggests}
                disabled={values.kuinnSuggests}
                hint={values.kuinnSuggests ? 'Kuinn suggests a category after you save. You choose the one to use.' : undefined}
              />
              {categoryMapping ? (
                <p className="text-caption text-ink-2" data-testid="g-category-mapping">
                  {categoryMapping}
                </p>
              ) : null}
              {categoryUnmapped ? (
                <p className="text-caption text-attention-ink" data-testid="g-category-unmapped">
                  {categoryUnmapped}
                </p>
              ) : null}
              {suggestOn && !values.kuinnSuggests ? (
                <CategorySuggest
                  draft={draftBody(values.title, values.ownBrand ? values.brandName : storeName, values.attrs)}
                  value={values.category}
                  onPick={(category) => {
                    set({ category, kuinnSuggests: false })
                    touch('category')
                  }}
                />
              ) : null}
              {suggestOn ? (
                <label className="flex cursor-pointer items-center gap-2.5 text-small text-ink" data-testid="g-kuinn-suggests">
                  <Switch
                    checked={values.kuinnSuggests}
                    onCheckedChange={(on) => set(on ? { kuinnSuggests: true, category: '' } : { kuinnSuggests: false })}
                    aria-describedby="g-kuinn-suggests-hint"
                  />
                  <span>
                    Let Kuinn suggest
                    <span id="g-kuinn-suggests-hint" className="block text-caption text-ink-3">
                      Not sure? Skip it, and confirm Kuinn’s suggestion on the product page.
                    </span>
                  </span>
                </label>
              ) : null}
            </div>
            <AudienceSelect
              id="g-gender"
              needed={need('gender')}
              value={values.gender}
              onChange={(gender) => set({ gender })}
              error={errors.gender}
              submitCount={submitCount}
            />
          </div>
        )
      case 'fabric':
        return (
          <div className="flex flex-col gap-5">
            <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
              {ATTR_FIELDS.filter((f) => f.key === 'fabric_type').map(attrField)}
              <div className="md:col-span-2">
                <CompositionEditor
                  id="g-composition"
                  rows={values.composition}
                  onChange={(composition) => set({ composition })}
                  errors={compositionErrors}
                  totalError={errors['attr.fiber_composition']}
                  onBlur={(k) => {
                    touch(k)
                    touch('attr.fiber_composition')
                  }}
                  submitCount={submitCount}
                />
              </div>
              {ATTR_FIELDS.filter((f) => f.section === 'fabric' && f.key !== 'fabric_type').map(attrField)}
            </div>
            <ExtraAttributes values={values} setValues={setValues} errors={errors} touch={touch} submitCount={submitCount} />
            <CriticalNote />
          </div>
        )
      case 'size':
        return (
          <div className="flex flex-col gap-4">
            <p className="text-body text-ink-2">The measurements for each size. Marketplaces show them as the size chart.</p>
            {need('size_chart') ? (
              <p className="flex items-center gap-2 text-small" data-testid="size-chart-needed">
                <SourceBadge source={{ kind: 'needed', detail: need('size_chart')! }} />
                <span className="text-ink-2">Add at least one size before you send it.</span>
              </p>
            ) : null}
            <SizeChartEditor id="g-size" value={values.sizeChart} onChange={(sizeChart) => set({ sizeChart })} errors={errors} onBlur={touch} />
            <p className="text-caption text-ink-3">
              Have a size chart photo? Add it in Images as Size chart. Once the product is saved, you can read the sizes from it on the product page and check them before saving.
            </p>
          </div>
        )
      case 'media':
        return (
          <NewProductImages
            images={images}
            onAdd={addImages}
            onRemove={removeImage}
            onRetry={retryImage}
            error={errors.images}
            locked={isPending}
            views={photoViews}
            sellOn={listOn}
            hasChart={hasSizeRows(values.sizeChart)}
          />
        )
      case 'price':
        return (
          <div className="flex flex-col gap-4">
            <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
              <MoneyField
                id="g-mrp"
                label="MRP"
                critical
                value={values.mrp}
                onChange={(mrp) => set({ mrp })}
                onBlur={() => touch('mrp')}
                error={errors.mrp}
                hint="The printed maximum retail price. Needed to publish."
                needed={need('mrp')}
                submitCount={submitCount}
              />
              <MoneyField
                id="g-selling_price"
                label="Selling price"
                value={values.sellingPrice}
                onChange={(sellingPrice) => set({ sellingPrice })}
                onBlur={() => touch('selling_price')}
                error={errors.selling_price}
                hint={priceHint(values)}
                needed={need('selling_price')}
                submitCount={submitCount}
              />
            </div>
            <p className="text-caption text-ink-3">In rupees, tax included. Sizes or colours with a different price are set on the variants step.</p>
          </div>
        )
      case 'shipping':
        return (
          <div className="flex flex-col gap-5">
            <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
              <HsnField
                id="g-hsn"
                value={values.hsn}
                suggested={values.hsnSuggested}
                onChange={(hsn) => set({ hsn, hsnSuggested: false })}
                onBlur={() => touch('hsn_code')}
                error={errors.hsn_code}
                needed={need('hsn_code')}
                submitCount={submitCount}
              />
              <CountryField
                id="g-country"
                value={values.country}
                onChange={(country) => {
                  set({ country })
                  touch('country_of_origin')
                }}
                error={errors.country_of_origin}
                needed={need('country_of_origin')}
                submitCount={submitCount}
                allowClear
              />
            </div>
            <PackageFields
              id="g-package"
              value={values.pkg}
              onChange={(pkg) => set({ pkg })}
              onBlur={touch}
              errors={errors}
              neededSize={need('package_size')}
              neededWeight={need('package_weight')}
              category={values.category}
              submitCount={submitCount}
            />
            <PackageFields
              kind="item"
              id="g-item"
              value={values.item}
              onChange={(item) => set({ item })}
              onBlur={touch}
              errors={errors}
              neededSize={need('product_size')}
              submitCount={submitCount}
            />
            <p className="text-caption text-ink-3">Amazon and Flipkart both ask for the package and the country of origin. Flipkart also asks for the HSN code.</p>
          </div>
        )
      case 'care':
        return (
          <div className="flex flex-col gap-5">
            <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">{ATTR_FIELDS.filter((f) => f.section === 'care').map(attrField)}</div>
            <ManufacturerChoice
              brandParty={brandParty}
              brandState={brand.isPending ? 'pending' : brand.error ? 'error' : 'ready'}
              onRetryBrand={() => void brand.refetch()}
              canManageBrand={canManageBrand}
              own={values.ownManufacturer}
              onOwn={(ownManufacturer) => set({ ownManufacturer })}
              party={values.manufacturer}
              onParty={(manufacturer) => set({ manufacturer })}
              errors={partyErrors}
              onBlur={(k) => touch(`manufacturer.${k}`)}
              submitCount={submitCount}
              needed={need('manufacturer')}
            />
            <CriticalNote />
          </div>
        )
      case 'variants':
        return (
          <LaCard>
            <p className="text-body text-ink">Sizes and colours, each with its own SKU and price if it differs, are added on the next step, once this product is saved.</p>
          </LaCard>
        )
    }
  })()

  return (
    // From 1024px the sections list, the form and the summary scroll on their own above the pinned
    // footer, so the short columns never scroll away with a long section.
    <SplitLayout className="flex min-h-[calc(100svh-56px)] flex-col lg:min-h-0">
      <div className="grid flex-1 grid-cols-1 content-start lg:min-h-0 lg:grid-cols-[190px_minmax(0,1fr)_290px] lg:content-stretch">
        <ScrollPane as="nav" scrollId="guided-sections" aria-label="Sections" className="border-b border-line bg-canvas px-3.5 py-4 lg:border-r lg:border-b-0 lg:py-6">
          <h2 className="mb-2 px-2.5 font-display text-h3 text-ink">Sections</h2>
          <ul ref={navRef} className="relative flex gap-0.5 overflow-x-auto lg:flex-col">
            {SECTIONS.map((s) => (
              <li key={s.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setSection(s.id)}
                  aria-current={s.id === section ? 'step' : undefined}
                  className={cn(
                    'focus-ring tactile flex h-10 w-full items-center justify-between gap-3 rounded-lg border px-2.5 text-left text-body text-ink active:shadow-pressed',
                    s.id === section ? 'border-line bg-surface font-bold text-brand shadow-raised-sm' : 'border-transparent hover:bg-hover',
                  )}
                >
                  {s.label}
                  <SectionMark state={states[s.id]} />
                </button>
              </li>
            ))}
          </ul>
        </ScrollPane>

        <ScrollPane
          as="section"
          ref={bodyRef}
          scrollId="guided-form"
          resetOnNavigate
          aria-labelledby="g-heading"
          className="flex flex-col gap-5 px-4 py-6 md:px-7"
        >
          <div className="min-w-0">
            <h1 id="g-heading" className="truncate font-display text-h1 text-ink">
              {values.title.trim() || 'New product'}
            </h1>
            <p className="mt-1 text-body text-pretty text-ink-2 [overflow-wrap:anywhere] md:truncate">
              {[values.styleNumber.trim(), values.sku.trim(), values.category.trim() ? categoryLabel(values.category) : values.kuinnSuggests ? 'Category from Kuinn' : null].filter(Boolean).join(' · ') ||
                'Fill in what you know. Only the name, SKU and category are needed to save.'}
            </p>
          </div>
          {created ? (
            <Banner tone="success" role="status" title="Saved">
              {created.sku} is in your catalog.{' '}
              <Link to="/products/$productId" params={{ productId: created.id }} className="font-semibold underline">
                Open it
              </Link>
            </Banner>
          ) : null}
          {conflict && !created ? (
            <div data-testid="sku-conflict">
              <Banner tone="attention" role="status" title={`${conflict.sku} is already in your catalog`}>
                {canContinue
                  ? 'If you saved it a moment ago and the connection dropped, it did go through. '
                  : 'Use a different SKU for a new product, or open the existing one. '}
                <Link to="/products/$productId" params={{ productId: conflict.id }} className="font-semibold underline">
                  Open {conflict.sku}
                </Link>
                {canContinue ? (
                  <>
                    {' · '}
                    <button
                      type="button"
                      className="focus-ring rounded font-semibold underline"
                      onClick={() => {
                        const p = conflict
                        setCreated(p)
                        setConflict(null)
                        setServerErrors({})
                        writeDraft(draftKey, null)
                        setSavedAt(null)
                        // Photos the first attempt may not have attached go up to it now. Never the
                        // Front when the product has one: Continue fills gaps, it does not replace.
                        const hasFront = p.image_details ? p.image_details.some((d) => d.slot === 'main') : true
                        const rest = imagesRef.current.filter((i) => i.stage.kind !== 'invalid' && i.stage.kind !== 'done' && !(hasFront && i.slot === 'main'))
                        if (rest.length)
                          void uploadAfterSave(p.id, rest).finally(() => setPhase(null))
                      }}
                    >
                      Continue with it
                    </button>
                  </>
                ) : null}
              </Banner>
            </div>
          ) : null}
          {formError ? (
            <Banner tone="danger" role="alert" title="Couldn’t save this product">
              {isApiError(formError) && formError.status === 0
                ? 'Can’t reach the server. Your draft is kept in this browser; try again.'
                : isApiError(formError)
                  ? formError.message
                  : 'Something went wrong. Try again.'}
              {isApiError(formError) ? <ReferenceId id={formError.correlationId} className="mt-1" /> : null}
            </Banner>
          ) : null}
          <div key={section} className="flex animate-page-in flex-col gap-4">
            <div>
              <p className="text-caption text-ink-3">
                Section {idx + 1} of {SECTIONS.length}
              </p>
              <h2 className="mt-0.5 text-h3 text-ink">{sectionLabel}</h2>
            </div>
            {/* Locked while saving: an edit made now would be lost (the draft is cleared on save). */}
            <fieldset disabled={isPending} aria-busy={isPending || undefined} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0" data-testid="guided-fields">
              {body}
            </fieldset>
          </div>
        </ScrollPane>

        <ScrollPane as="aside" scrollId="guided-summary" aria-labelledby="g-summary" className="border-t border-line bg-canvas px-4 py-6 lg:border-t-0 lg:border-l">
          <div className="flex flex-col gap-3">
            <h2 id="g-summary" className="font-display text-h3 text-ink">
              Before you save
            </h2>
            {missing.length ? (
              <AttentionCard pad="sm" className="flex items-start gap-3">
                <IconTile icon="alert" tone="warn" size="sm" flat />
                <div className="min-w-0">
                  <b className="text-ink">
                    {missing.length} critical {missing.length === 1 ? 'input' : 'inputs'} missing
                  </b>
                  <p className="mt-0.5 text-small text-attention-ink">{missing.join(', ')}</p>
                  <p className="mt-1 text-caption text-ink-2">You can save now and add them later.</p>
                </div>
              </AttentionCard>
            ) : (
              <LaCard pad="sm" emphasis="success" className="flex items-start gap-3">
                <IconTile icon="check" tone="ok" size="sm" flat />
                <div className="min-w-0">
                  <b className="text-ink">Critical inputs filled</b>
                  <p className="mt-0.5 text-small text-success-ink">The agent will not guess any of them.</p>
                </div>
              </LaCard>
            )}
            <LaCard pad="sm">
              <h3 className="text-h3 text-ink">Ready to list on</h3>
              {listOn.length ? (
                <ul className="mt-3 flex flex-col gap-2.5">
                  {listOn.map((m) => (
                    <li key={m} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-small">
                      <MarketplaceName id={m} size="sm" className="shrink-0" />
                      <TagChip tone="plain" className="shrink-0">
                        Checked after drafting
                      </TagChip>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-small text-ink-2">
                  No marketplace chosen, so saving starts no draft.{' '}
                  <Link to="/add" className="font-semibold text-brand hover:underline">
                    Choose marketplaces
                  </Link>
                </p>
              )}
              {needSummary ? (
                <div className="mt-3 border-t border-line pt-3" data-testid="needs-summary">
                  <p className="text-small font-semibold text-attention-ink">{needSummary}</p>
                  <ul className="mt-1.5 flex flex-col gap-1">
                    {needs.map((n) => (
                      <li key={n.field.id} className="flex items-start justify-between gap-2 text-caption">
                        <span className="text-ink">{n.field.label}</span>
                        <span className="text-right text-ink-3">{n.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {listOn.length && photosNeeded.length ? (
                <p className="mt-3 border-t border-line pt-3 text-small text-attention-ink" data-testid="photos-needed-summary">
                  Photos needed before approval: {photosNeeded.join(', ')}. The draft can still start.
                </p>
              ) : null}
              <p className="mt-3 text-caption text-ink-3">Readiness is checked against each marketplace’s rules once the agent drafts the listing.</p>
            </LaCard>
            <LaCard pad="sm">
              <p className="text-caption text-ink-2">Category</p>
              <p className="mt-1 truncate text-small font-semibold text-ink" data-testid="guided-category-summary">
                {values.category.trim() ? categoryLabel(values.category) : values.kuinnSuggests ? 'Kuinn suggests after saving' : 'Not chosen yet'}
              </p>
            </LaCard>
          </div>
        </ScrollPane>
      </div>

      <FooterBar
        status={
          busy && phaseLabel
            ? phaseLabel
            : created
              ? `Saved ${format(new Date(created.created_at), 'HH:mm')}`
              : savedAt
                ? `Draft kept in this browser ${format(new Date(savedAt), 'HH:mm')}`
                : 'Nothing is saved yet.'
        }
      >
        <Button
          variant="ghost"
          disabled={isPending}
          onClick={() => {
            if (idx > 0) setSection(SECTIONS[idx - 1]!.id)
            else void navigate({ to: '/add' })
          }}
        >
          Back
        </Button>
        {nextSection ? (
          <Button variant="secondary" disabled={isPending} onClick={() => setSection(nextSection.id)} data-testid="guided-step">
            Next: {nextSection.label}
            <Icon name="arrow" size={16} />
          </Button>
        ) : (
          <Button variant="secondary" disabled={isPending} onClick={() => void onNext()} data-testid="guided-next">
            {busy === 'next' ? <Spinner data-icon="inline-start" aria-hidden /> : null}
            {busy === 'next' ? (phaseLabel ?? 'Saving product…') : 'Save and add variants'}
          </Button>
        )}
        <Button className="min-w-44" disabled={isPending} onClick={() => void onSend()} data-testid="guided-send">
          {busy === 'send' ? <Spinner data-icon="inline-start" aria-hidden /> : listOn.length ? <Icon name="spark" size={16} /> : null}
          {sendLabel}
        </Button>
      </FooterBar>
    </SplitLayout>
  )
}

type SavePhase =
  | { kind: 'saving' }
  | { kind: 'images'; done: number; total: number }
  | { kind: 'checking' }
  | { kind: 'drafts'; done: number; total: number }

const PHASE_LABEL = (p: SavePhase) =>
  p.kind === 'saving'
    ? 'Saving product…'
    : p.kind === 'images'
      ? `Uploading photos ${p.done + 1}/${p.total}…`
      : p.kind === 'checking'
        ? 'Checking photos…'
        : `Starting drafts ${p.done}/${p.total}…`

/** Poll the product until no image check is pending (at most ~20 s), so drafts see the photos. */
async function waitForImageChecks(productId: string, timeoutMs = 20_000): Promise<void> {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    try {
      const p = await fetchProduct(productId)
      const details = p.image_details ?? []
      if (details.length && !details.some((d) => d.compliance_status === 'pending')) return
    } catch {
      return
    }
    await new Promise((r) => setTimeout(r, 1500))
  }
}

function priceHint(v: GuidedValues): string {
  const off = discountPercent(v.sellingPrice, v.mrp)
  if (off) return `${off}% below MRP. At or below the MRP.`
  return 'What the customer pays. At or below the MRP.'
}

function CriticalNote() {
  return (
    <p className="flex items-start gap-1.5 text-caption text-ink-3">
      <IconGlyph icon={CONCEPT_ICON.critical} size={14} className="mt-[calc((1lh-14px)/2)] text-attention" />
      Critical facts can block a listing. The agent never fills them.
    </p>
  )
}

/**
 * Who made it: the brand's default manufacturer (set once in Brand profile), or this product's
 * own when it differs. With no brand default, the seller can set one there or enter it here.
 */
function ManufacturerChoice({
  brandParty,
  brandState,
  onRetryBrand,
  canManageBrand,
  own,
  onOwn,
  party,
  onParty,
  errors,
  onBlur,
  submitCount,
  needed,
}: {
  needed?: string
  brandParty: PartyOut | null
  brandState: 'pending' | 'ready' | 'error'
  onRetryBrand: () => void
  canManageBrand: boolean
  own: boolean
  onOwn: (v: boolean) => void
  party: PartyDraft
  onParty: (p: PartyDraft) => void
  errors: Partial<Record<PartyField, string>>
  onBlur: (k: PartyField) => void
  submitCount: number
}) {
  return (
    <section aria-labelledby="g-mfr" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="g-mfr" className="flex items-center gap-1.5 text-h3 text-ink">
          Manufacturer
          <IconGlyph icon={CONCEPT_ICON.critical} size={14} className="text-attention" />
          <span className="sr-only">(critical fact)</span>
          {needed ? <SourceBadge source={{ kind: 'needed', detail: needed }} /> : null}
        </h3>
        {brandParty ? (
          <label className="flex items-center gap-2 text-small text-ink-2">
            <Switch checked={own} onCheckedChange={onOwn} aria-label="Different manufacturer for this product" />
            Different for this product
          </label>
        ) : null}
      </div>
      {brandState === 'pending' ? (
        <Skeleton className="h-20 rounded-card" />
      ) : brandState === 'error' && !own ? (
        <Banner tone="danger" role="alert" action={<Button variant="secondary" size="sm" onClick={onRetryBrand}>Try again</Button>}>
          Couldn’t load your brand’s manufacturer.
        </Banner>
      ) : brandParty && !own ? (
        <LaCard pad="sm" className="flex items-start gap-3" data-testid="brand-manufacturer">
          <IconTile icon="store" size="sm" flat />
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink">{brandParty.legal_name}</p>
            <p className="mt-0.5 text-small text-ink-2">
              {[brandParty.address_line1, brandParty.address_line2].filter(Boolean).join(', ')}
              {brandParty.address_line1 ? <br /> : null}
              {partyPlace(brandParty)}
            </p>
            <p className="mt-1.5">
              <SourceBadge source={{ kind: 'brand-profile' }} /> <span className="text-caption text-ink-3">Uses your brand manufacturer.</span>
            </p>
          </div>
        </LaCard>
      ) : null}
      {!brandParty && brandState === 'ready' && !own ? (
        <AttentionCard pad="sm" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-small text-ink">
            Your brand has no manufacturer yet. Set it once for every product{canManageBrand ? '' : ' (an owner or admin can)'}, or enter it for this one.
          </p>
          <div className="flex shrink-0 flex-wrap gap-2">
            {canManageBrand ? (
              <Button variant="secondary" size="sm" asChild>
                <Link to="/brand" hash="manufacturer">
                  Set for the brand
                </Link>
              </Button>
            ) : null}
            <Button size="sm" variant="warn" onClick={() => onOwn(true)}>
              Enter for this product
            </Button>
          </div>
        </AttentionCard>
      ) : null}
      {own ? (
        <div className="flex flex-col gap-3">
          <PartyFields id="g-mfr" value={party} onChange={onParty} errors={errors} onBlur={onBlur} submitCount={submitCount} />
          {!brandParty ? (
            <div>
              <Button variant="ghost" size="sm" className="-ml-3" onClick={() => onOwn(false)}>
                Not now
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function ExtraAttributes({
  values,
  setValues,
  errors,
  touch,
  submitCount,
}: {
  values: GuidedValues
  setValues: (fn: (v: GuidedValues) => GuidedValues) => void
  errors: GuidedErrors
  touch: (key: string) => void
  submitCount: number
}) {
  const update = (i: number, patch: Partial<{ key: string; value: string }>) =>
    setValues((v) => ({ ...v, extra: v.extra.map((x, j) => (j === i ? { ...x, ...patch } : x)) }))
  const formKeys = new Set<string>([...ATTR_FIELDS.map((f) => f.key), 'fiber_composition', 'size_measurements'])
  const options = ATTRIBUTE_KEY_SUGGESTIONS.filter((k) => !formKeys.has(k) && k !== 'material')
  return (
    <div className="flex flex-col gap-3">
      {values.extra.map((x, i) => (
        <div key={i} className="grid items-end gap-x-5 gap-y-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <LaField label={`Attribute ${i + 1}`} htmlFor={`g-extra-${i}-key`} error={errors[`extra.${i}.key`]} submitCount={submitCount} confirmFix>
            <Input
              id={`g-extra-${i}-key`}
              name={`g-extra-${i}-key`}
              value={x.key}
              list="g-extra-keys"
              placeholder="for example occasion"
              autoComplete="off"
              spellCheck={false}
              autoCapitalize="none"
              maxLength={64 + 8}
              onChange={(e) => update(i, { key: e.target.value })}
              onBlur={() => touch(`extra.${i}.key`)}
              aria-invalid={errors[`extra.${i}.key`] ? true : undefined}
              aria-describedby={fieldHintId(`g-extra-${i}-key`)}
            />
          </LaField>
          <LaField label="Value" htmlFor={`g-extra-${i}-value`} error={errors[`extra.${i}.value`]} source={x.value.trim() ? { kind: 'you' } : undefined} submitCount={submitCount} confirmFix>
            <Input
              id={`g-extra-${i}-value`}
              name={`g-extra-${i}-value`}
              value={x.value}
              autoComplete="off"
              maxLength={ATTRIBUTE_TEXT_MAX * 2}
              onChange={(e) => update(i, { value: e.target.value })}
              onBlur={() => touch(`extra.${i}.value`)}
              aria-invalid={errors[`extra.${i}.value`] ? true : undefined}
              aria-describedby={fieldHintId(`g-extra-${i}-value`)}
            />
          </LaField>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Remove attribute ${i + 1}`}
            onClick={() => setValues((v) => ({ ...v, extra: v.extra.filter((_, j) => j !== i) }))}
          >
            <Icon name="x" size={16} />
          </Button>
        </div>
      ))}
      <datalist id="g-extra-keys">
        {options.map((k) => (
          <option key={k} value={k} />
        ))}
      </datalist>
      <div>
        <Button variant="secondary" size="sm" onClick={() => setValues((v) => ({ ...v, extra: [...v.extra, { key: '', value: '' }] }))}>
          <Icon name="plus" size={16} />
          Add another attribute
        </Button>
      </div>
    </div>
  )
}
