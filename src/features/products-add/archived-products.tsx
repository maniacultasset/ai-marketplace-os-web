/**
 * The Products "Archived" view (`/products?status=archived`): the archived styles and standalone
 * products from `GET /products?archived=true`, each linking to its page, where the More menu
 * unarchives it. Their sizes are archived with them and counted on their style's row.
 */
import { Link } from '@tanstack/react-router'
import { LaCard } from '@/components/la'
import { EmptyState } from '@/components/states/empty-state'
import { ErrorState } from '@/components/states/error-state'
import { Skeleton } from '@/components/ui/skeleton'
import { RelativeTime } from '@/features/products/format'
import type { ArchivedRow } from './archived-model'
import { productCategoryLabel } from './catalog-model'

export function ArchivedProducts({
  rows,
  isPending,
  error,
  onRetry,
  filtered,
}: {
  rows: readonly ArchivedRow[]
  isPending: boolean
  error: unknown
  onRetry: () => void
  /** A search is on: an empty list says "no match", not "nothing archived". */
  filtered: boolean
}) {
  if (isPending)
    return (
      <LaCard pad="none" aria-busy="true" aria-label="Loading archived products">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex h-16 items-center gap-3 border-t border-line px-5 first:border-t-0">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </LaCard>
    )
  if (error)
    return (
      <LaCard pad="none">
        <ErrorState error={error} title="Couldn’t load archived products" onRetry={onRetry} compact />
      </LaCard>
    )
  if (!rows.length)
    return (
      <LaCard pad="none">
        <EmptyState
          icon={filtered ? 'search' : 'box'}
          title={filtered ? 'No archived products match' : 'Nothing archived'}
          description={filtered ? 'Try another name or SKU.' : 'Products you archive from their More menu wait here. Open one to unarchive it.'}
          compact
        />
      </LaCard>
    )
  return (
    <LaCard pad="none" className="overflow-hidden">
      <p className="px-5 pt-4 pb-3 text-small text-ink-2">Archived products are out of your list and nothing is drafted or sent for them. Open one to unarchive it.</p>
      <ul aria-label="Archived products" data-testid="archived-products">
        {rows.map(({ product: p, variants }) => (
          <li key={p.id} className="relative flex min-h-16 items-center justify-between gap-3 border-t border-line px-5 py-3 hover:bg-subtle">
            <span className="min-w-0">
              <Link
                to="/products/$productId"
                params={{ productId: p.id }}
                className="block truncate font-semibold text-ink after:absolute after:inset-0 after:content-[''] hover:underline"
                title={p.title}
                data-testid="archived-product-link"
              >
                {p.title}
              </Link>
              <small className="block truncate text-caption text-ink-2">
                {p.sku} · {productCategoryLabel(p.category)}
                {variants ? ` · ${variants} ${variants === 1 ? 'variant' : 'variants'}` : ''}
              </small>
            </span>
            {p.archived_at ? (
              <span className="shrink-0 text-caption text-ink-2">
                Archived <RelativeTime iso={p.archived_at} />
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </LaCard>
  )
}
