/**
 * The "needs photos" list on the bulk check step (./needs-photos.ts): every imported style or
 * standalone product with no main photo, each linking to its Media tab.
 */
import { useQueries } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { Schema } from '@/api/types'
import { CardHead, Icon, LaCard } from '@/components/la'
import { productQuery } from '@/features/products/api'
import { useKeys } from '@/lib/query-keys'
import { detailIdsToRead, needsPhotos } from './needs-photos'

/** Imported styles and standalone products with no main photo, each linking to its Media tab. */
export function NeedsPhotosCard({ products }: { products: readonly Schema<'ProductOut'>[] }) {
  const keys = useKeys()
  const ids = detailIdsToRead(products)
  const details = useQueries({ queries: ids.map((id) => ({ ...productQuery(keys, id), staleTime: 30_000 })) })
  const byId = new Map(ids.map((id, i) => [id, details[i]?.data]))
  const { missing, unknown } = needsPhotos(products, byId)
  const loading = details.some((d) => d.isPending)
  // Nothing until every read has answered: a placeholder that may then vanish (every product
  // has a main) would move the page below it.
  if (loading) return null
  if (!missing.length && !unknown) return null
  const shown = missing.slice(0, 20)
  return (
    <LaCard pad="none" className="mt-4 overflow-hidden" data-testid="needs-photos">
      <div className="p-4">
        <CardHead
          title={missing.length ? `${missing.length} ${missing.length === 1 ? 'product needs' : 'products need'} photos` : 'Photos'}
          sub="A product needs a main photo before its listing can pass the checks. Open each one to add photos."
          icon="image"
          iconTone="warn"
        />
      </div>
      {shown.length ? (
        <ul className="divide-y divide-line border-t border-line" aria-label="Products that need photos">
          {shown.map((p) => (
            <li key={p.id}>
              <Link
                to="/products/$productId"
                params={{ productId: p.id }}
                search={{ tab: 'media' }}
                className="focus-ring tactile flex min-h-[46px] items-center justify-between gap-3 px-4 py-2 hover:bg-sunken"
                data-testid="needs-photos-row"
              >
                <span className="min-w-0">
                  <span className="block truncate text-small font-semibold text-ink">{p.title}</span>
                  <span className="block truncate text-caption text-ink-3">{p.sku}</span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1.5 text-small font-semibold text-brand">
                  Add photos
                  <Icon name="arrow" size={14} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {missing.length > shown.length || unknown ? (
        <p className="border-t border-line px-4 py-3 text-small text-ink-2">
          {[
            missing.length > shown.length ? `${missing.length - shown.length} more on the Products page.` : null,
            unknown ? `${unknown} ${unknown === 1 ? 'product' : 'products'} not checked here: open ${unknown === 1 ? 'it' : 'them'} to see ${unknown === 1 ? 'its' : 'their'} photos.` : null,
          ]
            .filter(Boolean)
            .join(' ')}
        </p>
      ) : null}
    </LaCard>
  )
}
