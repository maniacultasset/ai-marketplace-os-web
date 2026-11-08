/**
 * SI12 seller field editors: HSN code, package size and weight, and country of origin. Shared by
 * the guided form and the product editor; rules live in ./seller-fields.ts.
 */
import { fieldHintId, LaField } from '@/components/la'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { chipFor, type ChipProps } from './field-sources'
import { COUNTRIES, countryName, DIM_LABEL, DIMS, packageHasWeight, type Dim, type PackageDraft } from './seller-fields'
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

/**
 * Package size (length × breadth × height, cm) and weight (g), as packed for shipping. Errors keyed
 * `package`, `package.length|breadth|height|weight`.
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
  className,
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
  className?: string
}) {
  const sizeError = errors.package ?? DIMS.map((d) => errors[`package.${d}`]).find(Boolean)
  const weightError = errors['package.weight']
  const set = (k: Dim | 'weight', v: string) => onChange({ ...value, [k]: v })
  const sizeChip = chipFor(DIMS.some((d) => value[d].trim() !== ''), { source, needed: neededSize }, false, sizeError)
  const weightChip = chipFor(packageHasWeight(value), { source, needed: neededWeight }, false, weightError)
  return (
    <div className={cn('grid gap-x-5 gap-y-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]', className)}>
      <LaField
        label="Package size"
        htmlFor={`${id}-length`}
        error={sizeError}
        hint="Length, breadth and height of the packed box, in cm."
        {...sizeChip}
        submitCount={submitCount}
        confirmFix
      >
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="Package size in cm">
          {DIMS.map((d) => (
            <UnitInput
              key={d}
              id={`${id}-${d}`}
              label={`${DIM_LABEL[d]} in cm`}
              placeholder={DIM_LABEL[d].charAt(0)}
              unit="cm"
              value={value[d]}
              onChange={(v) => set(d, v)}
              onBlur={() => onBlur?.(`package.${d}`)}
              invalid={!!errors[`package.${d}`] || !!errors.package}
              describedBy={fieldHintId(`${id}-length`)}
            />
          ))}
        </div>
      </LaField>
      <LaField label="Package weight" htmlFor={`${id}-weight`} error={weightError} hint="Packed, in grams." {...weightChip} submitCount={submitCount} confirmFix>
        <UnitInput
          id={`${id}-weight`}
          label="Package weight in grams"
          placeholder="Weight"
          unit="g"
          value={value.weight}
          onChange={(v) => set('weight', v)}
          onBlur={() => onBlur?.('package.weight')}
          invalid={!!weightError}
          describedBy={fieldHintId(`${id}-weight`)}
          inputMode="numeric"
        />
      </LaField>
    </div>
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
