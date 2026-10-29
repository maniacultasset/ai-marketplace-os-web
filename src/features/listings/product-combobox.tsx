import { ChevronsUpDown } from 'lucide-react'
import { useState } from 'react'
import { api, unwrap } from '@/api/client'
import { describeError, isApiError } from '@/api/errors'
import type { Schema } from '@/api/types'
import { ReferenceId } from '@/components/states/reference-id'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { PAGE_SIZE, useCursorList } from '@/hooks/use-cursor-list'
import { useKeys } from '@/lib/query-keys'
import { Icon, IconGlyph } from '@/components/la/icons'

export type ProductPick = Pick<Schema<'ProductOut'>, 'id' | 'sku' | 'title' | 'category'>

/** Pick a product from GET /products (cursor paged). Filtering applies to loaded rows only. */
export function ProductCombobox({
  id,
  value,
  onChange,
  invalid,
  describedBy,
  placeholder = 'Choose a product…',
  disabled,
}: {
  id?: string
  value: ProductPick | null
  onChange: (p: ProductPick) => void
  invalid?: boolean
  describedBy?: string
  placeholder?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const keys = useKeys()
  const list = useCursorList<Schema<'ProductOut'>>({
    queryKey: keys.products.list(),
    enabled: open,
    fetchPage: (cursor) => unwrap(api.GET('/products', { params: { query: { limit: PAGE_SIZE, cursor } } })),
  })

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          disabled={disabled}
          className="h-auto min-h-9 w-full justify-between py-1.5 font-normal"
          data-testid="generate-product"
        >
          <span className="flex min-w-0 items-center gap-2 text-left">
            <Icon name="box" size={16} className="text-muted-foreground" />
            {value ? (
              <span className="min-w-0">
                <span className="block truncate text-sm">{value.title}</span>
                <span className="block truncate font-mono text-[11px] text-muted-foreground">{value.sku}</span>
              </span>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </span>
          {disabled ? null : <IconGlyph icon={ChevronsUpDown} size={16} className="text-ink-3" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-[min(22rem,calc(100vw-2rem))] p-0" align="start">
        <Command>
          <CommandInput placeholder="Filter loaded products by SKU or title" />
          <CommandList className="max-h-72">
            {list.isPending ? (
              <div className="space-y-2 p-3" aria-busy>
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : list.error && !list.data ? (
              <div role="alert" className="flex flex-col items-center gap-2 px-4 py-6 text-center text-sm">
                <span>Couldn’t load products. {describeError(list.error)}</span>
                {isApiError(list.error) ? <ReferenceId id={list.error.correlationId} /> : null}
                <Button size="sm" variant="outline" onClick={() => void list.refetch()}>
                  Retry
                </Button>
              </div>
            ) : list.rows.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                No products in this brand yet. Add one on the Products page first.
              </p>
            ) : (
              <>
                <CommandEmpty>No loaded product matches.</CommandEmpty>
                <CommandGroup heading="Products">
                  {list.rows.map((p) => (
                    <CommandItem
                      key={p.id}
                      value={`${p.sku} ${p.title} ${p.id}`}
                      onSelect={() => {
                        onChange(p)
                        setOpen(false)
                      }}
                      className="gap-2"
                    >
                      <Icon name="check" size={16} className={value?.id === p.id ? 'opacity-100' : 'opacity-0'} />
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
