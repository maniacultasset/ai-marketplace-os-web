/**
 * SI12 seller field editors: HSN code, package size and weight, and country of origin. Shared by
 * the guided form and the product editor; rules live in ./seller-fields.ts.
 */
import { fieldHintId, LaField } from '@/components/la'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { chipFor, type ChipProps } from './field-sources'
import { COUNTRIES, countryName, DIM_LABEL, DIMS, packageHasWeight, packageWarnings, type Dim, type PackageDraft } from './seller-fields'
import type { Source } from '@/components/la'

type Errors = Partial<Record<string, string>>

/** HSN: digits only. A suggested value carries the "Suggested" chip until the seller changes it. */
export function HsnField({
  id,
  value,
  onChange,
  onBlur,
  error,
  suggested,
  submitCount,
  source,
  needed,
}: ChipProps & {
  id: string
  value: string
  onChange: (v: string) => void
  onBlur?: () => void
  error?: string
  /** The value shown is the category's suggestion, not saved yet. */
  suggested?: boolean
  submitCount?: number
}) {
  const filled = value.trim() !== ''
  const chip = chipFor(filled, { source: suggested && filled ? { kind: 'suggested' } : source, needed }, false, error)
  return (
    <LaField
      label="HSN code"
      htmlFor={id}
      error={error}
      hint={suggested && filled ? 'From the category. Saving confirms it.' : 'The GST heading on your invoice, 4, 6 or 8 digits.'}
      {...chip}
      submitCount={submitCount}
      confirmFix
    >
      <Input
        id={id}
        name={id}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\s+/g, ''))}
        onBlur={onBlur}
        inputMode="numeric"
        autoComplete="off"
        maxLength={12}
        placeholder="6109"
        className="font-mono tabular-nums"
        aria-invalid={error ? true : undefined}
        aria-describedby={fieldHintId(id)}
      />
    </LaField>
  )
}

function UnitInput({
  id,
  label,
  unit,
  value,
  onChange,
  onBlur,
  invalid,
  describedBy,
  inputMode = 'decimal',
  placeholder,
}: {
  placeholder?: string
  id: string
  label: string
  unit: string
  value: string
  onChange: (v: string) => void
  onBlur?: () => void
  invalid?: boolean
  describedBy: string
  inputMode?: 'decimal' | 'numeric'
}) {
  return (
    <div className="relative min-w-0">
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value.trim())}
        onBlur={onBlur}
        inputMode={inputMode}
        autoComplete="off"
        maxLength={10}
        placeholder={placeholder}
        aria-label={label}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        className="pr-10 text-right tabular-nums"
      />
      <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-small text-ink-2">
        {unit}
      </span>
    </div>
  )
}

/** Client item 15: the two size groups, side by side and never confused. */
const SIZE_KINDS = {
  package: {
    size: 'Packed box: size',
    weight: 'Packed box: weight',
    sizeHint: 'The packed box as you ship it, not the product itself. Length, breadth and height in cm. Amazon uses it for shipping and fees.',
    weightHint: 'The packed box with the product inside, in grams. Amazon uses it for shipping and fees.',
    group: 'Packed box size in cm',
    weightAria: 'Packed box weight in grams',
  },
  item: {
    size: 'Product itself: size',
    weight: 'Product itself: weight',
    sizeHint: 'The product out of its box. Length, breadth and height in cm.',
    weightHint: 'The product on its own, without the box, in grams.',
    group: 'Product size in cm',
    weightAria: 'Product weight in grams',
  },
} as const

/**
 * Package size (length × breadth × height, cm) and weight (g): the packed box as shipped, never the
 * product itself; Amazon needs them for shipping and fees. Errors keyed
 * `package`, `package.length|breadth|height|weight`. With a `category`, a box that looks wrong for
 * it (item 15: "This box weighs 25 kg. Did you mean 25 g?") shows a calm warning under the
 * hint; it never blocks saving (a box past the category's hard limit is an error instead).
 * `kind="item"` is the product itself (item 15 bullet 1): the same inputs, keyed `item.*`, its own
 * labels, and no box warnings.
 */
export function PackageFields({
  id,
  value,
  onChange,
  onBlur,
  errors,
  submitCount,
  source,
  neededSize,
  neededWeight,
  category,
  className,
  kind = 'package',
}: {
  id: string
  value: PackageDraft
  onChange: (v: PackageDraft) => void
  onBlur?: (key: string) => void
  errors: Errors
  submitCount?: number
  /** The saved source, while the values are the saved ones. */
  source?: Source | null
  neededSize?: string
  neededWeight?: string
  /** The product's category, for the plausibility warning. */
  category?: string | null
  className?: string
  /** `package` (the packed box) or `item` (the product itself). */
  kind?: 'package' | 'item'
}) {
  const words = SIZE_KINDS[kind]
  const warn = category === undefined || kind === 'item' ? {} : packageWarnings(value, category)
  const sizeError = errors[kind] ?? DIMS.map((d) => errors[`${kind}.${d}`]).find(Boolean)
  const weightError = errors[`${kind}.weight`]
  const set = (k: Dim | 'weight', v: string) => onChange({ ...value, [k]: v })
  const sizeChip = chipFor(DIMS.some((d) => value[d].trim() !== ''), { source, needed: neededSize }, false, sizeError)
  const weightChip = chipFor(packageHasWeight(value), { source, needed: neededWeight }, false, weightError)
  return (
    <div className={cn('grid gap-x-5 gap-y-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]', className)}>
      <LaField
        label={words.size}
        htmlFor={`${id}-length`}
        error={sizeError}
        hint={<PackageHint text={words.sizeHint} warning={warn.size} />}
        {...sizeChip}
        submitCount={submitCount}
        confirmFix
      >
        <div className="grid grid-cols-3 gap-2" role="group" aria-label={words.group}>
          {DIMS.map((d) => (
            <UnitInput
              key={d}
              id={`${id}-${d}`}
              label={`${DIM_LABEL[d]} in cm`}
              placeholder={DIM_LABEL[d].charAt(0)}
              unit="cm"
              value={value[d]}
              onChange={(v) => set(d, v)}
              onBlur={() => onBlur?.(`${kind}.${d}`)}
              invalid={!!errors[`${kind}.${d}`] || !!errors[kind]}
              describedBy={fieldHintId(`${id}-length`)}
            />
          ))}
        </div>
      </LaField>
      <LaField label={words.weight} htmlFor={`${id}-weight`} error={weightError} hint={<PackageHint text={words.weightHint} warning={warn.weight} />} {...weightChip} submitCount={submitCount} confirmFix>
        <UnitInput
          id={`${id}-weight`}
          label={words.weightAria}
          placeholder="Weight"
          unit="g"
          value={value.weight}
          onChange={(v) => set('weight', v)}
          onBlur={() => onBlur?.(`${kind}.weight`)}
          invalid={!!weightError}
          describedBy={fieldHintId(`${id}-weight`)}
          inputMode="numeric"
        />
      </LaField>
    </div>
  )
}

/** The field hint, and under it a plausibility warning when there is one. */
function PackageHint({ text, warning }: { text: string; warning?: string }) {
  return (
    <>
      <span className="block">{text}</span>
      {warning ? (
        <span className="mt-1 block text-attention-ink" data-package-warning>
          {warning}
        </span>
      ) : null}
    </>
  )
}

const NONE = '__none__'

/** Country of origin: a list, India first. A stored code not in the list still shows. */
export function CountryField({
  id,
  value,
  onChange,
  error,
  submitCount,
  allowClear,
  hint,
  source,
  needed,
}: ChipProps & {
  id: string
  value: string
  onChange: (v: string) => void
  error?: string
  submitCount?: number
  allowClear?: boolean
  hint?: string
}) {
  const v = value.trim().toUpperCase()
  const filled = v !== ''
  const options = filled && !COUNTRIES.some((c) => c.code === v) ? [...COUNTRIES, { code: v, name: countryName(v) }] : COUNTRIES
  return (
    <LaField
      label="Country of origin"
      htmlFor={id}
      error={error}
      hint={hint ?? 'Where it was made, as on the label.'}
      {...chipFor(filled, { source, needed }, false, error)}
      submitCount={submitCount}
      confirmFix
    >
      <Select value={filled ? v : ''} onValueChange={(next) => onChange(next === NONE ? '' : next)}>
        <SelectTrigger id={id} className="w-full" aria-invalid={error ? true : undefined} aria-describedby={fieldHintId(id)} data-testid={id}>
          <SelectValue placeholder="Choose" />
        </SelectTrigger>
        <SelectContent>
          {allowClear && filled ? <SelectItem value={NONE}>Not set</SelectItem> : null}
          {options.map((c) => (
            <SelectItem key={c.code} value={c.code}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </LaField>
  )
}
