/**
 * Product detail > Overview: the seller's inputs as saved (read view) and their editor.
 *
 * Read: GET /products/{id} (style number, MRP and selling price, fabric, composition, colour,
 * care, size chart, the effective manufacturer with "Brand profile" when inherited).
 * Edit: PATCH /products/{id} with If-Match = the ETag the edit started from. 409 STALE_VERSION
 * loads the latest and keeps the person's changes for a second save; 422s land on the fields.
 */
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { isApiError } from '@/api/errors'
import { Banner, CardHead, CONCEPT_ICON, Icon, IconGlyph, LaCard, SourceBadge, TagChip } from '@/components/la'
import { ReferenceId } from '@/components/states/reference-id'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { type ProductDetail } from '@/features/products/api'
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
import { humanizeSlug } from './catalog-model'
import type { ProductEditSession } from './product-edit-session'
import { ATTR_FIELDS, ATTR_LABEL } from './guided-model'
import { focusFirstInvalid } from '@/lib/validation'
import { cn } from '@/lib/utils'

/** One key column for every key-value list, so values line up. */
const KV_GRID = 'grid grid-cols-[minmax(96px,max-content)_minmax(0,1fr)] items-baseline gap-x-3 gap-y-2'

/** Keys the card shows in their own rows (the rest are listed under "More details"). */
const SHOWN = new Set<string>(['fabric_type', 'fiber_composition', 'color', 'wash_care', 'iron_care', 'size_measurements', 'size_chart_url'])
const MORE_VISIBLE = 6

function Missing({ critical, children = 'Not set' }: { critical?: boolean; children?: ReactNode }) {
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

/** The saved values. `onEdit` is absent when the person may not edit (no product:import). */
export function ProductDetailsCard({
  product,
  isVariant,
  source,
  onEdit,
}: {
  product: ProductDetail
  isVariant: boolean
  source: ManufacturerSource
  onEdit?: () => void
}) {
  const a = product.attributes ?? {}
  const text = (k: string) => {
    const v = a[k]
    return typeof v === 'string' ? v.trim() : v == null ? '' : formatAttributeValue(v, product.attribute_literals[k])
  }
  const comp = product.fiber_composition?.length
    ? product.fiber_composition.map((f) => `${f.percent}% ${f.fibre.charAt(0).toLocaleUpperCase('en')}${f.fibre.slice(1)}`).join(' · ')
    : text('fiber_composition')
  const more = useMemo(
    () => Object.entries(product.attributes ?? {}).filter(([k]) => !SHOWN.has(k)).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)),
    [product.attributes],
  )
  const [expanded, setExpanded] = useState(false)
  const mrp = formatMoney(product.mrp)
  const price = formatMoney(product.selling_price)
  const off = product.mrp && product.selling_price ? discountPercent(product.selling_price, product.mrp) : null
  const m = product.manufacturer
  const chart = product.size_chart
  const cols = chart ? MEASURES.filter((x) => chart.rows.some((r) => r[x] != null)) : []

  return (
    <LaCard data-testid="product-details">
      <CardHead
        title="Product details"
        sub="What you told us. The agent uses these and never guesses the critical ones."
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
            {humanizeSlug(product.category)} <SourceBadge source={{ kind: 'you' }} />
          </Row>
          {isVariant ? null : <Row k="Style number">{product.style_number ? <span className="font-mono">{product.style_number}</span> : <Missing />}</Row>}
          <Row k="MRP">{mrp ? <span className="tabular-nums">{mrp}</span> : <Missing critical>Needed to publish</Missing>}</Row>
          <Row k="Selling price">
            {price ? (
              <>
                <span className="tabular-nums">{price}</span>
                {off ? <span className="text-caption text-success-ink">{off}% off</span> : null}
              </>
            ) : (
              <Missing />
            )}
          </Row>
          <Row k="Fabric type" attr="fabric_type">{text('fabric_type') || <Missing critical />}</Row>
          <Row k="Composition" attr="fiber_composition">{comp || <Missing critical />}</Row>
          {isVariant ? null : <Row k="Colour" attr="color">{text('color') || <Missing />}</Row>}
          <Row k="Wash care" attr="wash_care">{text('wash_care') || <Missing critical />}</Row>
          <Row k="Iron care" attr="iron_care">{text('iron_care') || <Missing critical />}</Row>
          <Row k="Manufacturer">
            {m?.legal_name ? (
              <span className="flex min-w-0 flex-col">
                <span className="flex flex-wrap items-center gap-2">
                  {m.legal_name}
                  {source === 'brand' ? <SourceBadge source={{ kind: 'brand-profile' }} /> : null}
                  {source === 'style' ? <TagChip tone="plain">From the style</TagChip> : null}
                </span>
                <span className="text-caption text-ink-2">{partyPlace(m)}</span>
              </span>
            ) : (
              <Missing critical />
            )}
          </Row>
          {isVariant ? null : (
            <Row k="Size chart">
              {chart ? (
                <span className="text-ink-2">
                  {chart.rows.length} {chart.rows.length === 1 ? 'size' : 'sizes'}, {chart.unit === 'in' ? 'inches' : 'cm'}, {chart.basis === 'garment' ? 'garment' : 'body'} measurements
                </span>
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

export function ProductDetailsEditor({ session }: { session: ProductEditSession }) {
  const { d, patch, setAttr, touch, errors, submitted, isVariant, base: product } = session
  const ref = useRef<HTMLFormElement>(null)
  const onSave = async () => {
    const out = await session.save()
    if (out === 'invalid') requestAnimationFrame(() => focusFirstInvalid(ref.current))
  }

  const attrs = editableAttrs(isVariant)
  const field = (k: (typeof attrs)[number]) => {
    const f = ATTR_FIELDS.find((x) => x.key === k)!
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
              value={d.title}
              onChange={(title) => patch({ title }, 'title')}
              onBlur={() => touch('title')}
              error={errors.title}
              submitCount={submitted}
              maxLength={1000}
            />
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
              />
            </div>
            {attrs.filter((k) => !['fabric_type', 'wash_care', 'iron_care'].includes(k)).map(field)}
          </div>
        </Group>
        <Group title="Care">
          <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">{attrs.filter((k) => k === 'wash_care' || k === 'iron_care').map(field)}</div>
        </Group>
        {isVariant ? null : (
          <Group title="Size chart">
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
            {session.dirty ? 'Unsaved changes' : 'No changes yet'}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={session.cancel} disabled={session.saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={session.saving} data-testid="product-save">
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
