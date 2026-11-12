/**
 * How a seller gets an Amazon GTIN exemption: one link to Amazon India's own Seller Central help
 * page and one line on what Amazon asks for. Shown next to the "No barcode: my brand has an Amazon
 * GTIN exemption" choice and on the review screen's missing-barcode fix.
 *
 * The link must pass the Seller Central rule in ./seller-central.ts (ADR-0028 CP-D13).
 */
import { Icon } from '@/components/la'
import { cn } from '@/lib/utils'
import { isSellerCentralLink } from './seller-central'

/** Amazon India's help page "List products that do not have a Global Trade Item Number". */
export const GTIN_EXEMPTION_URL = 'https://sellercentral.amazon.in/help/hub/reference/G200426310'
export const GTIN_EXEMPTION_LINK_TEXT = 'How to get a GTIN exemption'
/** What Amazon's exemption form asks for, in seller words. */
export const GTIN_EXEMPTION_NEEDS = 'Amazon asks for the brand name, the category and photos of the product and its pack.'

/**
 * The link and the one line. Spans only, so it can sit inside a gate row's text as well as under a
 * field.
 */
export function GtinExemptionHelp({ className, testId = 'gtin-exemption-help' }: { className?: string; testId?: string }) {
  if (!isSellerCentralLink(GTIN_EXEMPTION_URL)) return null
  return (
    <span className={cn('block text-caption text-ink-3', className)} data-testid={testId}>
      <a
        href={GTIN_EXEMPTION_URL}
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex items-center gap-1 font-semibold text-brand underline-offset-4 hover:underline"
        data-testid={`${testId}-link`}
      >
        {GTIN_EXEMPTION_LINK_TEXT}
        <span className="sr-only"> (opens Amazon Seller Central in a new tab)</span>
        <Icon name="external" size={12} />
      </a>{' '}
      {GTIN_EXEMPTION_NEEDS}
    </span>
  )
}
