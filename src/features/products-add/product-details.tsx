/**
 * Product detail > Overview: the seller's inputs as saved (read view) and their editor.
 *
 * Read: GET /products/{id} (style number, MRP and selling price, fabric, composition, colour,
 * care, size chart, the effective manufacturer with "Brand profile" when inherited).
 * Edit: PATCH /products/{id} with If-Match = the ETag the edit started from. 409 STALE_VERSION
 * loads the latest and keeps the person's changes for a second save; 422s land on the fields.
 */
import { Link } from '@tanstack/react-router'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { isApiError } from '@/api/errors'
import { Banner, CardHead, CONCEPT_ICON, fieldHintId, Icon, IconGlyph, LaCard, LaField, SourceBadge, StatusChip, TagChip } from '@/components/la'
import { AudienceSelect, BrandField } from '@/features/products/audience-fields'
import { tenantName, useMe } from '@/lib/auth'
import { brandView, GENDER_LABEL, hasAudience, hasBrandName, photoReadView, variantAxes } from '@/features/products/audience'
import { ReferenceId } from '@/components/states/reference-id'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { categoryChoices, type CategoryLock } from '@/features/products/categories'
import { type ProductDetail } from '@/features/products/api'
import { formatBarcode, styleExemption, type BarcodeHolder } from '@/features/products/barcode'
import { BarcodeField } from '@/features/products/barcode-field'
import { editableAttrs, type ManufacturerSource } from '@/features/products/edit-model'
import { CompositionEditor, MoneyField, PartyFields, PickOrOtherField, SizeChartEditor, TextField } from '@/features/products/intake-fields'
import {
  COLOURS,
  discountPercent,
  FABRIC_TYPES,
  formatMoney,
  MEASURE_LABEL,
  MEASURES,
  partyPlace,
  type PartyField,
} from '@/features/products/intake-model'
import { formatAttributeValue } from '@/features/products/format'
import { groupPhotoFacts, photoGroupKeys } from '@/features/photo-facts/model'
import { PhotoFactsGroup } from '@/features/photo-facts/photo-facts-group'
import { usePhotoFactActions } from '@/features/photo-facts/api'
import { OP_ACTION, useCan } from '@/lib/permissions'
import { editingSource, fieldSource, rawFieldSource } from '@/features/products/field-sources'
import { missingNeeds, missingSummary, needText, productFilled, useRequirements, type Filled, type Marketplace, type NeedFieldId } from '@/features/products/needs'
import { countryName, fromPackageOut, normalizeCountry, packageHasSize, packageHasWeight, packageText, samePackage } from '@/features/products/seller-fields'
import { CountryField, HsnField, PackageFields } from '@/features/products/seller-field-inputs'
import { isReadingPhotos } from '@/features/products/photo-reading'
import { SizeChartReadButton } from '@/features/products/size-chart-read-button'
import { SizeRunAction } from '@/features/products/size-run-action'
import { normalizeBarcode } from '@/features/products/barcode'
import { humanizeSlug, productCategoryLabel } from './catalog-model'
import type { ProductEditSession } from './product-edit-session'
import { ATTR_FIELDS, ATTR_LABEL } from './guided-model'
import { focusFirstInvalid } from '@/lib/validation'
import { cn } from '@/lib/utils'

/** One key column for every key-value list, so values line up. */
const KV_GRID = 'grid grid-cols-[minmax(96px,max-content)_minmax(0,1fr)] items-baseline gap-x-3 gap-y-2'

/** Keys the card shows in their own rows (the rest are listed under "More details"). */
const SHOWN = new Set<string>(['fabric_type', 'fiber_composition', 'color', 'wash_care', 'iron_care', 'size_measurements', 'size_chart_url'])
const MORE_VISIBLE = 6

function Missing({ critical, needed, children = 'Not set' }: { critical?: boolean; needed?: string; children?: ReactNode }) {
  // SI12: who needs it, when a marketplace the seller sells on does.
  if (needed) return <SourceBadge source={{ kind: 'needed', detail: needed }} />
  return critical ? (
    <span className="inline-flex items-center gap-1 text-attention-ink">
      <IconGlyph icon={CONCEPT_ICON.critical} size={12} />
      {children}
    </span>
  ) : (
    <span className="text-ink-3">{children}</span>
  )
}

function Row({ k, attr, children }: { k: string; attr?: string; children: ReactNode }) {
  return (
    <div className="contents" data-attr-key={attr}>
      <dt className="whitespace-nowrap text-ink-2">{k}</dt>
      <dd className="flex min-w-0 flex-wrap items-center gap-2 break-words text-ink">{children}</dd>
    </div>
  )
}

/** A style holds no barcode: say how many of its variants are exempt (a variant with one never is). */
function StyleBarcode({ variants }: { variants: readonly BarcodeHolder[] }) {
  const { exemptCount, total } = styleExemption(variants)
  if (!total || !exemptCount) return <span className="text-ink-2">Set on each variant</span>
  return (
    <span className="tabular-nums" data-testid="product-barcode">
      {exemptCount} of {total} {total === 1 ? 'variant' : 'variants'} exempt
    </span>
  )
}

/** The package parts still needed: one chip, or "Size: …" and "Weight: …" when they differ. */
function PackageNeeds({ pkg, size, weight }: { pkg: string; size?: string; weight?: string }) {
  if (!size && !weight) return pkg ? null : <Missing />
  if (size && weight && size === weight) return <SourceBadge source={{ kind: 'needed', detail: size }} />
  return (
    <>
      {size ? <SourceBadge source={{ kind: 'needed', detail: `Size: ${size.toLocaleLowerCase('en')}` }} /> : null}
      {weight ? <SourceBadge source={{ kind: 'needed', detail: `Weight: ${weight.toLocaleLowerCase('en')}` }} /> : null}
    </>
  )
}

/**
 * The source chip of a saved value (SI12 `field_sources`). A value read from a photo and not yet
 * confirmed gets a Confirm, the same action as the "From photos" list.
 */
function FieldChip({
  product,
  k,
  actions,
  canAct,
}: {
  product: ProductDetail
  k: string
  actions: ReturnType<typeof usePhotoFactActions>
  canAct: boolean
}) {
  const src = fieldSource(product, k)
  if (!src) return null
  const fact = src.kind === 'photo' ? product.photo_facts?.find((f) => f.key === k && !f.confirmed) : undefined
  const pending = actions.pending[k]
  if (fact && pending === 'confirm') return <SourceBadge source={{ kind: 'confirmed' }} />
  return (
    <>
      <SourceBadge source={src} />
      {fact && canAct ? (
        <Button
          variant="secondary"
          size="xs"
          onClick={() => void actions.confirm(fact)}
          aria-label={`Confirm ${(ATTR_LABEL[k] ?? humanizeSlug(k)).toLocaleLowerCase('en')}: ${String(fact.value)}`}
          data-testid={`field-confirm-${k}`}
        >
          <Icon name="check" size={12} />
          Confirm
        </Button>
      ) : null}
      {actions.errors[k] ? (
        <span role="alert" className="text-caption text-danger">
          {actions.errors[k]}
        </span>
      ) : null}
    </>
  )
}

/** The saved values. `onEdit` is absent when the person may not edit (no product:import). */
export function ProductDetailsCard({
  product,
  isVariant,
  isStyle = false,
  variants = [],
  source,
  onEdit,
  categoryAction,
  sellOn = [],
}: {
  product: ProductDetail
  /** SI12: the marketplaces this product is sold on (its listings and the connected ones). */
  sellOn?: readonly Marketplace[]
  isVariant: boolean
  /** The product has variants: each one holds its own barcode. */
  isStyle?: boolean
  /** A style's variants, for the exemption count. */
  variants?: readonly BarcodeHolder[]
  source: ManufacturerSource
  onEdit?: () => void
  /** "Change category" (SI9 recategorize), once the product has listings. */
  categoryAction?: ReactNode
}) {
  const a = product.attributes ?? {}
  const brand = brandView(product)
  const axes = isVariant ? variantAxes(product) : []
  const photoRead = product.photo_read ? photoReadView(product.photo_read) : null
  const text = (k: string) => {
    const v = a[k]
    return typeof v === 'string' ? v.trim() : v == null ? '' : formatAttributeValue(v, product.attribute_literals[k])
  }
  const comp = product.fiber_composition?.length
    ? product.fiber_composition.map((f) => `${f.percent}% ${f.fibre.charAt(0).toLocaleUpperCase('en')}${f.fibre.slice(1)}`).join(' · ')
    : text('fiber_composition')
  const photoRows = useMemo(() => groupPhotoFacts(product), [product])
  const more = useMemo(() => {
    const inPhotos = photoGroupKeys(photoRows)
    return Object.entries(product.attributes ?? {})
      .filter(([k]) => !SHOWN.has(k) && !inPhotos.has(k))
      .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
  }, [product.attributes, photoRows])
  const photoColour = product.photo_facts?.find((f) => f.key === 'color')
  const [expanded, setExpanded] = useState(false)
  const mrp = formatMoney(product.mrp)
  const price = formatMoney(product.selling_price)
  const off = product.mrp && product.selling_price ? discountPercent(product.selling_price, product.mrp) : null
  const m = product.manufacturer
  const chart = product.size_chart
  const cols = chart ? MEASURES.filter((x) => chart.rows.some((r) => r[x] != null)) : []

  // SI12: where each value came from, and what the marketplaces still need.
  const can = useCan()
  const canAct = can(OP_ACTION['PATCH /products/{product_id}'])
  const actions = usePhotoFactActions(product)
  const requirements = useRequirements(product.category)
  const needs = missingNeeds(requirements.data, sellOn, productFilled(product, { isVariant, isStyle }))
  const need = (id: NeedFieldId) => needText(needs, id)
  const summary = missingSummary(needs)
  const chip = (key: string) => <FieldChip product={product} k={key} actions={actions} canAct={canAct} />
  const hsnSuggestion = product.hsn_code ? null : (product.suggestions?.hsn_code?.value ?? null)
  const pkg = packageText(product.package)

  return (
    <LaCard data-testid="product-details">
      <CardHead
        title="Product details"
        sub={
          <>
            What you told us. The agent uses these and never guesses the critical ones.
            {summary ? (
              <span className="mt-1.5 flex" data-testid="details-needs-summary">
                <SourceBadge source={{ kind: 'needed', detail: summary }} />
              </span>
            ) : null}
          </>
        }
        action={
          onEdit ? (
            <Button variant="secondary" size="sm" onClick={onEdit} data-testid="product-edit">
              <IconGlyph icon={CONCEPT_ICON.edit} size={16} />
              Edit
            </Button>
          ) : null
        }
      />
      <div data-testid="product-attributes">
        <dl className={cn('mt-4 text-small', KV_GRID)}>
          <Row k="Category">
            {productCategoryLabel(product.category)} <SourceBadge source={fieldSource(product, 'category') ?? { kind: 'you' }} />
            {categoryAction}
          </Row>
          {isVariant ? null : <Row k="Style number">{product.style_number ? <span className="font-mono">{product.style_number}</span> : <Missing />}</Row>}
          {axes.map((x) => (
            <Row key={x.key} k={x.label} attr={`variant.${x.key}`}>
              <span data-testid={`variant-axis-${x.key}`}>{x.value}</span>
            </Row>
          ))}
          {hasBrandName(product) ? (
            <Row k="Brand" attr="brand_name">
              {brand.name ? <span data-testid="product-brand">{brand.name}</span> : <Missing needed={need('brand_name')}>Your store name</Missing>}
              {brand.inherited ? <SourceBadge source={{ kind: 'brand-profile' }} /> : brand.name ? chip('brand_name') : null}
            </Row>
          ) : null}
          {hasAudience(product) && !isVariant ? (
            <Row k="Audience" attr="gender">
              {product.gender ? (
                <>
                  <span data-testid="product-gender">{GENDER_LABEL[product.gender]}</span>
                  {chip('gender')}
                </>
              ) : (
                <Missing needed={need('gender')}>Needed for Amazon</Missing>
              )}
            </Row>
          ) : null}
          <Row k="Barcode" attr="identifier">
            {product.product_identifier ? (
              <span className="font-mono tabular-nums" data-testid="product-barcode">
                {formatBarcode(product.product_identifier)}
              </span>
            ) : isStyle ? (
              <StyleBarcode variants={variants} />
            ) : product.identifier_exemption ? (
              <span data-testid="product-barcode">No barcode (exempt)</span>
            ) : (
              <Missing needed={need('identifier')}>Needed for Amazon</Missing>
            )}
          </Row>
          <Row k="MRP" attr="mrp">
            {mrp ? (
              <>
                <span className="tabular-nums">{mrp}</span>
                {chip('mrp')}
              </>
            ) : (
              <Missing critical needed={need('mrp')}>Needed to publish</Missing>
            )}
          </Row>
          <Row k="Selling price">
            {price ? (
              <>
                <span className="tabular-nums">{price}</span>
                {off ? <span className="text-caption text-success-ink">{off}% off</span> : null}
                {chip('selling_price')}
              </>
            ) : (
              <Missing needed={need('selling_price')} />
            )}
          </Row>
          <Row k="Fabric type" attr="fabric_type">
            {text('fabric_type') ? (
              <>
                {text('fabric_type')}
                {chip('fabric_type')}
              </>
            ) : (
              <Missing critical needed={need('fabric_type')} />
            )}
          </Row>
          <Row k="Composition" attr="fiber_composition">
            {comp ? (
              <>
                {comp}
                {chip('fiber_composition')}
              </>
            ) : (
              <Missing critical />
            )}
          </Row>
          {isVariant ? null : (
            <Row k="Colour" attr="color">
              {text('color') || <Missing needed={need('color')} />}
              {/* The seller's colour always wins; a photo colour is marked until it is confirmed. */}
              {text('color') ? (rawFieldSource(product, 'color') ? chip('color') : photoColour && !photoColour.confirmed ? <SourceBadge source={{ kind: 'photo' }} /> : null) : null}
            </Row>
          )}
          {(['wash_care', 'iron_care'] as const).map((k) => (
            <Row key={k} k={k === 'wash_care' ? 'Wash care' : 'Iron care'} attr={k}>
              {text(k) ? (
                <>
                  {text(k)}
                  {chip(k)}
                </>
              ) : (
                <Missing critical />
              )}
            </Row>
          ))}
          <Row k="HSN code" attr="hsn_code">
            {product.hsn_code ? (
              <>
                <span className="font-mono tabular-nums" data-testid="product-hsn">
                  {product.hsn_code}
                </span>
                {chip('hsn_code')}
              </>
            ) : hsnSuggestion ? (
              <>
                <span className="font-mono text-ink-2 tabular-nums" data-testid="product-hsn-suggested">
                  {hsnSuggestion}
                </span>
                <SourceBadge source={{ kind: 'suggested' }} />
                <span className="text-caption text-ink-3">{onEdit ? 'Edit and save to confirm it.' : 'Not saved yet.'}</span>
                {need('hsn_code') ? <SourceBadge source={{ kind: 'needed', detail: need('hsn_code') }} /> : null}
              </>
            ) : (
              <Missing needed={need('hsn_code')} />
            )}
          </Row>
          <Row k="Package" attr="package">
            {pkg ? (
              <>
                <span className="tabular-nums" data-testid="product-package">
                  {pkg}
                </span>
                {chip('package')}
              </>
            ) : null}
            {!packageHasSize(fromPackageOut(product.package)) || !packageHasWeight(fromPackageOut(product.package)) ? (
              <PackageNeeds pkg={pkg} size={need('package_size')} weight={need('package_weight')} />
            ) : null}
          </Row>
          <Row k="Country of origin" attr="country_of_origin">
            {product.country_of_origin ? (
              <>
                <span data-testid="product-country">{countryName(product.country_of_origin)}</span>
                {chip('country_of_origin')}
              </>
            ) : (
              <Missing needed={need('country_of_origin')} />
            )}
          </Row>
          <Row k="Manufacturer">
            {m?.legal_name ? (
              <span className="flex min-w-0 flex-col">
                <span className="flex flex-wrap items-center gap-2">
                  {m.legal_name}
                  {source === 'brand' ? <SourceBadge source={{ kind: 'brand-profile' }} /> : null}
                  {source === 'style' ? <TagChip tone="plain">From the style</TagChip> : null}
                  {source === 'own' ? chip('manufacturer') : null}
                </span>
                <span className="text-caption text-ink-2">{partyPlace(m)}</span>
              </span>
            ) : (
              <Missing critical needed={need('manufacturer')} />
            )}
          </Row>
          {isVariant ? null : (
            <Row k="Size chart" attr="size_measurements">
              {chart ? (
                <>
                  <span className="text-ink-2">
                    {chart.rows.length} {chart.rows.length === 1 ? 'size' : 'sizes'}, {chart.unit === 'in' ? 'inches' : 'cm'}, {chart.basis === 'garment' ? 'garment' : 'body'} measurements
                  </span>
                  {chip('size_chart')}
                </>
              ) : product.size_chart_url ? (
                <a href={product.size_chart_url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-semibold text-brand hover:underline">
                  Open the size chart link
                  <Icon name="external" size={12} />
                </a>
              ) : (
                <Missing />
              )}
            </Row>
          )}
        </dl>
        {chart && !isVariant ? (
          <div className="mt-3 max-w-full overflow-x-auto rounded-tile border border-line" data-testid="size-chart-table">
            <table className="w-full min-w-max text-caption">
              <thead>
                <tr className="bg-sunken text-left text-ink-2">
                  <th scope="col" className="px-3 py-1.5 font-semibold">
                    Size
                  </th>
                  {cols.map((c) => (
                    <th key={c} scope="col" className="px-3 py-1.5 text-right font-semibold">
                      {MEASURE_LABEL[c]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {chart.rows.map((r) => (
                  <tr key={r.size} className="border-t border-line">
                    <th scope="row" className="px-3 py-1.5 text-left font-semibold text-ink">
                      {r.size}
                    </th>
                    {cols.map((c) => (
                      <td key={c} className="px-3 py-1.5 text-right text-ink tabular-nums">
                        {r[c] ?? '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {chart && !isVariant && onEdit ? <SizeRunAction product={product} /> : null}
        {isReadingPhotos(product) && !isVariant ? (
          <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line pt-4 text-small" data-testid="photo-reading" role="status">
            <Spinner aria-hidden className="size-4 text-brand" />
            <span className="font-semibold text-ink">Reading details from your photos</span>
            <span className="text-ink-2">What Kuinn finds shows here for you to confirm.</span>
          </div>
        ) : photoRead ? (
          <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line pt-4 text-small" data-testid="photo-read">
            <StatusChip status={photoRead.chip}>{photoRead.label}</StatusChip>
            <span className="text-ink-2">{photoRead.detail}</span>
            {product.photo_read?.status === 'read' && product.photo_read.asked ? (
              <Link
                to="/inbox"
                search={{ view: 'questions' }}
                className="font-semibold text-brand underline-offset-4 hover:underline"
                data-testid="photo-read-questions"
              >
                Open the questions in Inbox
              </Link>
            ) : null}
          </div>
        ) : null}
        <PhotoFactsGroup product={product} rows={photoRows} actions={actions} />
        {more.length ? (
          <div className="mt-4 border-t border-line pt-4">
            <p className="text-caption font-semibold text-ink-2">More details</p>
            <dl className={cn('mt-2 text-small', KV_GRID)}>
              {more.map(([k, v], i) => (
                <div key={k} className={!expanded && i >= MORE_VISIBLE ? 'hidden' : 'contents'} data-attr-key={k}>
                  <dt className="whitespace-nowrap text-ink-2">{ATTR_LABEL[k] ?? humanizeSlug(k)}</dt>
                  <dd className="min-w-0 break-words text-ink tabular-nums">{typeof v === 'string' ? v || '—' : formatAttributeValue(v, product.attribute_literals[k])}</dd>
                </div>
              ))}
            </dl>
            {more.length > MORE_VISIBLE ? (
              <Button variant="ghost" size="sm" className="mt-2 -ml-3" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
                {expanded ? 'Show fewer' : `Show all ${more.length}`}
                <Icon name="chev" size={14} className={cn('motion-safe:transition-transform motion-safe:duration-150', expanded && 'rotate-180')} />
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </LaCard>
  )
}

/* -------------------------------------------------------------------------------------- Edit */

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-line pt-5 first:border-t-0 first:pt-0">
      <h3 className="text-h3 text-ink">{title}</h3>
      {children}
    </section>
  )
}

/** Category: a select of the listable categories while the product has no listing, else fixed. */
const LOCK_HINT: Record<CategoryLock, string> = {
  open: 'Kurta sets and T-shirts can be listed for now.',
  locked: 'Fixed once the product has a listing.',
  pending: 'Checking for listings…',
  unknown: 'Couldn’t check for listings, so it stays as it is.',
}

function CategoryField({ session, lock, onRetry }: { session: ProductEditSession; lock: CategoryLock; onRetry?: () => void }) {
  const { d, patch, touch, errors, submitted } = session
  const open = lock === 'open'
  return (
    <LaField
      label="Category"
      htmlFor="e-category"
      error={errors.category}
      hint={LOCK_HINT[lock]}
      required={open}
      hintAction={
        lock === 'unknown' && onRetry ? (
          <Button type="button" variant="ghost" size="xs" onClick={onRetry}>
            Check again
          </Button>
        ) : undefined
      }
      submitCount={submitted}
      confirmFix
    >
      <Select
        value={d.category}
        disabled={!open}
        onValueChange={(category) => {
          patch({ category }, 'category')
          touch('category')
        }}
      >
        <SelectTrigger id="e-category" className="w-full" aria-invalid={errors.category ? true : undefined} aria-describedby={fieldHintId('e-category')} data-testid="e-category">
          <SelectValue placeholder="Choose" />
        </SelectTrigger>
        <SelectContent>
          {categoryChoices(session.base.category ?? '').map((c) => (
            <SelectItem key={c.value} value={c.value}>
              {c.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </LaField>
  )
}

export function ProductDetailsEditor({
  session,
  categoryLock = 'pending',
  onRetryCategoryLock,
  sellOn = [],
}: {
  session: ProductEditSession
  /** SI12: the marketplaces this product is sold on, for the "Needed" chips. */
  sellOn?: readonly Marketplace[]
  categoryLock?: CategoryLock
  /** Re-read the listings after a failed read (`categoryLock` 'unknown'). */
  onRetryCategoryLock?: () => void
}) {
  const { d, patch, setAttr, touch, errors, submitted, isVariant, base: product } = session
  const ref = useRef<HTMLFormElement>(null)
  const storeName = tenantName(useMe().data)
  const onSave = async () => {
    const out = await session.save()
    if (out === 'invalid') requestAnimationFrame(() => focusFirstInvalid(ref.current))
  }

  // SI12: the saved source while a value is unchanged, "You" once changed; "Needed" while empty.
  const b = session.baseDraft
  const saved = (k: string, unchanged: boolean, filled: boolean) => editingSource(fieldSource(product, k), unchanged, filled)
  const requirements = useRequirements(d.category)
  const filled: Filled = {
    brand_name: !d.hasAudience || !d.ownBrand || !!d.brandName.trim() || !!product.brand_name?.trim(),
    identifier: session.isStyle || d.barcode.exempt || normalizeBarcode(d.barcode.value) !== '',
    gender: isVariant || !d.hasAudience || !!d.gender,
    fabric_type: !!d.attrs.fabric_type.trim(),
    color: isVariant || !!d.attrs.color.trim(),
    mrp: !!d.mrp.trim(),
    selling_price: !!d.sellingPrice.trim(),
    hsn_code: !!d.hsn.trim(),
    package_size: packageHasSize(d.pkg),
    package_weight: packageHasWeight(d.pkg),
    country_of_origin: !!d.country.trim(),
    manufacturer: d.ownManufacturer || !!product.manufacturer?.legal_name,
  }
  const needs = missingNeeds(requirements.data, sellOn, filled)
  const need = (id: NeedFieldId) => needText(needs, id)

  const attrs = editableAttrs(isVariant)
  const field = (k: (typeof attrs)[number]) => {
    const f = ATTR_FIELDS.find((x) => x.key === k)!
    const chip = {
      source: saved(k, d.attrs[k].trim() === b.attrs[k].trim(), !!d.attrs[k].trim()),
      needed: k === 'fabric_type' || k === 'color' ? need(k) : undefined,
    }
    return f.pick ? (
      <PickOrOtherField
        key={k}
        id={`e-attr-${k}`}
        label={f.label}
        critical={f.critical}
        options={f.pick === 'fabric' ? FABRIC_TYPES : COLOURS}
        value={d.attrs[k]}
        onChange={(v) => setAttr(k, v)}
        onBlur={() => touch(`attr.${k}`)}
        error={errors[`attr.${k}`]}
        submitCount={submitted}
        hint={f.hint}
        {...chip}
      />
    ) : (
      <TextField
        key={k}
        id={`e-attr-${k}`}
        label={f.label}
        critical={f.critical}
        value={d.attrs[k]}
        onChange={(v) => setAttr(k, v)}
        onBlur={() => touch(`attr.${k}`)}
        error={errors[`attr.${k}`]}
        submitCount={submitted}
        hint={f.hint}
        maxLength={4000}
        {...chip}
      />
    )
  }
  const sub = (prefix: string) =>
    Object.fromEntries(Object.entries(errors).flatMap(([k, v]) => (k.startsWith(`${prefix}.`) ? [[k.slice(prefix.length + 1), v]] : [])))

  return (
    <LaCard data-testid="product-editor" className="flex flex-col gap-5">
      <CardHead title="Edit product details" sub={`SKU ${product.sku} stays the same.`} />
      {session.stale ? (
        <Banner tone="attention" role="status" title="Someone else saved changes">
          We kept yours on top of theirs. Check them and save again.
        </Banner>
      ) : null}
      <form
        ref={ref}
        className="flex flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault()
          void onSave()
        }}
        noValidate
      >
        <Group title="Basics">
          <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
            <TextField
              id="e-title"
              label="Product name"
              required
              value={d.title}
              onChange={(title) => patch({ title }, 'title')}
              onBlur={() => touch('title')}
              error={errors.title}
              submitCount={submitted}
              maxLength={1000}
            />
            {isVariant ? null : <CategoryField session={session} lock={categoryLock} onRetry={onRetryCategoryLock} />}
            {isVariant ? null : (
              <TextField
                id="e-style_number"
                label="Style number"
                value={d.styleNumber}
                onChange={(styleNumber) => patch({ styleNumber }, 'style_number')}
                onBlur={() => touch('style_number')}
                error={errors.style_number}
                hint="Optional."
                submitCount={submitted}
                maxLength={72}
                code
              />
            )}
            {isVariant || !d.hasAudience ? null : (
              <AudienceSelect id="e-gender" needed={need('gender')} value={d.gender} onChange={(gender) => patch({ gender }, 'gender')} error={errors.gender} submitCount={submitted} allowClear />
            )}
            {isVariant || !d.hasAudience ? null : (
              <BrandField
                id="e-brand_name"
                own={d.ownBrand}
                onOwnChange={(ownBrand) => patch({ ownBrand }, 'brand_name')}
                value={d.brandName}
                onChange={(brandName) => patch({ brandName }, 'brand_name')}
                onBlur={() => touch('brand_name')}
                defaultName={storeName}
                error={errors.brand_name}
                submitCount={submitted}
              />
            )}
          </div>
        </Group>
        <Group title="Barcode">
          <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
            <BarcodeField
              id="e-barcode"
              level={session.isStyle ? 'style' : 'item'}
              needed={need('identifier')}
              amazon={sellOn.includes('amazon')}
              value={d.barcode}
              onChange={(barcode) => patch({ barcode }, 'barcode')}
              onBlur={() => touch('barcode')}
              error={errors.barcode}
              submitCount={submitted}
            />
          </div>
        </Group>
        <Group title="Price">
          <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
            <MoneyField
              id="e-mrp"
              label="MRP"
              critical
              value={d.mrp}
              onChange={(mrp) => patch({ mrp }, 'mrp', 'selling_price')}
              onBlur={() => touch('mrp')}
              error={errors.mrp}
              hint={isVariant && !d.mrp ? 'Empty uses the style’s MRP. Needed to publish.' : 'Needed to publish.'}
              source={saved('mrp', d.mrp.trim() === b.mrp.trim(), !!d.mrp.trim())}
              needed={need('mrp')}
              submitCount={submitted}
            />
            <MoneyField
              id="e-selling_price"
              label="Selling price"
              value={d.sellingPrice}
              onChange={(sellingPrice) => patch({ sellingPrice }, 'selling_price')}
              onBlur={() => touch('selling_price')}
              error={errors.selling_price}
              hint="At or below the MRP."
              source={saved('selling_price', d.sellingPrice.trim() === b.sellingPrice.trim(), !!d.sellingPrice.trim())}
              needed={need('selling_price')}
              submitCount={submitted}
            />
          </div>
        </Group>
        <Group title="Fabric and colour">
          <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
            {field('fabric_type')}
            <div className="md:col-span-2">
              <CompositionEditor
                id="e-composition"
                rows={d.composition}
                onChange={(composition) => patch({ composition }, 'composition', 'attr.fiber_composition')}
                errors={sub('composition')}
                totalError={errors['attr.fiber_composition']}
                onBlur={(k) => {
                  touch(k)
                  touch('attr.fiber_composition')
                }}
                submitCount={submitted}
                source={saved('fiber_composition', JSON.stringify(d.composition) === JSON.stringify(b.composition), d.composition.some((r) => r.fibre.trim() || r.percent.trim()))}
              />
            </div>
            {attrs.filter((k) => !['fabric_type', 'wash_care', 'iron_care'].includes(k)).map(field)}
          </div>
        </Group>
        <Group title="Care">
          <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">{attrs.filter((k) => k === 'wash_care' || k === 'iron_care').map(field)}</div>
        </Group>
        <Group title="Tax and shipping">
          <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
            <HsnField
              id="e-hsn"
              value={d.hsn}
              suggested={d.hsnSuggested}
              onChange={(hsn) => patch({ hsn, hsnSuggested: false }, 'hsn_code')}
              onBlur={() => touch('hsn_code')}
              error={errors.hsn_code}
              source={saved('hsn_code', d.hsn.trim() === b.hsn.trim(), !!d.hsn.trim())}
              needed={need('hsn_code')}
              submitCount={submitted}
            />
            <CountryField
              id="e-country"
              value={d.country}
              onChange={(country) => {
                patch({ country }, 'country_of_origin')
                touch('country_of_origin')
              }}
              error={errors.country_of_origin}
              source={saved('country_of_origin', normalizeCountry(d.country) === normalizeCountry(b.country), !!d.country.trim())}
              needed={need('country_of_origin')}
              submitCount={submitted}
              allowClear
            />
          </div>
          <PackageFields
            id="e-package"
            value={d.pkg}
            onChange={(pkg) => patch({ pkg }, 'package')}
            onBlur={touch}
            errors={errors}
            source={samePackage(d.pkg, b.pkg) ? fieldSource(product, 'package') : undefined}
            neededSize={need('package_size')}
            neededWeight={need('package_weight')}
            category={d.category}
            submitCount={submitted}
          />
        </Group>
        {isVariant ? null : (
          <Group title="Size chart">
            <SizeChartReadButton product={product} onRead={session.loadSizeChart} loaded={!!d.sizeChartImageId} />
            <SizeChartEditor id="e-size" value={d.sizeChart} onChange={(sizeChart) => patch({ sizeChart }, 'size_chart')} errors={errors} onBlur={touch} />
          </Group>
        )}
        <Group title="Manufacturer">
          <ManufacturerEdit session={session} />
        </Group>
        {session.error ? (
          <Banner tone="danger" role="alert" title="Couldn’t save this product">
            {isApiError(session.error) && session.error.status === 0
              ? 'Can’t reach the server. Your changes are still here; try again.'
              : isApiError(session.error)
                ? session.error.message
                : 'Something went wrong. Try again.'}
            {isApiError(session.error) ? <ReferenceId id={session.error.correlationId} className="mt-1" /> : null}
          </Banner>
        ) : null}
        {session.confirmCancel ? (
          <Banner
            tone="attention"
            role="alert"
            title="Discard your changes?"
            action={
              <div className="flex gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={session.keepEditing}>
                  Keep editing
                </Button>
                <Button type="button" variant="danger" size="sm" onClick={session.discard} data-testid="product-discard">
                  Discard
                </Button>
              </div>
            }
          >
            The changes you made here are not saved yet.
          </Banner>
        ) : null}
        <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-wrap items-center justify-between gap-3 rounded-b-card border-t border-line bg-surface px-5 py-3">
          <p className="text-caption text-ink-3" aria-live="polite">
            {session.unitPending === 'choose'
              ? 'Choose the size chart unit to save'
              : session.unitPending === 'confirm'
                ? 'Confirm the size chart unit to save'
                : session.onlySuggestion
                  ? 'Saving confirms the suggested HSN code'
                  : session.dirty
                    ? 'Unsaved changes'
                    : 'No changes yet'}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={session.cancel} disabled={session.saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={session.saving || !session.dirty || session.unitPending !== null} data-testid="product-save">
              {session.saving ? <Spinner data-icon="inline-start" aria-hidden /> : null}
              {session.saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </div>
      </form>
    </LaCard>
  )
}

const FROM: Record<ManufacturerSource, string> = {
  brand: 'from your brand profile',
  style: 'from its style',
  own: '',
  unknown: '',
  none: '',
}

/** Manufacturer in the editor: inherited (brand or style) with a "Different" switch, or this product's own. */
function ManufacturerEdit({ session }: { session: ProductEditSession }) {
  const { d, patch, touch, errors, submitted, baseDraft, base, source, isVariant } = session
  const loaded = base.manufacturer
  const ownAtStart = baseDraft.ownManufacturer
  const sub = Object.fromEntries(
    Object.entries(errors).flatMap(([k, v]) => (k.startsWith('manufacturer.') ? [[k.slice('manufacturer.'.length), v]] : [])),
  ) as Partial<Record<PartyField, string>>
  return (
    <>
      {!ownAtStart ? (
        <label className="flex items-center gap-2 text-small text-ink-2">
          <Switch checked={d.ownManufacturer} onCheckedChange={(ownManufacturer) => patch({ ownManufacturer }, 'manufacturer')} aria-label="Different manufacturer for this product" />
          Different for this product
        </label>
      ) : null}
      {d.ownManufacturer ? (
        <>
          <PartyFields id="e-mfr" value={d.manufacturer} onChange={(manufacturer) => patch({ manufacturer }, 'manufacturer')} errors={sub} onBlur={(k) => touch(`manufacturer.${k}`)} submitCount={submitted} />
          {ownAtStart ? (
            <div>
              <Button type="button" variant="ghost" size="sm" className="-ml-3" onClick={() => patch({ ownManufacturer: false }, 'manufacturer')}>
                {isVariant ? 'Use the style’s manufacturer instead' : 'Use the brand manufacturer instead'}
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <p className="text-small text-ink-2">
          {ownAtStart ? (
            isVariant ? 'Will use its style’s manufacturer.' : 'Will use your brand manufacturer.'
          ) : loaded?.legal_name ? (
            <>
              Uses <b className="text-ink">{loaded.legal_name}</b> {FROM[source]}
              {FROM[source] ? '.' : ''}
            </>
          ) : (
            'No manufacturer yet. Set it once in Brand profile, or enter it here.'
          )}
        </p>
      )}
    </>
  )
}
