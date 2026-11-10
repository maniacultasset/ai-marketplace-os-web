/**
 * "Make size variants" (V1.1): under the saved size chart, the seller ticks the sizes to make and
 * confirms. Each ticked size becomes one variant with the SKU shown; sizes the style already has
 * are shown as made. Nothing is made until the seller confirms.
 */
import { useState } from 'react'
import { toast } from 'sonner'
import { Banner, Icon } from '@/components/la'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Spinner } from '@/components/ui/spinner'
import type { ProductDetail } from './api'
import { sizeRunErrorMessage, sizeRunPlan, useCreateSizeRun } from './size-run'

export function SizeRunAction({ product }: { product: ProductDetail }) {
  const plan = sizeRunPlan(product)
  const create = useCreateSizeRun(product.id)
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())

  if (!plan) return null
  const fresh = plan.options.filter((o) => !o.exists)
  if (!fresh.length && !plan.blocked) {
    return (
      <p className="mt-3 flex items-center gap-1.5 text-caption text-ink-2" data-testid="size-run-done">
        <Icon name="check" size={14} className="shrink-0 text-success" />
        Every size on the chart is a variant.
      </p>
    )
  }

  const begin = () => {
    create.reset()
    setPicked(new Set(fresh.map((o) => o.label)))
    setOpen(true)
  }
  const toggle = (label: string, on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (on) next.add(label)
      else next.delete(label)
      return next
    })
  const chosen = plan.options.filter((o) => !o.exists && picked.has(o.label))
  const confirm = () =>
    create.mutate(
      chosen.map((o) => o.label),
      {
        onSuccess: (out) => {
          setOpen(false)
          const n = out.created.length
          toast.success(n ? `Made ${n} size ${n === 1 ? 'variant' : 'variants'}.` : 'These sizes are already variants.')
        },
      },
    )

  if (!open) {
    return (
      <div className="mt-3 flex flex-col gap-2" data-testid="size-run">
        {plan.blocked ? (
          <p className="flex items-start gap-1.5 text-caption text-ink-2" data-testid="size-run-blocked">
            <Icon name="info" size={14} className="mt-[calc((1lh-14px)/2)] shrink-0" />
            {plan.blocked}
          </p>
        ) : (
          <div>
            <Button type="button" variant="secondary" size="sm" onClick={begin} data-testid="size-run-start">
              <Icon name="plus" size={16} />
              Make size variants from this chart
            </Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="mt-3 rounded-tile border border-line p-3" data-testid="size-run-panel" role="group" aria-labelledby="size-run-title">
      <p id="size-run-title" className="text-small font-semibold text-ink">
        Which sizes do you sell?
      </p>
      <p className="mt-0.5 text-caption text-ink-2">Each ticked size becomes a variant with its own SKU. You add barcodes and stock to each one after.</p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {plan.options.map((o) => {
          const slug = o.key.replace(/[^a-z0-9]+/g, '-')
          const id = `size-run-${slug}`
          return (
            <li key={o.key} className="flex min-w-0 items-center gap-2">
              <Checkbox
                id={id}
                checked={o.exists || picked.has(o.label)}
                disabled={o.exists || create.isPending}
                onCheckedChange={(v) => toggle(o.label, v === true)}
                data-testid={`size-run-pick-${slug}`}
              />
              <label htmlFor={id} className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-small">
                <span className="font-semibold text-ink">{o.label}</span>
                <span className="min-w-0 break-all font-mono text-caption text-ink-2">{o.sku}</span>
                {o.exists ? <span className="text-caption text-ink-3">already a variant</span> : null}
              </label>
            </li>
          )
        })}
      </ul>
      <p className="mt-3 text-caption text-ink-2">Listings of this product that are not sent yet are checked again and need a new draft.</p>
      {create.isError ? (
        <Banner tone="danger" role="alert" className="mt-3" data-testid="size-run-error">
          {sizeRunErrorMessage(create.error)}
        </Banner>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={confirm} disabled={!chosen.length || create.isPending} data-testid="size-run-confirm">
          {create.isPending ? <Spinner data-icon="inline-start" aria-hidden /> : null}
          {chosen.length ? `Make ${chosen.length} size ${chosen.length === 1 ? 'variant' : 'variants'}` : 'Tick a size'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={create.isPending} data-testid="size-run-cancel">
          Cancel
        </Button>
      </div>
    </div>
  )
}
