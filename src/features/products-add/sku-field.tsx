/**
 * The SKU field of the add form (client feedback 11 Nov, item 3): the seller's own SKU, checked a
 * moment after typing stops (never on every key), with "Make one for me" for a seller who has
 * none. See ./sku-check.ts for the contract and the states.
 */
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { api, unwrap } from '@/api/client'
import { describeError, isApiError } from '@/api/errors'
import { idempotencyHeader, useIntentKey } from '@/api/idempotency'
import { Icon } from '@/components/la'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { TextField } from '@/features/products/intake-fields'
import { SKU_MAX } from '@/features/products/schema'
import { OP_ACTION, useCan } from '@/lib/permissions'
import { useKeys } from '@/lib/query-keys'
import { cn } from '@/lib/utils'
import { SKU_CHECK_DELAY_MS, SKU_HINT, skuState, takenMessage } from './sku-check'

const SLUG = /^[a-z0-9_]{2,64}$/

export function SkuField({
  id,
  value,
  onChange,
  onBlur,
  error,
  submitCount,
  category,
  brandName,
  className,
}: {
  id: string
  value: string
  onChange: (sku: string) => void
  onBlur?: () => void
  error?: string
  submitCount?: number
  /** The category picked so far: the made SKU carries its short code. */
  category?: string
  /** The product's own brand name, when it has one (else the store's name is used). */
  brandName?: string
  className?: string
}) {
  const keys = useKeys()
  const can = useCan()
  const canMake = can(OP_ACTION['POST /skus/suggestion'])
  const intent = useIntentKey()
  const [settled, setSettled] = useState(value)
  const [making, setMaking] = useState(false)
  const [makeError, setMakeError] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setSettled(value), SKU_CHECK_DELAY_MS)
    return () => clearTimeout(t)
  }, [value])

  const sku = settled.trim()
  const check = useQuery({
    queryKey: [...keys.all(), 'skus', 'availability', sku] as const,
    queryFn: () => unwrap(api.GET('/skus/availability', { params: { query: { sku } } })),
    enabled: sku !== '' && skuState(sku, sku, null).kind !== 'invalid',
    staleTime: 15_000,
    retry: false,
  })
  const state = skuState(value, settled, check.isError ? null : check.data)

  const make = async () => {
    setMakeError(null)
    setMaking(true)
    try {
      const cat = (category ?? '').trim()
      const brand = (brandName ?? '').trim()
      const out = await unwrap(
        api.POST('/skus/suggestion', {
          params: { header: idempotencyHeader(intent.get()) },
          body: { ...(SLUG.test(cat) ? { category: cat } : {}), ...(brand ? { brand_name: brand.slice(0, 200) } : {}) },
        }),
      )
      intent.reset()
      onChange(out.sku)
      setSettled(out.sku)
    } catch (err) {
      if (isApiError(err) && err.type === 'IDEMPOTENCY_KEY_REUSED') intent.reset()
      setMakeError(describeError(err))
    } finally {
      setMaking(false)
    }
  }

  const v = value.trim()
  const taken = state.kind === 'taken' ? takenMessage(v, { title: state.title, is_variant: state.isVariant, deleted: state.deleted }) : undefined

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <TextField
        id={id}
        label="SKU"
        required
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        error={error ?? taken}
        hint={`${SKU_HINT} Sizes and colours get their own SKUs on the variants step.`}
        submitCount={submitCount}
        maxLength={SKU_MAX + 8}
        code
      />
      <div className="flex min-h-[30px] flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="flex min-w-0 items-center gap-1.5 text-caption text-ink-2" role="status" aria-live="polite" data-testid="sku-check" data-state={state.kind}>
          {state.kind === 'checking' ? (
            <>
              <Spinner className="size-3.5" aria-hidden />
              Checking this SKU
            </>
          ) : state.kind === 'free' ? (
            <>
              <Icon name="check" size={14} className="text-success" aria-hidden />
              Free to use in this brand
            </>
          ) : state.kind === 'taken' && state.productId ? (
            <Link to="/products/$productId" params={{ productId: state.productId }} className="focus-ring rounded font-semibold text-ink underline">
              Open the product that uses it
            </Link>
          ) : state.kind === 'unknown' ? (
            'Couldn’t check it now. It is checked again when you save.'
          ) : null}
        </p>
        {canMake ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => void make()} disabled={making} data-testid="sku-make">
            {making ? <Spinner data-icon="inline-start" /> : <Icon name="spark" size={14} aria-hidden />}
            Make one for me
          </Button>
        ) : null}
      </div>
      {makeError ? (
        <p className="text-caption text-danger" role="alert" data-testid="sku-make-error">
          {makeError}
        </p>
      ) : null}
    </div>
  )
}
