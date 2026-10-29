import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Braces } from 'lucide-react'
import { CONCEPT_ICON } from '@/components/la/concept-icons'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useForm, useWatch, type FieldPath } from 'react-hook-form'
import { toast } from 'sonner'
import { api, unwrap } from '@/api/client'
import { describeError, isApiError, isNotFound } from '@/api/errors'
import type { ErrorDetail } from '@/api/types'
import { Icon, IconGlyph, IconTile, type IconName } from '@/components/la/icons'
import { EmptyState } from '@/components/states/empty-state'
import { ReferenceId } from '@/components/states/reference-id'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useKeys } from '@/lib/query-keys'
import { focusFirstInvalid, FORM_VALIDATION_MODE } from '@/lib/validation'
import { cn } from '@/lib/utils'
import { AttributesSection, ContentSection, KeywordsSection, TargetSection } from './draft-fields'
import { ErrorLine } from './error-line'
import { CATEGORY_RE, type Marketplace } from './labels'
import {
  attrKeyForItemPath,
  bodyBytes,
  draftSchema,
  emptyDraft,
  fieldForItemPath,
  fieldForLoc,
  formatBytes,
  fromProduct,
  LIMITS,
  MAX_BODY_BYTES,
  parseBody,
  toBody,
  type DraftValues,
  type DryRunBody,
  type ProductOut,
  type ValidationResult,
} from './listing-form'
import { ProductPicker } from './product-picker'
import { useAllRules } from './use-rules'
import { ValidationResultPanel } from './validation-result'

type Mode = 'form' | 'json'
const NO_TEMPLATE = 'No rule template for this marketplace and category.'

interface LastRun {
  result: ValidationResult
  category: string
  bodyText: string
}

type Problem =
  | { kind: 'too-large' }
  | { kind: 'forbidden'; error: unknown }
  | { kind: 'details'; details: ErrorDetail[]; error: unknown }
  | { kind: 'error'; error: unknown }

const pretty = (b: DryRunBody) => JSON.stringify(b, null, 2)
const compact = (b: DryRunBody) => JSON.stringify(b)

export function DryRunTool({
  initial,
}: {
  initial: { marketplace?: Marketplace; category?: string; productId?: string }
}) {
  const keys = useKeys()
  const form = useForm<DraftValues>({
    resolver: zodResolver(draftSchema),
    defaultValues: emptyDraft(initial),
    ...FORM_VALIDATION_MODE,
    // react-hook-form focuses in registration order, where the Controller-backed marketplace select
    // and term inputs come last; focus the first invalid control on the page instead (onSubmit).
    shouldFocusError: false,
  })
  const [mode, setMode] = useState<Mode>('form')
  const [extras, setExtras] = useState<Record<string, unknown>>({})
  const [jsonText, setJsonText] = useState('')
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [product, setProduct] = useState<Pick<ProductOut, 'id' | 'sku' | 'title'> | null>(null)
  const [last, setLast] = useState<LastRun | null>(null)
  const [problem, setProblem] = useState<Problem | null>(null)
  const resultRef = useRef<HTMLDivElement>(null)
  const jsonRef = useRef<HTMLTextAreaElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  // Category suggestions come from the whole live rule list (every page; no hardcoded list).
  const allRules = useAllRules({})
  const categories = useMemo(
    () => [...new Set(allRules.rows.map((r) => r.category).filter((c): c is string => !!c))].sort(),
    [allRules.rows],
  )

  // Live body for size/staleness.
  const values = useWatch({ control: form.control }) as DraftValues
  // In JSON mode the size is that of the body actually sent (send() re-serializes it compactly), so
  // the editor's indentation never counts. Unparseable text falls back to its raw size.
  const jsonParsed = useMemo(() => (mode === 'json' ? parseBody(jsonText) : null), [mode, jsonText])
  const currentText =
    mode === 'json'
      ? jsonParsed?.ok
        ? compact(jsonParsed.body)
        : jsonText
      : compact(toBody(values, extras))
  const currentBytes = bodyBytes(currentText)
  const stale = useMemo(() => {
    if (!last) return false
    if (mode === 'form') return currentText !== last.bodyText
    return !jsonParsed?.ok || currentText !== last.bodyText
  }, [last, mode, currentText, jsonParsed])

  const applyProduct = (p: ProductOut) => {
    const next = fromProduct(p, form.getValues())
    form.reset(next, { keepDefaultValues: true })
    setProduct({ id: p.id, sku: p.sku, title: p.title })
    if (mode === 'json') {
      setJsonText(pretty(toBody(next, extras)))
      setJsonError(null)
    }
    toast.success(`Prefilled from ${p.sku}`, {
      description: 'Product title, category and attributes copied. Products have no bullets or description; write them here.',
    })
  }

  // Deep link: /rules/check?product=<id> prefills from GET /products/{id} once.
  const productQuery = useQuery({
    queryKey: keys.products.detail(initial.productId ?? ''),
    enabled: !!initial.productId,
    queryFn: () =>
      unwrap(api.GET('/products/{product_id}', { params: { path: { product_id: initial.productId! } } })),
  })
  const prefilled = useRef(false)
  useEffect(() => {
    if (productQuery.data && !prefilled.current) {
      prefilled.current = true
      applyProduct(productQuery.data)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when the product arrives
  }, [productQuery.data])

  const run = useMutation({
    mutationFn: (body: DryRunBody) => unwrap(api.POST('/rules/dry-run', { body })),
    meta: { toast: false },
  })

  const send = (body: DryRunBody, category: string, sentMode: Mode) => {
    const bodyText = compact(body)
    if (bodyBytes(bodyText) > MAX_BODY_BYTES) {
      setProblem({ kind: 'too-large' })
      return
    }
    setProblem(null)
    run.mutate(body, {
      onSuccess: (result) => {
        setLast({ result, category, bodyText })
        if (window.matchMedia('(max-width: 1023px)').matches) {
          requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
        }
      },
      onError: (err) => {
        if (!isApiError(err)) return setProblem({ kind: 'error', error: err })
        if (err.status === 413) return setProblem({ kind: 'too-large' })
        if (err.status === 403) return setProblem({ kind: 'forbidden', error: err })
        if (err.status === 422) {
          const unmapped: ErrorDetail[] = []
          let first = true
          for (const d of err.details) {
            const name = sentMode === 'form' ? fieldForLoc(d.loc, form.getValues()) : null
            // rules_dry_run raises a bare "Invalid value." on listing.category when no current template
            // exists for a well-formed slug. Any other category detail (pattern, type) keeps its own msg.
            const noTemplate =
              d.loc.join('.') === 'body.listing.category' && d.msg === 'Invalid value.' && CATEGORY_RE.test(category)
            const msg = noTemplate ? NO_TEMPLATE : d.msg
            if (name) {
              form.setError(name as FieldPath<DraftValues>, { type: 'server', message: msg }, { shouldFocus: first })
              first = false
            } else unmapped.push({ ...d, msg })
          }
          if (unmapped.length) setProblem({ kind: 'details', details: unmapped, error: err })
          return
        }
        setProblem({ kind: 'error', error: err })
      },
    })
  }

  const onSubmit = () => {
    if (mode === 'json') {
      const p = parseBody(jsonText)
      if (!p.ok) {
        setJsonError(p.error)
        jsonRef.current?.focus()
        return
      }
      setJsonError(null)
      form.reset(p.values, { keepDefaultValues: true })
      setExtras(p.extras)
      const cat = (p.body.listing as { category?: unknown }).category
      send(p.body, typeof cat === 'string' ? cat : '', 'json')
      return
    }
    void form.handleSubmit(
      (v) => send(toBody(v, extras), v.category.trim(), 'form'),
      () => {
        setProblem(null)
        requestAnimationFrame(() => focusFirstInvalid(formRef.current))
      },
    )()
  }

  const switchMode = (next: string) => {
    if (next === mode) return
    if (next === 'json') {
      setJsonText(pretty(toBody(form.getValues(), extras)))
      setJsonError(null)
      setMode('json')
      return
    }
    const p = parseBody(jsonText)
    if (!p.ok) {
      setJsonError(`${p.error} Fix it before switching back to the form.`)
      return
    }
    form.reset(p.values, { keepDefaultValues: true })
    setExtras(p.extras)
    setJsonError(null)
    setMode('form')
  }

  const goToField = (path: string): boolean => {
    let vals = form.getValues()
    if (mode === 'json') {
      const p = parseBody(jsonText)
      if (!p.ok) return false
      vals = p.values
      form.reset(p.values, { keepDefaultValues: true })
      setExtras(p.extras)
      setMode('form')
    }
    let name = fieldForItemPath(path, vals)
    if (name === 'bullets') name = 'bullets.0.value'
    // A missing attribute has no row yet: add one with that key and focus its value.
    const attrKey = attrKeyForItemPath(path)
    if (!name && attrKey && vals.attributes.length < LIMITS.attributes) {
      const i = vals.attributes.length
      form.setValue('attributes', [...vals.attributes, { key: attrKey, type: 'text', value: '' }], { shouldDirty: true })
      name = `attributes.${i}.value`
    }
    if (!name) {
      toast.info(`${path} is not in the form`, { description: 'Edit it in the JSON tab.' })
      return false
    }
    setTimeout(() => form.setFocus(name as FieldPath<DraftValues>, { shouldSelect: false }), 50)
    return true
  }

  const reset = () => {
    // Keep the target. In JSON mode it comes from the editor text (the form may be behind it).
    let target: { marketplace?: Marketplace; category?: string } = {
      marketplace: values.marketplace || undefined,
      category: values.category || undefined,
    }
    if (mode === 'json') {
      const p = parseBody(jsonText)
      if (p.ok) {
        const m = p.values.marketplace
        target = {
          marketplace: m === 'amazon' || m === 'flipkart' ? m : undefined,
          category: p.values.category || undefined,
        }
      }
    }
    const next = emptyDraft(target)
    form.reset(next)
    setExtras({})
    setProduct(null)
    setLast(null)
    setProblem(null)
    setJsonError(null)
    if (mode === 'json') setJsonText(pretty(toBody(next, {})))
  }

  const overLimit = currentBytes > MAX_BODY_BYTES
  const extraKeys = Object.keys(extras)

  return (
    <div className="@container/dry">
      <form
        ref={formRef}
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit()
        }}
        className="grid items-start gap-6 @4xl/dry:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] @6xl/dry:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] @6xl/dry:gap-8"
      >
        <div className="@container/left min-w-0 space-y-4">
          <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-raised-md @2xl/left:flex-row @2xl/left:items-center @2xl/left:justify-between @2xl/left:pl-5">
            <div className="flex min-w-0 items-start gap-3">
              <IconTile icon="box" tone="brand" size="sm" />
              <div className="min-w-0 space-y-0.5">
                <p className="text-sm font-medium">Start from a product</p>
                <p className="text-[13px] text-muted-foreground">Copies its title, category and attributes into the draft.</p>
              </div>
            </div>
            <div className="flex min-w-0 items-center gap-1 @2xl/left:w-80 @2xl/left:shrink-0">
              <ProductPicker selected={product} onSelect={applyProduct} />
              {product ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Clear product"
                  onClick={() => {
                    setProduct(null)
                    form.setValue('product_id', crypto.randomUUID(), { shouldDirty: true })
                  }}
                >
                  <Icon name="x" size={16} />
                </Button>
              ) : null}
            </div>
          </div>
          {initial.productId && productQuery.isPending ? (
            <Skeleton className="h-4 w-56" />
          ) : productQuery.error ? (
            <p role="alert" className="flex flex-wrap items-center gap-2 text-xs text-destructive">
              {isNotFound(productQuery.error)
                ? 'The linked product was not found in this brand.'
                : `Couldn't load the linked product. ${describeError(productQuery.error)}`}
              {isApiError(productQuery.error) ? <ReferenceId id={productQuery.error.correlationId} /> : null}
            </p>
          ) : null}

          <Tabs value={mode} onValueChange={switchMode}>
            <div className="flex items-center justify-between gap-2">
              <TabsList className="h-9 [&_[data-slot=tabs-trigger]]:px-3">
                <TabsTrigger value="form">
                  <IconGlyph icon={CONCEPT_ICON.rules} size={16} />
                  Form
                </TabsTrigger>
                <TabsTrigger value="json" data-testid="tab-json">
                  <IconGlyph icon={Braces} size={16} />
                  JSON
                </TabsTrigger>
              </TabsList>
              <span
                className={cn('text-xs tabular-nums', overLimit ? 'font-medium text-destructive' : 'text-muted-foreground')}
                title="Size of the request body as sent (compact JSON); the API accepts up to 256 KiB"
                data-testid="body-size"
              >
                {formatBytes(currentBytes)} / 256 KiB
              </span>
            </div>
            <TabsContent value="form" className="mt-3 space-y-4">
              {extraKeys.length ? (
                <p className="rounded-lg border border-line bg-sunken px-3 py-2 text-xs text-ink-2">
                  Also sending from the JSON editor: {extraKeys.map((k) => <code key={k} className="mr-1 font-mono">{k}</code>)}
                </p>
              ) : null}
              <TargetSection form={form} categories={categories} />
              <ContentSection form={form} />
              <KeywordsSection form={form} />
              <AttributesSection form={form} />
            </TabsContent>
            <TabsContent value="json" className="mt-3">
              <Card>
                <CardContent className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="max-w-prose text-[13px] text-muted-foreground">
                      The full request body: <code className="font-mono">{'{"listing": CanonicalListing}'}</code>. Fields
                      the form does not cover (images, status, locale…) can be set here.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const p = parseBody(jsonText)
                        if (!p.ok) return setJsonError(p.error)
                        setJsonError(null)
                        setJsonText(pretty(p.body))
                      }}
                    >
                      <IconGlyph icon={Braces} size={16} />
                      Format
                    </Button>
                  </div>
                  <Textarea
                    ref={jsonRef}
                    name="body"
                    aria-label="Request body JSON"
                    value={jsonText}
                    onChange={(e) => {
                      setJsonText(e.target.value)
                      if (jsonError) setJsonError(null)
                    }}
                    spellCheck={false}
                    rows={24}
                    aria-invalid={!!jsonError}
                    aria-describedby={jsonError ? 'json-error' : undefined}
                    autoComplete="off"
                    autoCapitalize="off"
                    className="min-h-[28rem] resize-y font-mono text-xs leading-relaxed"
                    data-testid="json-editor"
                  />
                  <ErrorLine message={jsonError} id="json-error" testId="json-error" />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-between gap-2 border-t border-line bg-surface px-4 py-3 shadow-raised-up sm:bottom-4 sm:mx-0 sm:rounded-card sm:border sm:px-3 sm:shadow-raised-lg">
            <Button type="button" variant="ghost" onClick={reset} className="text-muted-foreground">
              <Icon name="refresh" size={16} data-icon="inline-start" />
              Reset
            </Button>
            <Button type="submit" disabled={run.isPending || overLimit} data-testid="run-dry-run">
              {run.isPending ? <Spinner data-icon="inline-start" /> : <IconGlyph icon={CONCEPT_ICON.dryRun} size={16} />}
              {run.isPending ? 'Checking…' : 'Run check'}
            </Button>
          </div>
        </div>

        <aside
          ref={resultRef}
          className="min-w-0 scroll-mt-20 space-y-4 lg:sticky lg:top-20 lg:-m-1 lg:max-h-[calc(100svh-6.5rem)] lg:overflow-y-auto lg:overscroll-contain lg:p-1"
          aria-live="polite"
        >
          {problem ? <ProblemAlert problem={problem} onDismiss={() => setProblem(null)} /> : null}
          {run.isPending ? (
            <div className="space-y-4" aria-busy>
              <div className="rounded-card border border-line bg-surface shadow-raised-md">
                <div className="flex items-start gap-3.5 p-5">
                  <Skeleton className="size-10 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Spinner />
                      Running the rules engine…
                    </div>
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-4 border-t px-5 py-3">
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-7" />
                  ))}
                </div>
              </div>
              <div className="space-y-3 rounded-card border border-line bg-surface p-5 shadow-raised-md">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            </div>
          ) : last ? (
            <ValidationResultPanel
              result={last.result}
              category={last.category}
              stale={stale}
              onGoToField={goToField}
            />
          ) : (
            <div className="rounded-card border border-dashed border-line-strong">
              <EmptyState
                compact
                icon={CONCEPT_ICON.dryRun}
                title="No check run yet"
                description="Fill in the draft and run a check. Nothing is saved; the result shows every rule that fails."
              />
            </div>
          )}
        </aside>
      </form>
    </div>
  )
}

function ProblemAlert({ problem, onDismiss }: { problem: Problem; onDismiss: () => void }) {
  let icon: IconName = 'alert'
  let title = 'Check failed'
  let body: ReactNode = null
  let ref: string | null = null
  if (problem.kind === 'too-large') {
    title = 'Draft too large'
    body = 'The request body is over 256 KiB. Shorten the description or remove attributes.'
  } else if (problem.kind === 'forbidden') {
    icon = 'lock'
    title = 'Not allowed'
    body = 'Your role can no longer run dry runs in this brand.'
    ref = isApiError(problem.error) ? problem.error.correlationId : null
  } else if (problem.kind === 'details') {
    title = 'The API rejected the draft'
    body = (
      <ul className="mt-1 space-y-1" data-testid="problem-details">
        {problem.details.map((d, i) => (
          <li key={i}>
            <code className="font-mono text-[11px]">{d.loc.filter((x) => x !== 'body').join('.')}</code>: {d.msg}
          </li>
        ))}
      </ul>
    )
    ref = isApiError(problem.error) ? problem.error.correlationId : null
  } else {
    body = describeError(problem.error)
    ref = isApiError(problem.error) ? problem.error.correlationId : null
  }
  return (
    <div
      role="alert"
      className="relative space-y-1.5 rounded-card border border-danger-line bg-danger-bg p-4 pr-10 text-sm"
      data-testid="dry-run-problem"
    >
      <div className="flex items-center gap-2 font-medium text-destructive">
        <IconTile icon={icon} tone="fail" size="sm" flat />
        {title}
      </div>
      <div className="text-muted-foreground">{body}</div>
      <ReferenceId id={ref} />
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        className="tactile absolute top-3 right-3 inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-hover active:bg-pressed focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <Icon name="x" size={14} />
      </button>
    </div>
  )
}
