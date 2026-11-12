/**
 * The Identity gate's fix for a missing barcode: the plain reason and one action. For the product
 * itself it opens the product's editor at the barcode choice (`/products/$productId?edit=barcode`).
 * When the gate names variants, it opens the variants step for the style (`/add/variants`), where
 * each variant's barcode cell and the style's exemption choice both are: the style editor has
 * only the exemption choice. Amazon's rule stays: a create needs a barcode or a GTIN exemption
 * the brand was approved for.
 */
import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { GtinExemptionHelp } from '@/features/products/gtin-exemption'
import { mpName } from './format'
import { identifierMissing, type GateResult } from './gates'

const SKUS_SHOWN = 3

export function IdentifierFix({
  gate,
  productId,
  marketplace,
  canEdit,
  canEditVariants,
}: {
  gate: Pick<GateResult, 'state' | 'findings'> | undefined
  productId: string
  marketplace: string
  /** The person may edit products: the action shows only then (the reason always shows). */
  canEdit: boolean
  /** The person may change variants (the variants step): the variant action shows only then. */
  canEditVariants: boolean
}) {
  const missing = identifierMissing(gate)
  if (!missing) return null
  const mp = mpName(marketplace)
  const { skus } = missing
  const named = skus.slice(0, SKUS_SHOWN).join(', ')
  const more = skus.length - SKUS_SHOWN
  return (
    // Spans: it sits inside the gate row's text.
    <span className="mt-1 flex flex-col items-start gap-2" data-testid="identity-fix">
      <span className="block text-small text-ink-2">
        {mp} needs a barcode (EAN, UPC or GTIN) to create this listing, or a GTIN exemption if {mp} approved one for your brand.
        {skus.length ? (
          <>
            {' '}
            Missing on <span className="font-mono tabular-nums">{named}</span>
            {more > 0 ? ` and ${more} more` : ''}.
          </>
        ) : null}
      </span>
      {/* Amazon's own page on applying, for a seller with no barcode and no exemption yet. */}
      {marketplace === 'amazon' ? <GtinExemptionHelp testId="identity-fix-exemption-help" /> : null}
      {skus.length ? (
        canEditVariants ? (
          <Button size="sm" variant="secondary" asChild>
            <Link to="/add/variants" search={{ product: productId, on: marketplace }} data-testid="identity-fix-action">
              Add barcodes or exemption
            </Link>
          </Button>
        ) : null
      ) : canEdit ? (
        <Button size="sm" variant="secondary" asChild>
          <Link to="/products/$productId" params={{ productId }} search={{ edit: 'barcode' }} data-testid="identity-fix-action">
            Add barcode or exemption
          </Link>
        </Button>
      ) : null}
    </span>
  )
}
