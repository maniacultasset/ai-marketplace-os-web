import { useState } from 'react'
import { api, unwrap } from '@/api/client'
import { describeError, isApiError } from '@/api/errors'
import { Icon } from '@/components/la/icons'
import { ReferenceId } from '@/components/states/reference-id'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { PAGE_SIZE, useCursorList } from '@/hooks/use-cursor-list'
import { useCan } from '@/lib/permissions'
import { useKeys } from '@/lib/query-keys'
import { cn } from '@/lib/utils'
import type { ProductOut } from './listing-form'

/** Pick a real product from GET /products (cursor paged) to prefill the draft. */
export function ProductPicker({
  selected,
  onSelect,
}: {
  selected: Pick<ProductOut, 'id' | 'sku' | 'title'> | null
  onSelect: (p: ProductOut) => void
}) {
  const [open, setOpen] = useState(false)
  const keys = useKeys()
  const can = useCan()
  const list = useCursorList<ProductOut>({
    queryKey: keys.products.list(),
    enabled: open,
    fetchPage: (cursor) => unwrap(api.GET('/products', { params: { query: { limit: PAGE_SIZE, cursor } } })),
  })

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="min-w-0 flex-1 justify-between font-normal"
          data-testid="product-picker"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Icon name="box" size={16} className="text-muted-foreground" />
            {selected ? (
              <span className="truncate">
                <span className="font-mono text-xs">{selected.sku}</span>
                <span className="text-muted-foreground"> · {selected.title}</span>
              </span>
            ) : (
              <span className="text-muted-foreground">Start from a product…</span>
            )}
          </span>
          <Icon name="chev" size={16} className="opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(24rem,calc(100vw-2rem))] p-0" align="start">
        <Command>
          <CommandInput placeholder="Filter loaded products by SKU or title" />
          <CommandList className="max-h-72">
            {list.isPending ? (
              <div className="space-y-2 p-3" aria-busy>
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-7 w-full" />
                ))}
              </div>
            ) : list.error && !list.data ? (
              <div role="alert" className="flex flex-col items-center gap-2 px-4 py-6 text-center text-sm">
                <span>Couldn't load products. {describeError(list.error)}</span>
                {isApiError(list.error) ? <ReferenceId id={list.error.correlationId} /> : null}
                <Button size="sm" variant="outline" onClick={() => void list.refetch()}>
                  Retry
                </Button>
              </div>
            ) : list.rows.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-6 text-center text-sm text-muted-foreground">
                <span>No products in this brand yet.</span>
                <span className="text-xs">
                  {can('product:import')
                    ? 'Add one on the Products page, or write the draft by hand.'
                    : 'Write the draft by hand.'}
                </span>
              </div>
            ) : (
              <>
                <CommandEmpty>No loaded product matches.</CommandEmpty>
                <CommandGroup heading="Products">
                  {list.rows.map((p) => (
                    <CommandItem
                      key={p.id}
                      value={`${p.sku} ${p.title} ${p.id}`}
                      onSelect={() => {
                        onSelect(p)
                        setOpen(false)
                      }}
                      className="gap-2"
                    >
                      <Icon name="check" size={16} className={cn(selected?.id === p.id ? 'opacity-100' : 'opacity-0')} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{p.title}</span>
                        <span className="block truncate font-mono text-[11px] text-muted-foreground">
                          {p.sku} · {p.category}
                        </span>
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
                {list.hasNextPage ? (
                  <div className="border-t p-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full"
                      disabled={list.isFetchingNextPage}
                      onClick={() => void list.fetchNextPage()}
                    >
                      {list.isFetchingNextPage ? <Spinner data-icon="inline-start" /> : null}
                      Load more products
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
