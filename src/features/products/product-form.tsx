import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate } from '@tanstack/react-router'
import { useMemo, useState, type ReactNode } from 'react'
import { Controller, useFieldArray, useForm, type UseFormSetError } from 'react-hook-form'
import { toast } from 'sonner'
import { isApiError } from '@/api/errors'
import { ReferenceId } from '@/components/states/reference-id'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { toastError } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { filterInput, FORM_VALIDATION_MODE, type Sanitizer } from '@/lib/validation'
import { fetchProductsPage, MAX_PAGE_SIZE, useCreateProduct, useProductsList } from './api'
import {
  ATTRIBUTE_KEY_SUGGESTIONS,
  ATTRIBUTE_TEXT_MAX,
  ATTRIBUTE_TYPES,
  canonicalKey,
  codePoints,
  emptyAttribute,
  KNOWN_CATEGORIES,
  MAX_ATTRIBUTES,
  productFormSchema,
  SKU_MAX,
  TITLE_MAX,
  type ProductFormInput,
  type ProductFormValues,
} from './schema'
import { Icon } from '@/components/la/icons'

const SKU_CONFLICT_MESSAGE = 'This SKU already exists in this brand.'

/**
 * Number attribute values: refuse keystrokes that can never be part of a decimal (letters other
 * than an exponent's e). The schema still rejects hex, Infinity, "+5", ".5" and the like.
 */
const numberChars: Sanitizer = (v) => v.replace(/[^0-9.eE+-]/g, '')
/** Text rows: no filter (also replaces a number row's filter when the row's type changes). */
const asTyped: Sanitizer = (v) => v

type Detail = { loc: (string | number)[]; msg: string }

/** Detail on `attributes.<key>` with no union variant: the backend rejects the key itself
 * (e.g. a product field such as brand_name or title, or two keys saved under one canonical key). */
const KEY_REJECTED_MESSAGE = "This key can't be saved as a product attribute."

/**
 * Map a 422 onto the form. Top-level fields go to their inputs; `attributes.<key>[.<variant>]`
 * goes to the row that sent that key (key errors on the key input, value errors on the value).
 * Returns the details that are not shown on any field.
 */
function applyServerErrors(
  err: unknown,
  values: ProductFormValues,
  setError: UseFormSetError<ProductFormInput>,
): Detail[] {
  if (!isApiError(err) || err.status !== 422) return []
  const unmapped: Detail[] = []
  const done = new Set<string>()
  let focus = true
  const set = (name: string, message: string) => {
    if (done.has(name)) return
    done.add(name)
    setError(name as never, { type: 'server', message }, { shouldFocus: focus })
    focus = false
  }
  // Union value errors per row: shown only if one matches the row's type, else reported as unmapped.
  const valueDetails = new Map<number, Detail[]>()
  for (const d of err.details) {
    const [where, field, key, variant] = d.loc
    if (where !== 'body') {
      unmapped.push(d)
      continue
    }
    if ((field === 'sku' || field === 'title' || field === 'category') && d.loc.length === 2) {
      set(field, d.msg)
      continue
    }
    if (field === 'attributes' && typeof key === 'string') {
      // The server reports aliases (material) under their canonical key (fabric_type).
      let i = values.attributes.findIndex((r) => r.key === key)
      if (i === -1) i = values.attributes.findIndex((r) => canonicalKey(r.key) === key)
      if (i === -1) {
        unmapped.push(d)
        continue
      }
      if (err.type === 'UNKNOWN_FACT_KEY') {
        set(`attributes.${i}.key`, 'Unknown attribute.')
        continue
      }
      if (variant === '[key]') {
        set(`attributes.${i}.key`, d.msg)
        continue
      }
      if (variant === undefined) {
        // Values are type-checked per union member (always with a variant), and the client
        // already rejects NUL in text, so a bare detail here is about the key.
        set(`attributes.${i}.key`, KEY_REJECTED_MESSAGE)
        continue
      }
      valueDetails.set(i, [...(valueDetails.get(i) ?? []), d])
      continue
    }
    if (field === 'attributes' && d.loc.length === 2) {
      set('attributes.root', d.msg)
      continue
    }
    unmapped.push(d)
  }
  for (const [i, details] of valueDetails) {
    // One detail per union member (constrained-str, bool, int, float): keep the row type's.
    const type = values.attributes[i]!.type
    const match = details.find(({ loc: [, , , variant] }) =>
      type === 'text'
        ? variant === 'constrained-str' || variant === 'str'
        : type === 'number'
          ? variant === 'float' || variant === 'int'
          : variant === 'bool',
    )
    if (match) set(`attributes.${i}.value`, match.msg)
    else unmapped.push(...details)
  }
  return unmapped
}

/** Pages read when looking up a conflicting SKU (there is no SKU filter on GET /products). */
const SKU_LOOKUP_MAX_PAGES = 5

async function findProductIdBySku(sku: string): Promise<string | null> {
  let cursor: string | undefined
  for (let i = 0; i < SKU_LOOKUP_MAX_PAGES; i++) {
    const page = await fetchProductsPage(MAX_PAGE_SIZE, cursor)
    const hit = page.data.find((p) => p.sku === sku)
    if (hit) return hit.id
    if (!page.page.has_more || !page.page.next_cursor) return null
    cursor = page.page.next_cursor
  }
  return null
}

export function ProductForm() {
  const navigate = useNavigate()
  const create = useCreateProduct()
  const loaded = useProductsList()
  const [conflictSku, setConflictSku] = useState<string | null>(null)
  const [lookingUp, setLookingUp] = useState(false)
  const [submitError, setSubmitError] = useState<unknown>(null)
  /** 422 details not shown on any field (rendered in the form-error box). */
  const [unmappedDetails, setUnmappedDetails] = useState<Detail[]>([])

  const form = useForm<ProductFormInput, unknown, ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: { sku: '', title: '', category: '', attributes: [] },
    ...FORM_VALIDATION_MODE,
  })
  const { errors, isSubmitting, isSubmitted } = form.formState
  const attributes = useFieldArray({ control: form.control, name: 'attributes' })

  const categories = useMemo(() => {
    const set = new Set<string>(KNOWN_CATEGORIES)
    for (const p of loaded.rows) set.add(p.category)
    return [...set].sort()
  }, [loaded.rows])

  const title = form.watch('title')
  const titleLen = codePoints(title.trim())

  const onSubmit = form.handleSubmit(async (values) => {
    setConflictSku(null)
    setSubmitError(null)
    setUnmappedDetails([])
    try {
      const product = await create.mutateAsync(values)
      toast.success('Product created', { description: product.sku })
      await navigate({ to: '/products/$productId', params: { productId: product.id } })
    } catch (err) {
      if (isApiError(err) && err.type === 'SKU_CONFLICT') {
        form.setError('sku', { type: 'server', message: SKU_CONFLICT_MESSAGE }, { shouldFocus: true })
        setConflictSku(values.sku)
        return
      }
      if (isApiError(err) && err.status === 422) {
        const rest = applyServerErrors(err, values, form.setError)
        if (rest.length) {
          setUnmappedDetails(rest)
          setSubmitError(err)
        }
        return
      }
      if (isApiError(err) && err.status === 0) {
        // Not idempotency-keyed: never auto-retry. A resubmit that hits SKU_CONFLICT offers the existing product.
        toastError(err, "Couldn't confirm the product was created")
        setSubmitError(err)
        return
      }
      if (isApiError(err) && err.status === 401) return
      toastError(err, "Couldn't create product")
      setSubmitError(err)
    }
  })

  const openExisting = async () => {
    if (!conflictSku) return
    setLookingUp(true)
    try {
      const id = await findProductIdBySku(conflictSku)
      if (id) await navigate({ to: '/products/$productId', params: { productId: id } })
      else toast.info(`No product with that SKU among the newest ${SKU_LOOKUP_MAX_PAGES * MAX_PAGE_SIZE} products.`)
    } catch (err) {
      toastError(err, "Couldn't look up the existing product")
    } finally {
      setLookingUp(false)
    }
  }

  const pending = isSubmitting || create.isPending
  const atMax = attributes.fields.length >= MAX_ATTRIBUTES

  return (
    <form onSubmit={onSubmit} noValidate aria-label="New product">
      <Card className="gap-0 overflow-visible py-0">
        <FormSection title="Details" description="New products start as drafts. SKUs are unique within this brand.">
          <FieldGroup className="gap-6">
            <Field data-invalid={!!errors.title || undefined}>
              <div className="flex items-baseline justify-between gap-2">
                <FieldLabel htmlFor="title">Title</FieldLabel>
                <span
                  className={cn('text-xs tabular-nums text-muted-foreground', titleLen > TITLE_MAX && 'text-destructive')}
                  id="title-count"
                >
                  {titleLen}/{TITLE_MAX}
                </span>
              </div>
              <Input
                id="title"
                autoComplete="off"
                maxLength={TITLE_MAX * 2}
                placeholder="Cotton kurta set"
                aria-invalid={!!errors.title || undefined}
                aria-describedby="title-count"
                {...form.register('title')}
              />
              <FieldError errors={[errors.title]} />
            </Field>
            <div className="grid gap-6 sm:grid-cols-2 sm:gap-4">
              <Field data-invalid={!!errors.sku || undefined}>
                <FieldLabel htmlFor="sku">SKU</FieldLabel>
                <Input
                  id="sku"
                  autoComplete="off"
                  spellCheck={false}
                  autoCapitalize="none"
                  maxLength={SKU_MAX + 8}
                  className="font-mono"
                  placeholder="KURTA-003"
                  aria-invalid={!!errors.sku || undefined}
                  {...form.register('sku', { onChange: () => setConflictSku(null) })}
                />
                <div className="flex flex-col gap-2 sm:min-h-10">
                <FieldError errors={[errors.sku]} />
                {conflictSku ? (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto w-fit px-0"
                    onClick={() => void openExisting()}
                    disabled={lookingUp}
                    data-testid="open-existing"
                  >
                    {lookingUp ? <Spinner data-icon="inline-start" /> : <Icon name="external" size={16} data-icon="inline-start" />}
                    Open existing product
                  </Button>
                ) : !errors.sku ? (
                  <FieldDescription>Up to 64 characters, no spaces or "]".</FieldDescription>
                ) : null}
                </div>
              </Field>
              <Field data-invalid={!!errors.category || undefined}>
                <FieldLabel htmlFor="category">Category</FieldLabel>
                <Input
                  id="category"
                  list="product-categories"
                  autoComplete="off"
                  spellCheck={false}
                  autoCapitalize="none"
                  maxLength={64 + 8}
                  placeholder="ethnic_wear_kurta_sets"
                  aria-invalid={!!errors.category || undefined}
                  {...form.register('category')}
                />
                <datalist id="product-categories">
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
                {/* Two lines reserved at sm+: the longer error replaces the hint without shifting the form below. */}
                <div className="flex flex-col gap-2 sm:min-h-10">
                  <FieldError errors={[errors.category]} />
                  {!errors.category ? (
                    <FieldDescription>Lowercase slug, 2-64 characters: letters, digits and _.</FieldDescription>
                  ) : null}
                </div>
              </Field>
            </div>
          </FieldGroup>
        </FormSection>

        <FormSection
          title="Attributes"
          description={
            <>
              Optional facts such as color or fabric. Aliases like <code className="font-mono text-xs">material</code>{' '}
              are saved under their canonical key.
            </>
          }
          meta={
            <span className="text-xs tabular-nums text-muted-foreground">
              {attributes.fields.length}/{MAX_ATTRIBUTES}
            </span>
          }
        >
          <div className="flex flex-col gap-3">
            {attributes.fields.length === 0 ? (
              <p className="rounded-lg border border-dashed px-4 py-5 text-center text-sm text-muted-foreground">
                No attributes yet. You can create the product without any.
              </p>
            ) : (
              <ul className="flex flex-col gap-3 sm:gap-2" aria-label="Attributes">
                <li
                  aria-hidden
                  className={cn(ATTR_GRID, 'hidden text-xs font-medium text-muted-foreground sm:grid')}
                >
                  <span>Key</span>
                  <span>Type</span>
                  <span>Value</span>
                  <span />
                </li>
                {attributes.fields.map((f, i) => {
                  // An empty row the user just added is not flagged on blur (that shifted the "Add attribute"
                  // button mid-click); its errors show once the row is edited or the form is submitted.
                  const row = form.watch(`attributes.${i}`) ?? emptyAttribute()
                  const rowShown = isSubmitted || row.key !== '' || (row.type !== 'boolean' && row.value !== '')
                  const rowErr = rowShown ? errors.attributes?.[i] : undefined
                  const type = row.type
                  return (
                    <li
                      key={f.id}
                      data-testid={`attribute-row-${i}`}
                      className={cn(
                        'grid grid-cols-[minmax(0,1fr)_6.5rem_2.25rem] gap-2 rounded-lg bg-muted/40 p-2.5 ring-1 ring-border ring-inset sm:items-start sm:bg-transparent sm:p-0 sm:ring-0',
                        ATTR_GRID,
                      )}
                    >
                      <div className="flex min-w-0 flex-col gap-1">
                        <Input
                          list="attribute-keys"
                          autoComplete="off"
                          spellCheck={false}
                          autoCapitalize="none"
                          maxLength={64 + 8}
                          placeholder="color"
                          className="font-mono"
                          aria-label={`Attribute ${i + 1} key`}
                          aria-invalid={!!rowErr?.key || undefined}
                          {...form.register(`attributes.${i}.key`)}
                        />
                        <FieldError errors={[rowErr?.key]} className="text-xs" />
                      </div>
                      <Controller
                        control={form.control}
                        name={`attributes.${i}.type`}
                        render={({ field }) => (
                          <Select
                            value={field.value}
                            onValueChange={(v) => {
                              field.onChange(v)
                              const current = form.getValues(`attributes.${i}.value`)
                              if (v === 'boolean' && current !== 'true' && current !== 'false')
                                form.setValue(`attributes.${i}.value`, 'true')
                              if (v !== 'boolean' && (current === 'true' || current === 'false'))
                                form.setValue(`attributes.${i}.value`, '')
                              form.clearErrors(`attributes.${i}.value`)
                            }}
                          >
                            <SelectTrigger className={FIELD_SELECT} aria-label={`Attribute ${i + 1} type`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ATTRIBUTE_TYPES.map((t) => (
                                <SelectItem key={t} value={t} className="capitalize">
                                  {t}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                      <div className="order-last col-span-3 flex min-w-0 flex-col gap-1 sm:order-none sm:col-span-1">
                        {type === 'boolean' ? (
                          <Controller
                            control={form.control}
                            name={`attributes.${i}.value`}
                            render={({ field }) => (
                              <Select value={field.value} onValueChange={field.onChange}>
                                <SelectTrigger className={FIELD_SELECT} aria-label={`Attribute ${i + 1} value`}>
                                  <SelectValue placeholder="Choose" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="true">true</SelectItem>
                                  <SelectItem value="false">false</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                          />
                        ) : (
                          <Input
                            autoComplete="off"
                            inputMode={type === 'number' ? 'decimal' : undefined}
                            placeholder={type === 'number' ? '180' : 'navy blue'}
                            aria-label={`Attribute ${i + 1} value`}
                            aria-invalid={!!rowErr?.value || undefined}
                            maxLength={type === 'text' ? ATTRIBUTE_TEXT_MAX * 2 : 64}
                            spellCheck={type === 'number' ? false : undefined}
                            className={cn(type === 'number' && 'tabular-nums')}
                            {...filterInput(form.register(`attributes.${i}.value`), type === 'number' ? numberChars : asTyped)}
                          />
                        )}
                        <FieldError errors={[rowErr?.value]} className="text-xs" />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-9 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label={`Remove attribute ${i + 1}`}
                        onClick={() => attributes.remove(i)}
                      >
                        <Icon name="trash" size={16} />
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )}
            <datalist id="attribute-keys">
              {ATTRIBUTE_KEY_SUGGESTIONS.map((k) => (
                <option key={k} value={k} />
              ))}
            </datalist>
            <FieldError errors={[errors.attributes?.root, errors.attributes as { message?: string } | undefined]} />
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => attributes.append(emptyAttribute(), { shouldFocus: true })}
                disabled={atMax}
              >
                <Icon name="plus" size={16} data-icon="inline-start" />
                Add attribute
              </Button>
            </div>
          </div>
        </FormSection>

        {submitError && isApiError(submitError) ? (
          <div className="border-t px-5 py-4">
            <div
              role="alert"
              data-testid="form-error"
              className="flex flex-col gap-1 rounded-lg bg-destructive/5 px-4 py-3 text-sm ring-1 ring-destructive/25 ring-inset"
            >
              <span className="font-medium text-destructive">
                {submitError.status === 0
                  ? "Can't reach the server. The product may not have been saved; submit again to retry."
                  : submitError.status === 422
                    ? (unmappedDetails.map((d) => d.msg).join(' ') || submitError.message)
                    : submitError.status === 403
                      ? "Your role can't create products in this brand."
                      : 'The product was not created.'}
              </span>
              <ReferenceId id={submitError.correlationId} />
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-2 rounded-b-xl border-t bg-muted/40 px-5 py-3">
          <Button type="button" variant="ghost" asChild>
            <Link to="/products">Cancel</Link>
          </Button>
          <Button type="submit" disabled={pending} className="flex-1 sm:flex-none" data-testid="create-product">
            {pending ? <Spinner data-icon="inline-start" /> : null}
            {pending ? 'Creating…' : 'Create product'}
          </Button>
        </div>
      </Card>
    </form>
  )
}

/** Key, type, value, remove: shared by the header row and every attribute row at sm and up. */
const ATTR_GRID = 'sm:grid-cols-[minmax(0,1fr)_7.5rem_minmax(0,1.4fr)_2.25rem]'

/** Select triggers match the 36px input height. */
const FIELD_SELECT = 'w-full bg-card data-[size=default]:h-9'

function FormSection({
  title,
  description,
  meta,
  children,
}: {
  title: string
  description?: ReactNode
  meta?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-5 border-t px-5 py-5 first:border-t-0">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-[0.9375rem] leading-snug font-semibold tracking-tight">{title}</h2>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {meta ? <div className="shrink-0 pt-0.5">{meta}</div> : null}
      </div>
      {children}
    </section>
  )
}
