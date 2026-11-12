import { useNavigate } from '@tanstack/react-router'
import { Archive, ArchiveRestore, MoreHorizontal, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import type { Schema } from '@/api/types'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useCan } from '@/lib/permissions'
import { archiveBlock, useArchiveProduct } from './archive'
import { deleteBlock } from './delete'
import { DeleteProductsDialog } from './delete-dialog'

type Listing = Schema<'ListingOut'>

/**
 * The product page header's "More" menu: "Archive product" (or "Unarchive product") and "Delete
 * product" (owners and admins, not on a size: a size goes with its style). Archive keeps the
 * product and can be undone; delete removes it. While a listing is with a marketplace both items
 * are disabled and say why. Hidden when the caller has nothing in it.
 */
export function ProductMoreMenu({
  product,
  listings,
  listingsReady,
  variants,
}: {
  product: { id: string; sku: string; title: string; parent_product_id?: string | null; archived_at?: string | null }
  listings: readonly (Listing | undefined)[]
  /** False while the listings are loading or failed: the item waits, never guesses. */
  listingsReady: boolean
  variants: number
}) {
  const can = useCan()
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const archive = useArchiveProduct(product.id, product.sku)
  if (!can('settings:manage') || product.parent_product_id) return null
  const block = listingsReady ? deleteBlock(listings) : 'Checking this product’s listings…'
  const archived = !!product.archived_at
  // Unarchive is always allowed; archive waits like delete does.
  const archiveOff = archived ? null : listingsReady ? archiveBlock(listings) : 'Checking this product’s listings…'

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button ref={trigger} variant="ghost" size="icon-sm" aria-label="More actions" data-testid="header-more">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuItem
            disabled={!!archiveOff || archive.isPending}
            onSelect={() => archive.mutate(!archived)}
            data-testid={archived ? 'unarchive-product' : 'archive-product'}
            className="items-start"
          >
            {archived ? <ArchiveRestore className="mt-0.5" /> : <Archive className="mt-0.5" />}
            <span className="flex flex-col">
              <span>{archived ? 'Unarchive product' : 'Archive product'}</span>
              <span className="text-caption text-ink-3" data-testid="archive-product-reason">
                {archiveOff ?? (archived ? 'Back in your product list.' : 'Keeps it, out of your list. You can undo it.')}
              </span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={!!block}
            onSelect={() => setConfirming(true)}
            data-testid="delete-product"
            className="items-start"
          >
            <Trash2 className="mt-0.5" />
            <span className="flex flex-col">
              <span>Delete product</span>
              {block ? (
                <span className="text-caption text-ink-3" data-testid="delete-product-reason">
                  {block}
                </span>
              ) : null}
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {confirming ? (
        <DeleteProductsDialog
          open
          onOpenChange={setConfirming}
          returnFocus={trigger}
          products={[{ id: product.id, sku: product.sku, title: product.title, variants }]}
          onDeleted={(out) => {
            if (out.deleted.includes(product.id)) void navigate({ to: '/products' })
          }}
        />
      ) : null}
    </>
  )
}
