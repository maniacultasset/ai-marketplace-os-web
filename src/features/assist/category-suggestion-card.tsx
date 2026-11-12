/**
 * SI14 category suggestion on a product with no category (product page, Inbox `category_review`).
 * Kuinn's candidates show with their confidence and a short reason; the seller confirms one or picks
 * another, and only that choice is saved (PATCH /products/{id} {category}). Hidden while the
 * backend's switch is off (`category_suggest_enabled: false`). See ./category-model.ts.
 */
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api, unwrap } from '@/api/client'
import { describeError, isApiError } from '@/api/errors'
import { isStaleVersion } from '@/api/etag'
import { idempotencyHeader, useIntentKey } from '@/api/idempotency'
import { Banner, CardHead, LaCard } from '@/components/la'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { AI_PAUSED_TEXT, isAiPausedError, markAiPaused } from '@/features/ai-credit/model'
import { categoryLabel } from '@/features/products/categories'
import { CategoryMappingLine } from '@/features/products/category-mapping'
import { CategorySelect } from '@/features/products/category-select'
import { useCatalogCategories } from '@/features/products/catalog-categories'
import { productQuery, useUpdateProduct, type ProductDetail } from '@/features/products/api'
import { OP_ACTION, useCan } from '@/lib/permissions'
import { useKeys } from '@/lib/query-keys'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { useLampsEnabled } from './flags'
import { AUTO_WAIT_MS, confidenceWord, formatConfidence, isCandidate, suggestView, type CategoryCandidate } from './category-model'

const POLL_MS = 3000

/** Re-render on a slow clock, so "waiting" turns into "ask" once the automatic run is overdue. */
function useNow(stepMs: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), stepMs)
    return () => clearInterval(t)
  }, [stepMs])
  return now
}

export function CategorySuggestionCard({ product, className }: { product: ProductDetail; className?: string }) {
  const now = useNow(5000)
  const view = suggestView(product, now)
  const keys = useKeys()
  const qc = useQueryClient()
  const can = useCan()
  const canChoose = can(OP_ACTION['PATCH /products/{product_id}'])
  const canAsk = can(OP_ACTION['POST /products/{product_id}/category-suggestion'])
  const intent = useIntentKey()
  const update = useUpdateProduct(product.id)
  const lamps = useLampsEnabled()
  const catalog = useCatalogCategories()
  const catalogItems = catalog.data?.items ?? null
  /** The suggestion's `at` when the seller asked (undefined: not asking). A new `at` means it landed. */
  const [askedFrom, setAskedFrom] = useState<string | null | undefined>(undefined)
  const currentAt = product.suggestions?.category?.at ?? null
  const asking = askedFrom !== undefined && askedFrom === currentAt
  const setAsking = (on: boolean) => setAskedFrom(on ? currentAt : undefined)
  const [askError, setAskError] = useState<string | null>(null)
  const [pickedRaw, setPicked] = useState<string>('')
  const [other, setOther] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)

  const candidates: CategoryCandidate[] = view.kind === 'candidates' ? view.candidates : []
  const picked = pickedRaw || candidates[0]?.category || ''
  const following = view.kind === 'waiting' || asking

  // While Kuinn reads the product, read it again every few seconds until the suggestion lands.
  useEffect(() => {
    if (!following) return
    const t = setInterval(() => void qc.invalidateQueries({ queryKey: productQuery(keys, product.id).queryKey }), POLL_MS)
    const stop = setTimeout(() => setAskedFrom(undefined), AUTO_WAIT_MS)
    return () => {
      clearInterval(t)
      clearTimeout(stop)
    }
  }, [following, qc, keys, product.id])

  if (view.kind === 'hidden') return null

  const ask = async () => {
    setAskError(null)
    setAsking(true)
    try {
      const out = await unwrap(
        api.POST('/products/{product_id}/category-suggestion', {
          params: { path: { product_id: product.id }, header: idempotencyHeader(intent.get()) },
        }),
      )
      intent.reset()
      // Only a queued job is followed; any other answer is already final.
      if (out.status !== 'queued') setAskedFrom(undefined)
      if (out.status === 'unavailable') setAskError('Kuinn can’t suggest a category right now. Choose one below.')
      void qc.invalidateQueries({ queryKey: productQuery(keys, product.id).queryKey })
    } catch (err) {
      setAsking(false)
      if (isApiError(err) && err.type === 'IDEMPOTENCY_KEY_REUSED') intent.reset()
      if (isAiPausedError(err)) {
        markAiPaused()
        setAskError(AI_PAUSED_TEXT)
      } else if (isApiError(err) && err.status === 429) setAskError('Today’s limit for suggestions is used up. Choose the category yourself, or try again tomorrow.')
      else setAskError(describeError(err))
    }
  }

  const save = (slug: string) => {
    setSaveError(null)
    update.mutate(
      { body: { category: slug }, etag: product.etag },
      {
        onSuccess: () => {
          toast.success('Category saved', { description: `${product.sku} is now in ${categoryLabel(slug)}.` })
          void qc.invalidateQueries({ queryKey: keys.tasks.all() })
        },
        onError: (err) => {
          if (isStaleVersion(err)) {
            void qc.invalidateQueries({ queryKey: productQuery(keys, product.id).queryKey })
            setSaveError('Someone changed this product a moment ago. Check the category and choose again.')
          } else setSaveError(describeError(err))
        },
      },
    )
  }

  const busy = update.isPending
  const choiceSlug = other || picked
  const choiceIsCandidate = isCandidate(choiceSlug, candidates)

  return (
    <LaCard emphasis="tint" className={cn('flex flex-col gap-4', className)} data-testid="category-suggestion" data-view={view.kind}>
      <CardHead
        icon="spark"
        iconTone="brand"
        title={view.kind === 'candidates' ? 'Kuinn suggests a category' : 'Choose a category'}
        sub={
          view.kind === 'candidates'
            ? 'Based on the name, details and photos. Nothing is set until you choose.'
            : view.kind === 'waiting' || asking
              ? 'Kuinn is reading the name, details and photos. This usually takes under a minute.'
              : view.kind === 'none'
                ? 'Kuinn could not tell the category with confidence. Choose it yourself.'
                : 'A listing needs a category first. Kuinn can suggest one from the name, details and photos.'
        }
      />

      {following ? (
        <p className="flex items-center gap-2 text-small text-ink-2" role="status" data-testid="category-suggestion-waiting">
          <Spinner className="size-4" aria-hidden />
          Reading the product
        </p>
      ) : null}

      {view.kind === 'candidates' ? (
        <fieldset className="flex flex-col gap-2" disabled={!canChoose || busy}>
          <legend className="sr-only">Suggested categories</legend>
          {candidates.map((c) => {
            const on = !other && picked === c.category
            return (
              <label
                key={c.category}
                className={cn(
                  'flex min-h-[52px] cursor-pointer items-start gap-3 rounded-tile border bg-surface px-3.5 py-3 transition-colors duration-150 motion-reduce:transition-none',
                  on ? 'border-brand shadow-raised-sm' : 'border-line-strong hover:border-ink-3',
                )}
                data-testid="category-candidate"
                data-category={c.category}
              >
                <input
                  type="radio"
                  name={`category-${product.id}`}
                  className="mt-0.5 size-[18px] shrink-0 accent-[var(--brand)]"
                  checked={on}
                  onChange={() => {
                    setOther('')
                    setPicked(c.category)
                  }}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <span className="text-body font-semibold text-ink">{categoryLabel(c.category)}</span>
                    <span className="text-caption text-ink-2 tabular-nums" data-testid="category-confidence">
                      {confidenceWord(c.confidence)} · {formatConfidence(c.confidence)}
                    </span>
                  </span>
                  {c.rationale ? <span className="mt-0.5 block text-small break-words text-ink-2">{c.rationale}</span> : null}
                  <CategoryMappingLine category={c.category} catalog={catalogItems} className="mt-1" data-testid="category-candidate-mapping" />
                </span>
              </label>
            )
          })}
        </fieldset>
      ) : null}

      {canChoose && (view.kind === 'candidates' || view.kind === 'none' || (view.kind === 'ask' && !asking)) ? (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <CategorySelect
              id={`suggest-other-${product.id}`}
              value={other}
              onChange={(slug) => setOther(slug)}
              lampsEnabled={lamps.enabled}
              catalog={catalogItems}
              required={false}
              disabled={busy}
              hint={view.kind === 'candidates' ? 'Or pick another category.' : 'Decides which marketplace template the agent fills.'}
            />
            {other ? <CategoryMappingLine category={other} catalog={catalogItems} data-testid="category-other-mapping" /> : null}
          </div>
        </div>
      ) : null}

      {askError ? (
        <Banner tone="neutral" role="status">
          {askError}
        </Banner>
      ) : null}
      {saveError ? (
        <Banner tone="danger" role="alert">
          {saveError}
        </Banner>
      ) : null}

      {canChoose ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {choiceSlug ? (
            <Button onClick={() => save(choiceSlug)} disabled={busy} className="max-sm:h-11 max-sm:w-full" data-testid="category-choose">
              {busy ? <Spinner data-icon="inline-start" /> : null}
              {choiceIsCandidate ? `Use ${categoryLabel(choiceSlug)}` : `Save ${categoryLabel(choiceSlug)}`}
            </Button>
          ) : null}
          {canAsk && ((view.kind === 'ask' && !asking) || (view.kind === 'none' && view.failed)) ? (
            <Button variant="secondary" onClick={() => void ask()} className="max-sm:h-11 max-sm:w-full" data-testid="category-ask">
              {view.kind === 'none' ? 'Try again' : 'Let Kuinn suggest'}
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="text-small text-ink-2">An owner or operator can choose the category.</p>
      )}
    </LaCard>
  )
}
