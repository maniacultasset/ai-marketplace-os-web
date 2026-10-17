import { useId, type ReactNode } from 'react'
import { Controller, useFieldArray, useWatch, type UseFormReturn } from 'react-hook-form'
import { Icon } from '@/components/la/icons'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { filterInput } from '@/lib/validation'
import { cn } from '@/lib/utils'
import { ErrorLine } from './error-line'
import { CATEGORY_HINT, MARKETPLACE_LABEL, MARKETPLACES } from './labels'
import { charCount, LIMITS, signedDecimal, type AttrType, type DraftValues } from './listing-form'
import { TagInput } from './tag-input'

type Form = UseFormReturn<DraftValues>

/** Id of the error text under a control; set it as the control's aria-describedby while invalid. */
const errorId = (name: string) => `${name}-error`
const hintId = (name: string) => `${name}-hint`
/** aria-describedby for a control: its error when invalid, else its hint (if any). */
const describedBy = (name: string, error: unknown, hint = false) =>
  error ? errorId(name) : hint ? hintId(name) : undefined

/** Label + control + hint/error, wired with ids for a11y. */
function FieldBox({
  label,
  htmlFor,
  hint,
  error,
  counter,
  children,
  className,
}: {
  label: string
  htmlFor?: string
  hint?: ReactNode
  error?: string
  counter?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('min-w-0', className)} data-invalid={error ? true : undefined}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <Label htmlFor={htmlFor}>{label}</Label>
        {counter}
      </div>
      {children}
      {hint && !error ? (
        <p id={htmlFor ? hintId(htmlFor) : undefined} className="pt-1.5 text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      <ErrorLine
        message={error}
        id={htmlFor ? errorId(htmlFor) : undefined}
        testId={htmlFor ? `error-${htmlFor}` : undefined}
      />
    </div>
  )
}

function Counter({ value, max }: { value: number; max: number }) {
  const over = value > max
  return (
    <span className={cn('text-xs tabular-nums', over ? 'font-medium text-destructive' : 'text-muted-foreground')}>
      {value.toLocaleString()} / {max.toLocaleString()}
    </span>
  )
}

export function TargetSection({ form, categories }: { form: Form; categories: string[] }) {
  const { register, control, formState, setValue } = form
  const e = formState.errors
  const listId = useId()
  return (
    <Card>
      <CardHeader>
        <CardTitle>Target</CardTitle>
        <CardDescription>The marketplace and category decide which rules run.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <FieldBox label="Marketplace" htmlFor="marketplace" error={e.marketplace?.message}>
          <Controller
            control={control}
            name="marketplace"
            render={({ field }) => (
              <Select value={field.value || undefined} onValueChange={field.onChange}>
                <SelectTrigger
                  id="marketplace"
                  ref={field.ref}
                  onBlur={field.onBlur}
                  className="w-full"
                  aria-invalid={!!e.marketplace}
                  aria-describedby={describedBy('marketplace', e.marketplace)}
                >
                  <SelectValue placeholder="Choose a marketplace" />
                </SelectTrigger>
                <SelectContent>
                  {MARKETPLACES.map((m) => (
                    <SelectItem key={m} value={m}>
                      {MARKETPLACE_LABEL[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </FieldBox>
        <FieldBox label="Category" htmlFor="category" error={e.category?.message} hint={CATEGORY_HINT}>
          <Input
            id="category"
            list={listId}
            maxLength={64}
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="off"
            placeholder="e.g. ethnic_wear_kurta_sets"
            className="[&::-webkit-calendar-picker-indicator]:opacity-40"
            aria-invalid={!!e.category}
            aria-describedby={describedBy('category', e.category, true)}
            {...register('category')}
          />
          <datalist id={listId}>
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </FieldBox>
        <FieldBox
          className="sm:col-span-2"
          label="Product ID"
          htmlFor="product_id"
          error={e.product_id?.message}
          hint="Not checked against your catalog in a dry run. Pick a product above to use a real one."
        >
          <div className="flex gap-2">
            <Input
              id="product_id"
              maxLength={36}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              className="font-mono text-xs"
              aria-invalid={!!e.product_id}
              aria-describedby={describedBy('product_id', e.product_id, true)}
              {...register('product_id')}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="New draft ID"
              title="New draft ID"
              onClick={() => setValue('product_id', crypto.randomUUID(), { shouldDirty: true, shouldValidate: true })}
            >
              <Icon name="refresh" size={16} />
            </Button>
          </div>
        </FieldBox>
      </CardContent>
    </Card>
  )
}

export function ContentSection({ form }: { form: Form }) {
  const { register, control, formState } = form
  const e = formState.errors
  const bullets = useFieldArray({ control, name: 'bullets' })
  const title = useWatch({ control, name: 'title' }) ?? ''
  const description = useWatch({ control, name: 'description' }) ?? ''
  const bulletValues = useWatch({ control, name: 'bullets' }) ?? []
  const bulletsRootError = e.bullets?.message ?? e.bullets?.root?.message

  return (
    <Card>
      <CardHeader>
        <CardTitle>Content</CardTitle>
        <CardDescription>What shoppers read. Marketplace rules often set tighter limits than these maximums.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <FieldBox
          label="Title"
          htmlFor="title"
          error={e.title?.message}
          counter={<Counter value={charCount(title)} max={LIMITS.title} />}
        >
          <Input
            id="title"
            autoComplete="off"
            aria-invalid={!!e.title}
            aria-describedby={describedBy('title', e.title)}
            {...register('title')} data-testid="draft-title" />
        </FieldBox>

        <fieldset className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <legend className="text-sm leading-none font-medium">Bullets</legend>
            <span className="text-xs text-muted-foreground tabular-nums">
              {bullets.fields.length} / {LIMITS.bulletsMax}
            </span>
          </div>
          <ol className="space-y-2">
            {bullets.fields.map((f, i) => {
              const err = e.bullets?.[i]?.value?.message
              const len = charCount(bulletValues[i]?.value ?? '')
              return (
                <li key={f.id} className="space-y-1">
                  <div className="flex items-start gap-2">
                    <span className="mt-2 w-5 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                    <Textarea
                      rows={1}
                      autoComplete="off"
                      aria-label={`Bullet ${i + 1}`}
                      aria-invalid={!!err}
                      aria-describedby={describedBy(`bullet-${i}`, err)}
                      className="min-h-9 resize-y py-2"
                      {...register(`bullets.${i}.value`)}
                      data-testid={`draft-bullet-${i}`}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove bullet ${i + 1}`}
                      disabled={bullets.fields.length <= LIMITS.bulletsMin}
                      onClick={() => bullets.remove(i)}
                      className="text-muted-foreground"
                    >
                      <Icon name="trash" size={16} />
                    </Button>
                  </div>
                  <div className="flex items-start justify-between gap-2 pr-10 pl-7">
                    <ErrorLine message={err} id={errorId(`bullet-${i}`)} className="min-w-0 flex-1" />
                    {len > LIMITS.bullet * 0.8 ? <Counter value={len} max={LIMITS.bullet} /> : null}
                  </div>
                </li>
              )
            })}
          </ol>
          <ErrorLine message={bulletsRootError} />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-7"
            disabled={bullets.fields.length >= LIMITS.bulletsMax}
            onClick={() => bullets.append({ value: '' }, { shouldFocus: true })}
          >
            <Icon name="plus" size={16} data-icon="inline-start" />
            Add bullet
          </Button>
        </fieldset>

        <FieldBox
          label="Description"
          htmlFor="description"
          error={e.description?.message}
          counter={<Counter value={charCount(description)} max={LIMITS.description} />}
        >
          <Textarea
            id="description"
            rows={5}
            autoComplete="off"
            aria-invalid={!!e.description}
            aria-describedby={describedBy('description', e.description)}
            {...register('description')}
            data-testid="draft-description"
          />
        </FieldBox>
      </CardContent>
    </Card>
  )
}

export function KeywordsSection({ form }: { form: Form }) {
  const { control, formState } = form
  const e = formState.errors
  const termError = (x: unknown): string | undefined => {
    if (!x || typeof x !== 'object') return undefined
    const o = x as { message?: string; root?: { message?: string } } & Record<number, { message?: string }>
    if (o.message) return o.message
    if (o.root?.message) return o.root.message
    for (const v of Object.values(o)) if (v && typeof v === 'object' && 'message' in v && v.message) return String(v.message)
    return undefined
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Keywords</CardTitle>
        <CardDescription>Press Enter or comma to add a term. Up to {LIMITS.terms} each.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        {(['search_terms', 'hidden_terms'] as const).map((name) => (
          <FieldBox
            key={name}
            label={name === 'search_terms' ? 'Search terms' : 'Hidden terms'}
            htmlFor={name}
            error={termError(e[name])}
          >
            <Controller
              control={control}
              name={name}
              render={({ field }) => (
                <TagInput
                  id={name}
                  name={name}
                  ref={field.ref}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  max={LIMITS.terms}
                  maxLength={LIMITS.term}
                  invalid={!!e[name]}
                  describedBy={describedBy(name, termError(e[name]))}
                  placeholder={name === 'search_terms' ? 'cotton kurta, festive wear' : 'Backend-only terms'}
                />
              )}
            />
          </FieldBox>
        ))}
      </CardContent>
    </Card>
  )
}

const ATTR_TYPES: { value: AttrType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Yes / no' },
  { value: 'list', label: 'List' },
]

export function AttributesSection({ form }: { form: Form }) {
  const { control, register, formState, setValue } = form
  const e = formState.errors
  const attrs = useFieldArray({ control, name: 'attributes' })
  const values = useWatch({ control, name: 'attributes' }) ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle>Attributes</CardTitle>
        <CardDescription>
          Product facts rules check, such as <code className="font-mono text-xs">color</code> or{' '}
          <code className="font-mono text-xs">fabric_type</code>. Keys use a-z, 0-9 and _.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {attrs.fields.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line-strong px-3 py-5 text-center text-[13px] text-ink-2">
            No attributes. Required-attribute rules will report them as missing.
          </p>
        ) : (
          <ul className="space-y-3">
            {attrs.fields.map((f, i) => {
              const type = values[i]?.type ?? f.type
              const ke = e.attributes?.[i]?.key?.message
              const ve = e.attributes?.[i]?.value?.message
              return (
                <li key={f.id} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[minmax(0,10rem)_7.5rem_minmax(0,1fr)_auto]">
                  <div className="col-span-2 min-w-0 sm:col-span-1">
                    <Input
                      aria-label={`Attribute ${i + 1} key`}
                      placeholder="key"
                      maxLength={64}
                      autoComplete="off"
                      spellCheck={false}
                      autoCapitalize="off"
                      className="font-mono text-[13px]"
                      aria-invalid={!!ke}
                      aria-describedby={describedBy(`attr-${i}-key`, ke)}
                      {...register(`attributes.${i}.key`)}
                      data-testid={`attr-key-${i}`}
                    />
                    <ErrorLine message={ke} id={errorId(`attr-${i}-key`)} />
                  </div>
                  <Controller
                    control={control}
                    name={`attributes.${i}.type`}
                    render={({ field }) => (
                      <Select
                        value={field.value}
                        onValueChange={(v) => {
                          field.onChange(v)
                          if (v === 'boolean') setValue(`attributes.${i}.value`, 'true', { shouldValidate: true })
                        }}
                      >
                        <SelectTrigger aria-label={`Attribute ${i + 1} type`} className="w-full" ref={field.ref}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ATTR_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>
                              {t.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <div className="col-span-2 row-start-3 min-w-0 sm:col-span-1 sm:row-start-auto">
                    {type === 'boolean' ? (
                      <Controller
                        control={control}
                        name={`attributes.${i}.value`}
                        render={({ field }) => (
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger
                              aria-label={`Attribute ${i + 1} value`}
                              aria-invalid={!!ve}
                              aria-describedby={describedBy(`attr-${i}-value`, ve)}
                              className="w-full"
                              ref={field.ref}
                            >
                              <SelectValue placeholder="Choose" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="true">Yes (true)</SelectItem>
                              <SelectItem value="false">No (false)</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      />
                    ) : type === 'number' ? (
                      // Keyed by type: the keystroke filter stays with its element, so a row switched
                      // back to text gets a fresh, unfiltered input.
                      <Input
                        key="number"
                        aria-label={`Attribute ${i + 1} value`}
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="0"
                        aria-invalid={!!ve}
                        aria-describedby={describedBy(`attr-${i}-value`, ve)}
                        {...filterInput(register(`attributes.${i}.value`), signedDecimal)}
                        data-testid={`attr-value-${i}`}
                      />
                    ) : (
                      <Input
                        key="text"
                        aria-label={`Attribute ${i + 1} value`}
                        autoComplete="off"
                        placeholder={type === 'list' ? 'comma, separated, values' : 'value'}
                        aria-invalid={!!ve}
                        aria-describedby={describedBy(`attr-${i}-value`, ve)}
                        {...register(`attributes.${i}.value`)}
                        data-testid={`attr-value-${i}`}
                      />
                    )}
                    <ErrorLine message={ve} id={errorId(`attr-${i}-value`)} />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove attribute ${i + 1}`}
                    className="row-start-2 text-muted-foreground sm:row-start-auto"
                    onClick={() => attrs.remove(i)}
                  >
                    <Icon name="trash" size={16} />
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
        <ErrorLine message={e.attributes?.message ?? e.attributes?.root?.message} />
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={attrs.fields.length >= LIMITS.attributes}
            onClick={() => attrs.append({ key: '', type: 'text', value: '' }, { shouldFocus: true })}
            data-testid="add-attribute"
          >
            <Icon name="plus" size={16} data-icon="inline-start" />
            Add attribute
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums">
            {attrs.fields.length} / {LIMITS.attributes}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
