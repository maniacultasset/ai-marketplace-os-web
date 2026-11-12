/**
 * "Preview on Amazon / Flipkart" (client feedback item 16, bullet 5; model in
 * marketplace-preview-model.ts): the complete listing laid out like the marketplace's product
 * page: the photo gallery, title, price and MRP, size and colour pickers, the key features, the
 * product details table and the description. It says plainly that it is an approximation, and
 * what shoppers never see (search terms and backend keywords).
 */
import { useState } from 'react'
import { Icon } from '@/components/la'
import { SavedPhoto } from '@/components/la/saved-photo'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { ListingDetail } from '@/features/listings/model'
import type { Product } from '@/features/products/api'
import { useRefreshProductViews } from '@/features/products/image-views'
import { cn } from '@/lib/utils'
import { mpName } from './format'
import { previewModel, type PreviewModel } from './marketplace-preview-model'

export function MarketplacePreviewDialog({
  open,
  onOpenChange,
  listing,
  product,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  listing: ListingDetail
  product: Product | null | undefined
}) {
  const mp = mpName(listing.marketplace)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl" data-testid="mp-preview">
        <DialogHeader>
          <DialogTitle className="text-h3 font-semibold text-ink">Preview on {mp}</DialogTitle>
          <DialogDescription className="text-small text-ink-2">
            An approximation of how {mp} may show this listing. The live page can differ in layout, and {mp} adds its own parts.
          </DialogDescription>
        </DialogHeader>
        {open && listing.content ? <PreviewPage listing={listing} product={product} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function PreviewPage({ listing, product }: { listing: ListingDetail; product: Product | null | undefined }) {
  const m = previewModel(listing, product)
  const flipkart = listing.marketplace === 'flipkart'
  const refresh = useRefreshProductViews(listing.product_id)
  return (
    <div className="flex min-w-0 flex-col gap-6 rounded-xl border border-line bg-surface p-4 sm:p-5" data-testid={`mp-preview-${listing.marketplace}`}>
      <div className="grid min-w-0 gap-6 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <Gallery model={m} onError={refresh} />
        <div className="flex min-w-0 flex-col gap-4">
          <div>
            {m.brand && !flipkart ? <p className="text-small text-brand">Visit the {m.brand} store</p> : null}
            <h2 className="mt-0.5 text-[1.375rem] leading-snug font-normal break-words text-ink" data-testid="mp-preview-title">
              {flipkart && m.brand ? <span className="text-ink-3">{m.brand} </span> : null}
              {m.title}
            </h2>
          </div>
          <Price model={m} flipkart={flipkart} />
          <Pickers model={m} />
          {flipkart ? null : <Bullets title="About this item" items={m.bullets} />}
          {flipkart ? <Bullets title="Highlights" items={m.bullets} /> : null}
        </div>
      </div>
      {flipkart ? (
        <>
          <Description text={m.description} />
          <Details title="Specifications" rows={m.details} />
        </>
      ) : (
        <>
          <Details title="Product details" rows={m.details} />
          <Description title="Product description" text={m.description} />
        </>
      )}
      <p className="border-t border-line pt-3 text-caption text-ink-3" data-testid="mp-preview-hidden">
        {m.searchTerms
          ? `Shoppers never see the search terms and backend keywords: ${m.searchTerms} ${m.searchTerms === 1 ? 'term is' : 'terms are'} sent for search only.`
          : 'No search terms yet. Shoppers never see them; they help the listing show up in search.'}
      </p>
    </div>
  )
}

function Gallery({ model, onError }: { model: PreviewModel; onError: () => void }) {
  const [at, setAt] = useState(0)
  const photos = model.photos
  const current = photos[Math.min(at, photos.length - 1)]
  if (!photos.length)
    return (
      <div className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-xl border border-line bg-field text-ink-3" data-testid="mp-preview-no-photos">
        <Icon name="image" size={32} aria-hidden />
        <span className="text-small">{model.photosMissing ? 'The photos are still being checked.' : 'No photos on this listing yet.'}</span>
      </div>
    )
  return (
    <div className="flex min-w-0 flex-col-reverse gap-3 sm:flex-row" data-testid="mp-preview-gallery">
      {photos.length > 1 ? (
        <div role="group" aria-label="Photos" className="flex gap-2 overflow-x-auto sm:max-h-[440px] sm:flex-col sm:overflow-y-auto">
          {photos.map((p, i) => (
            <button
              key={p.id}
              type="button"
              aria-label={`Photo ${i + 1} of ${photos.length}`}
              aria-pressed={i === at}
              onClick={() => setAt(i)}
              onMouseEnter={() => setAt(i)}
              className={cn(
                'focus-ring size-14 shrink-0 overflow-hidden rounded-md border bg-field transition-colors duration-150',
                i === at ? 'border-brand ring-1 ring-brand' : 'border-line hover:border-ink-3',
              )}
            >
              <SavedPhoto src={p.src} alt="" fit="contain" className="size-full" onError={onError} />
            </button>
          ))}
        </div>
      ) : null}
      <figure className="m-0 aspect-square w-full min-w-0 overflow-hidden rounded-xl border border-line bg-field">
        <SavedPhoto src={current?.src} alt={`Photo ${at + 1} of ${photos.length}`} fit="contain" className="size-full" onError={onError} testId="mp-preview-photo" />
      </figure>
    </div>
  )
}

function Price({ model, flipkart }: { model: PreviewModel; flipkart: boolean }) {
  if (!model.price) return <p className="text-small text-ink-3">No selling price on the product yet.</p>
  if (flipkart)
    return (
      <p className="flex flex-wrap items-baseline gap-x-3 tabular-nums" data-testid="mp-preview-price">
        <span className="text-[1.75rem] font-semibold text-ink">{model.price}</span>
        {model.mrp ? <s className="text-body text-ink-3">{model.mrp}</s> : null}
        {model.discount ? <span className="text-body font-semibold text-success">{model.discount}% off</span> : null}
      </p>
    )
  return (
    <div className="border-y border-line py-3 tabular-nums" data-testid="mp-preview-price">
      <p className="flex flex-wrap items-baseline gap-x-2">
        {model.discount ? <span className="text-[1.5rem] font-light text-danger">-{model.discount}%</span> : null}
        <span className="text-[1.75rem] font-medium text-ink">{model.price}</span>
      </p>
      {model.mrp ? (
        <p className="text-small text-ink-3">
          M.R.P.: <s>{model.mrp}</s>
        </p>
      ) : null}
      <p className="text-small text-ink-2">Inclusive of all taxes</p>
    </div>
  )
}

function Pickers({ model }: { model: PreviewModel }) {
  const [size, setSize] = useState<string | null>(model.picked.size ?? null)
  const [colour, setColour] = useState<string | null>(model.picked.color ?? model.colours[0] ?? null)
  const sizes = model.sizes.length ? model.sizes : model.picked.size ? [model.picked.size] : []
  const colours = model.colours.length ? model.colours : model.picked.color ? [model.picked.color] : []
  if (!sizes.length && !colours.length) return null
  return (
    <div className="flex flex-col gap-3" data-testid="mp-preview-pickers">
      {colours.length ? <Chips label="Colour" value={colour} options={colours} onPick={setColour} /> : null}
      {sizes.length ? <Chips label="Size" value={size} options={sizes} onPick={setSize} /> : null}
    </div>
  )
}

function Chips({ label, value, options, onPick }: { label: string; value: string | null; options: readonly string[]; onPick: (v: string) => void }) {
  return (
    <div role="group" aria-label={label}>
      <p className="text-small text-ink-2">
        {label}: <b className="text-ink">{value ?? 'Select'}</b>
      </p>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            aria-pressed={o === value}
            onClick={() => onPick(o)}
            className={cn(
              'focus-ring min-w-10 rounded-md border px-3 py-1.5 text-small transition-colors duration-150',
              o === value ? 'border-brand bg-brand-bg font-semibold text-brand' : 'border-line bg-surface text-ink hover:border-ink-3',
            )}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  )
}

function Bullets({ title, items }: { title: string; items: readonly string[] }) {
  return (
    <section aria-label={title}>
      <h3 className="text-body font-bold text-ink">{title}</h3>
      <ul className="m-0 mt-1.5 list-disc pl-5 text-small leading-6 text-ink" data-testid="mp-preview-bullets">
        {items.map((b, i) => (
          <li key={i} className="break-words">
            {b}
          </li>
        ))}
      </ul>
    </section>
  )
}

function Details({ title, rows }: { title: string; rows: readonly [string, string][] }) {
  if (!rows.length) return null
  return (
    <section aria-label={title}>
      <h3 className="text-body font-bold text-ink">{title}</h3>
      <table className="mt-2 w-full max-w-2xl border-collapse text-small" data-testid="mp-preview-details">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} className="border-b border-line last:border-b-0">
              <th scope="row" className="w-2/5 py-1.5 pr-4 text-left align-top font-semibold text-ink-2">
                {k}
              </th>
              <td className="py-1.5 align-top break-words text-ink">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function Description({ title = 'Description', text }: { title?: string; text: string }) {
  return (
    <section aria-label={title}>
      <h3 className="text-body font-bold text-ink">{title}</h3>
      <p className="mt-1.5 text-small leading-6 whitespace-pre-line break-words text-ink" data-testid="mp-preview-description">
        {text}
      </p>
    </section>
  )
}
