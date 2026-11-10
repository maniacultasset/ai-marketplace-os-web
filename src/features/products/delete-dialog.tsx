import type { MouseEvent, RefObject } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Spinner } from '@/components/ui/spinner'
import { toastError } from '@/lib/toast'
import { announce, plural, useDeleteProducts, type DeleteOutcome, type DeleteTarget } from './delete'

/** How many names the dialog lists before "and N more". */
const SHOWN = 5

/** Confirm, then delete one or more products. Closes itself once the call is sent (the rows leave at once). */
export function DeleteProductsDialog({
  products,
  open,
  onOpenChange,
  onDeleted,
  returnFocus,
}: {
  products: readonly DeleteTarget[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted?: (out: DeleteOutcome) => void
  /** Where focus goes when the dialog closes, when the element that opened it is gone (a menu item). */
  returnFocus?: RefObject<HTMLElement | null>
}) {
  const del = useDeleteProducts()
  const one = products.length === 1 ? products[0] : null
  const sizes = products.reduce((n, p) => n + (p.variants ?? 0), 0)

  const onConfirm = (e: MouseEvent) => {
    e.preventDefault()
    del.mutate(
      products.map((p) => p.id),
      {
        onSuccess: (out) => {
          announce(products, out)
          onDeleted?.(out)
          onOpenChange(false)
        },
        onError: (err) => {
          toastError(err, one ? `${one.sku} wasn’t deleted` : 'The products weren’t deleted')
          onOpenChange(false)
        },
      },
    )
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => !del.isPending && onOpenChange(o)}>
      <AlertDialogContent
        data-testid="delete-products-dialog"
        onCloseAutoFocus={(e) => {
          const to = returnFocus?.current
          if (!to?.isConnected) return
          e.preventDefault()
          to.focus()
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{one ? `Delete ${one.sku}?` : `Delete ${plural(products.length, 'product', 'products')}?`}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="flex flex-col gap-2">
              {one ? (
                <p className="break-words">
                  <span className="font-semibold text-ink">{one.title}</span>
                  {sizes ? ` and its ${plural(sizes, 'size', 'sizes')}` : ''} will leave Products, Review and the Inbox.
                </p>
              ) : (
                <>
                  <ul className="flex flex-col gap-0.5" data-testid="delete-products-names">
                    {products.slice(0, SHOWN).map((p) => (
                      <li key={p.id} className="truncate">
                        <span className="font-semibold text-ink">{p.sku}</span> · {p.title}
                      </li>
                    ))}
                    {products.length > SHOWN ? <li>and {products.length - SHOWN} more</li> : null}
                  </ul>
                  <p>These products{sizes ? ` and their ${plural(sizes, 'size', 'sizes')}` : ''} will leave Products, Review and the Inbox.</p>
                </>
              )}
              <p>{one ? 'Its' : 'Their'} open questions close and any drafting that hasn’t started is stopped. Photos are removed later.</p>
              <p className="font-semibold text-ink">This can’t be undone from the app.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={del.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm} disabled={del.isPending} data-testid="delete-products-confirm">
            {del.isPending ? <Spinner data-icon="inline-start" /> : null}
            {del.isPending ? 'Deleting…' : one ? 'Delete product' : `Delete ${plural(products.length, 'product', 'products')}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
