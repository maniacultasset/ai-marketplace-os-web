import { useNavigate } from '@tanstack/react-router'
import { MoreHorizontal, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { Schema } from '@/api/types'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useCan } from '@/lib/permissions'
import { deleteBlock } from './delete'
import { DeleteProductsDialog } from './delete-dialog'

type Listing = Schema<'ListingOut'>

/**
 * The product page header's "More" menu. Today it holds "Delete product" (owners and admins, not
 * on a size: a size goes with its style). While a listing is with a marketplace the item is
 * disabled and says why. Hidden when the caller has nothing in it.
 */
export function ProductMoreMenu({
  product,
  listings,
  listingsReady,
  variants,
}: {
  product: { id: string; sku: string; title: string; parent_product_id?: string | null }
  listings: readonly (Listing | undefined)[]
  /** False while the listings are loading or failed: the item waits, never guesses. */
  listingsReady: boolean
  variants: number
}) {
  const can = useCan()
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)
  if (!can('settings:manage') || product.parent_product_id) return null
  const block = listingsReady ? deleteBlock(listings) : 'Checking this product’s listings…'

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="More actions" data-testid="header-more">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
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
          products={[{ id: product.id, sku: product.sku, title: product.title, variants }]}
          onDeleted={(out) => {
            if (out.deleted.includes(product.id)) void navigate({ to: '/products' })
          }}
        />
      ) : null}
    </>
  )
}
