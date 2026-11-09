/**
 * Field editors for the seller's V1 inputs, shared by the guided form (create) and the product
 * detail editor (PATCH): text, money, pick-list with "Other", fabric composition builder, size
 * chart table and the manufacturer address. They are controlled and stateless about rules: the
 * caller passes the values and the keyed errors from `intake-model` / `guided-model`.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { fieldHintId, Icon, LaField, Segmented } from '@/components/la'
import { chipFor, type ChipProps } from './field-sources'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  COMMON_SIZES,
  compositionTotal,
  emptySizeRow,
  formatTenths,
  IN_STATES,
  MAX_FIBRES,
  MAX_SIZE_ROWS,
  MEASURE_LABEL,
  MEASURES,
  measuresInUse,
  unitPending,
  withUnit,
  type FibreRow,
  type Measure,
  type PartyDraft,
  type PartyField,
  type SizeChartDraft,
} from './intake-model'

type Errors = Partial<Record<string, string>>

/* -------------------------------------------------------------------------------------- Text */

export function TextField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  critical,
  placeholder,
  list,
  autoFocus,
  onBlur,
  submitCount,
  maxLength,
  code,
  inputMode,
  autoComplete = 'off',
  className,
  source,
  needed,
}: ChipProps & {
  id: string
  label: ReactNode
  value: string
  onChange: (v: string) => void
  error?: string
  hint?: ReactNode
  critical?: boolean
  placeholder?: string
  list?: string
  autoFocus?: boolean
  onBlur?: () => void
  submitCount?: number
  /** Generous on purpose: the error explains the limit instead of silently cutting the paste. */
  maxLength?: number
  /** A code (SKU, category slug): no spell check or auto-capitalisation. */
  code?: boolean
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']
  autoComplete?: string
  className?: string
}) {
  const filled = value.trim() !== ''
  return (
    <LaField
      label={label}
      htmlFor={id}
      error={error}
      hint={hint}
      critical={critical}
      {...chipFor(filled, { source, needed }, critical, error)}
      submitCount={submitCount}
      confirmFix
      className={className}
    >
      <Input
        id={id}
        name={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        maxLength={maxLength}
        spellCheck={code ? false : undefined}
        autoCapitalize={code ? 'none' : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={fieldHintId(id)}
        placeholder={placeholder}
        list={list}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        inputMode={inputMode}
      />
    </LaField>
  )
}

/* ------------------------------------------------------------------------------------- Money */

export function MoneyField({
  id,
  label,
  value,
  onChange,
  onBlur,
  error,
  hint,
  critical,
  submitCount,
  source,
  needed,
}: ChipProps & {
  id: string
  label: ReactNode
  value: string
  onChange: (v: string) => void
  onBlur?: () => void
  error?: string
  hint?: ReactNode
  critical?: boolean
  submitCount?: number
}) {
  const filled = value.trim() !== ''
  return (
    <LaField
      label={label}
      htmlFor={id}
      error={error}
      hint={hint}
      critical={critical}
      {...chipFor(filled, { source, needed }, critical, error)}
      submitCount={submitCount}
      confirmFix
    >
      <div className="relative">
        <span aria-hidden className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-body text-ink-2">
          ₹
        </span>
        <Input
          id={id}
          name={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          maxLength={24}
          className="pl-7 tabular-nums"
          aria-invalid={error ? true : undefined}
          aria-describedby={fieldHintId(id)}
        />
      </div>
    </LaField>
  )
}

/* ------------------------------------------------------------------------- Pick-list + Other */

const OTHER = '__other__'

/**
 * A pick-list of suggestions with "Other", which opens a text box for the seller's own words.
 * The value is always plain text: a listed value, or what was typed.
 */
export function PickOrOtherField({
  id,
  label,
  value,
  onChange,
  onBlur,
  options,
  error,
  hint,
  critical,
  submitCount,
  otherPlaceholder,
  source,
  needed,
}: ChipProps & {
  id: string
  label: ReactNode
  value: string
  onChange: (v: string) => void
  onBlur?: () => void
  options: readonly string[]
  error?: string
  hint?: ReactNode
  critical?: boolean
  submitCount?: number
  otherPlaceholder?: string
}) {
  const listed = options.find((o) => o.toLocaleLowerCase('en') === value.trim().toLocaleLowerCase('en'))
  const [other, setOther] = useState(() => value.trim() !== '' && !listed)
  const showOther = other || (value.trim() !== '' && !listed)
  const filled = value.trim() !== ''
  const otherId = `${id}-other`
  return (
    <LaField
      label={label}
      htmlFor={showOther ? otherId : id}
      error={error}
      hint={hint}
      critical={critical}
      {...chipFor(filled, { source, needed }, critical, error)}
      submitCount={submitCount}
      confirmFix
    >
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
        <Select
          value={showOther ? OTHER : (listed ?? '')}
          onValueChange={(v) => {
            if (v === OTHER) {
              setOther(true)
              if (listed) onChange('')
            } else {
              setOther(false)
              onChange(v)
            }
            onBlur?.()
          }}
        >
          <SelectTrigger
            id={id}
            className={cn('w-full', showOther && 'sm:w-36 sm:shrink-0')}
            aria-invalid={error && !showOther ? true : undefined}
            aria-describedby={fieldHintId(showOther ? otherId : id)}
          >
            <SelectValue placeholder="Choose" />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
            <SelectItem value={OTHER}>Other…</SelectItem>
          </SelectContent>
        </Select>
        {showOther ? (
          <Input
            id={otherId}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            placeholder={otherPlaceholder ?? 'Type it'}
            maxLength={2000 * 2}
            autoComplete="off"
            aria-label={typeof label === 'string' ? `${label}, your own words` : undefined}
            aria-invalid={error ? true : undefined}
            aria-describedby={fieldHintId(otherId)}
            autoFocus={other && !value}
          />
        ) : null}
      </div>
    </LaField>
  )
}

/* ------------------------------------------------------------------------------- Composition */

const FIBRE_SUGGESTIONS = ['Cotton', 'Polyester', 'Elastane', 'Spandex', 'Lycra', 'Viscose', 'Rayon', 'Modal', 'Linen', 'Silk', 'Nylon', 'Wool', 'Acrylic', 'Lyocell']

/**
 * Fabric composition as rows of fibre + percent, with a live total that must reach 100%.
 * Errors: `composition.rows.<i>.fibre|percent` and the whole value at `total`.
 */
export function CompositionEditor({
  id,
  rows,
  onChange,
  errors,
  totalError,
  onBlur,
  submitCount,
  critical = true,
  source,
}: Pick<ChipProps, 'source'> & {
  id: string
  rows: readonly FibreRow[]
  onChange: (rows: FibreRow[]) => void
  /** Keyed `rows.<i>.fibre` / `rows.<i>.percent`. */
  errors: Errors
  totalError?: string
  onBlur?: (key: string) => void
  submitCount?: number
  critical?: boolean
}) {
  const listId = `${id}-fibres`
  const shown = rows.length ? rows : [{ fibre: '', percent: '' }]
  /** After "Add fibre", the new row's fibre input takes focus once it has rendered. */
  const focusRow = useRef<number | null>(null)
  useEffect(() => {
    if (focusRow.current === null) return
    document.getElementById(`${id}-${focusRow.current}-fibre`)?.focus()
    focusRow.current = null
  })
  const total = compositionTotal(rows)
  const filled = rows.some((r) => r.fibre.trim() || r.percent.trim())
  const set = (i: number, patch: Partial<FibreRow>) => onChange(shown.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const remove = (i: number) => onChange(shown.filter((_, j) => j !== i))
  const pct = Math.min(total, 1000) / 10
  const tone = total === 1000 ? 'ok' : total > 1000 ? 'over' : 'under'
  return (
    <LaField
      label="Fabric composition"
      htmlFor={`${id}-0-fibre`}
      error={totalError}
      hint={filled ? undefined : 'Each fibre and its percent, as on the label. Never guessed.'}
      critical={critical}
      {...chipFor(filled, { source }, critical, totalError)}
      submitCount={submitCount}
      confirmFix
    >
      <div className="flex flex-col gap-2" role="group" aria-label="Fibres">
        {shown.map((r, i) => {
          const fe = errors[`rows.${i}.fibre`]
          const pe = errors[`rows.${i}.percent`]
          return (
            <div key={i} className="flex flex-col gap-1">
              <div className="flex items-start gap-2">
                <Input
                  id={`${id}-${i}-fibre`}
                  value={r.fibre}
                  onChange={(e) => set(i, { fibre: e.target.value })}
                  onBlur={() => onBlur?.(`composition.rows.${i}.fibre`)}
                  placeholder={i === 0 ? 'Cotton' : 'Fibre'}
                  list={listId}
                  autoComplete="off"
                  maxLength={120}
                  className="min-w-0 flex-1"
                  aria-label={`Fibre ${i + 1}`}
                  aria-invalid={fe ? true : undefined}
                />
                <div className="relative w-24 shrink-0">
                  <Input
                    value={r.percent}
                    onChange={(e) => set(i, { percent: e.target.value })}
                    onBlur={() => onBlur?.(`composition.rows.${i}.percent`)}
                    inputMode="decimal"
                    placeholder={i === 0 ? '100' : '0'}
                    autoComplete="off"
                    maxLength={8}
                    className="pr-7 text-right tabular-nums"
                    aria-label={`Percent of fibre ${i + 1}`}
                    aria-invalid={pe ? true : undefined}
                  />
                  <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-body text-ink-2">
                    %
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  aria-label={`Remove fibre ${i + 1}`}
                  disabled={shown.length === 1 && !r.fibre && !r.percent}
                  onClick={() => remove(i)}
                >
                  <Icon name="x" size={16} />
                </Button>
              </div>
              {fe || pe ? (
                <p className="text-caption text-danger" role="alert">
                  {[fe, pe].filter(Boolean).join(' ')}
                </p>
              ) : null}
            </div>
          )
        })}
        <datalist id={listId}>
          {FIBRE_SUGGESTIONS.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-2"
            disabled={shown.length >= MAX_FIBRES}
            onClick={() => {
              focusRow.current = shown.length
              onChange([...shown, { fibre: '', percent: total < 1000 ? formatTenths(1000 - total) : '' }])
            }}
          >
            <Icon name="plus" size={16} />
            Add fibre
          </Button>
          {filled ? (
            <div className="flex min-w-40 flex-1 items-center justify-end gap-2.5 sm:flex-none" aria-live="polite">
              <span className="h-1.5 w-24 overflow-hidden rounded-full inset-track" aria-hidden>
                <span
                  className={cn(
                    'block h-full rounded-full motion-safe:transition-[width] motion-safe:duration-300',
                    tone === 'ok' ? 'bg-success' : tone === 'over' ? 'bg-danger' : 'bg-attention',
                  )}
                  style={{ width: `${pct}%` }}
                />
              </span>
              <span className={cn('text-small font-semibold tabular-nums', tone === 'ok' ? 'text-success-ink' : tone === 'over' ? 'text-danger' : 'text-ink-2')}>
                {formatTenths(total)}% of 100%
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </LaField>
  )
}

/* -------------------------------------------------------------------------------- Size chart */

const UNIT_WORD = { cm: 'cm', in: 'inches' } as const

/**
 * The garment or body measurements per size. Unit and basis are toggles; measurement columns
 * can be added; common sizes are one tap. On a phone the table scrolls sideways inside its box.
 * Rows read from a size-chart photo (SI12) need the seller's unit: none is selected when the read
 * found no unit it could check, and a read unit is pre-selected next to the line it was read from
 * until the seller confirms it. Errors: `size_chart`, `size_chart.unit` and
 * `size_chart.rows.<i>.<size|measure>`.
 */
export function SizeChartEditor({
  id,
  value,
  onChange,
  errors,
  onBlur,
}: {
  id: string
  value: SizeChartDraft
  onChange: (v: SizeChartDraft) => void
  errors: Errors
  onBlur?: (key: string) => void
}) {
  const [extra, setExtra] = useState<Measure[]>([])
  const cols = measuresInUse(value, extra)
  const have = new Set(value.rows.map((r) => r.size.trim().toLocaleLowerCase('en')))
  const setRow = (i: number, patch: Partial<SizeChartDraft['rows'][number]>) =>
    onChange({ ...value, rows: value.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) })
  const addSizes = (sizes: readonly string[]) =>
    onChange({ ...value, rows: [...value.rows, ...sizes.map((s) => emptySizeRow(s))].slice(0, MAX_SIZE_ROWS) })
  const rowErrors = (i: number) =>
    ['size', ...MEASURES].map((f) => errors[`size_chart.rows.${i}.${f}`]).filter((x): x is string => !!x)
  const titleId = useId()
  const unitNoteId = useId()
  const pending = unitPending(value)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="flex flex-wrap items-center gap-2" aria-describedby={pending ? unitNoteId : undefined}>
          <span className="text-small font-bold text-ink">
            Unit
            {pending === 'choose' ? <span className="sr-only"> (required)</span> : null}
          </span>
          <Segmented
            label={pending === 'choose' ? 'Unit, required' : 'Unit'}
            value={value.unit}
            onChange={(unit) => onChange(withUnit(value, unit))}
            options={[
              { value: 'in', label: 'Inches' },
              { value: 'cm', label: 'cm' },
            ]}
          />
          {pending === 'confirm' && value.unit ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => onChange(withUnit(value, value.unit!))} data-testid="size-chart-unit-confirm">
              <Icon name="check" size={16} />
              Confirm {UNIT_WORD[value.unit]}
            </Button>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-small font-bold text-ink">Measured on</span>
          <Segmented
            label="Measured on"
            value={value.basis}
            onChange={(basis) => onChange({ ...value, basis })}
            options={[
              { value: 'garment', label: 'Garment' },
              { value: 'body', label: 'Body' },
            ]}
          />
        </div>
      </div>

      {pending ? (
        <p id={unitNoteId} className="-mt-1 flex items-start gap-1.5 text-caption text-ink-2" data-testid="size-chart-unit-note">
          <Icon name="info" size={14} className="mt-[calc((1lh-14px)/2)] shrink-0" />
          {pending === 'choose' ? (
            <span>We couldn’t check the unit on your photo. Choose the unit printed on your size chart before you save.</span>
          ) : value.unitCheck?.line ? (
            <span className="min-w-0 break-words">
              Read from: <q className="font-semibold text-ink">{value.unitCheck.line}</q>. Check it matches your chart, then confirm the unit.
            </span>
          ) : (
            <span>Check the unit matches your size chart, then confirm it.</span>
          )}
        </p>
      ) : null}
      {errors['size_chart.unit'] ? (
        <p className="-mt-1 text-caption text-danger" role="alert">
          {errors['size_chart.unit']}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <p className="text-small font-bold text-ink">Add sizes</p>
        <div className="flex flex-wrap gap-1.5">
          {COMMON_SIZES.map((s) => (
            <Button
              key={s}
              type="button"
              variant="secondary"
              size="sm"
              className="min-w-11"
              disabled={have.has(s.toLocaleLowerCase('en')) || value.rows.length >= MAX_SIZE_ROWS}
              onClick={() => addSizes([s])}
            >
              {s}
            </Button>
          ))}
          <Button type="button" variant="ghost" size="sm" disabled={value.rows.length >= MAX_SIZE_ROWS} onClick={() => addSizes([''])}>
            <Icon name="plus" size={16} />
            Other size
          </Button>
        </div>
      </div>

      {value.rows.length ? (
        <div className="flex flex-col gap-2">
          <div className="max-w-full overflow-x-auto rounded-card border border-line bg-surface shadow-raised-sm">
            <table className="w-full min-w-max text-small" aria-labelledby={titleId}>
              <caption id={titleId} className="sr-only">
                Size chart in {value.unit === 'in' ? 'inches' : value.unit === 'cm' ? 'centimetres' : 'a unit not chosen yet'}, measured on the {value.basis}
              </caption>
              <thead>
                <tr className="bg-sunken text-left text-caption text-ink-2">
                  <th scope="col" className="sticky left-0 z-10 bg-sunken px-3 py-2 font-semibold">
                    Size
                  </th>
                  {cols.map((m) => (
                    <th key={m} scope="col" className="px-2 py-2 font-semibold">
                      {MEASURE_LABEL[m]}
                    </th>
                  ))}
                  <th scope="col" className="w-10 px-1 py-2">
                    <span className="sr-only">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {value.rows.map((r, i) => (
                  <tr key={i} className="border-t border-line">
                    <th scope="row" className="sticky left-0 z-10 bg-surface px-2 py-1.5 font-normal">
                      <Input
                        id={i === 0 ? `${id}-size-0` : undefined}
                        value={r.size}
                        onChange={(e) => setRow(i, { size: e.target.value })}
                        onBlur={() => onBlur?.(`size_chart.rows.${i}.size`)}
                        aria-label={`Size ${i + 1}`}
                        aria-invalid={errors[`size_chart.rows.${i}.size`] ? true : undefined}
                        placeholder="Size"
                        maxLength={40}
                        autoComplete="off"
                        className="h-9 w-20 font-semibold"
                      />
                    </th>
                    {cols.map((m) => (
                      <td key={m} className="px-1 py-1.5">
                        <Input
                          value={r[m]}
                          onChange={(e) => setRow(i, { [m]: e.target.value })}
                          onBlur={() => onBlur?.(`size_chart.rows.${i}.${m}`)}
                          inputMode="decimal"
                          aria-label={`${MEASURE_LABEL[m]}, size ${r.size || i + 1}`}
                          aria-invalid={errors[`size_chart.rows.${i}.${m}`] ? true : undefined}
                          maxLength={8}
                          autoComplete="off"
                          className="h-9 w-[4.5rem] text-right tabular-nums"
                        />
                      </td>
                    ))}
                    <td className="px-1 py-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove size ${r.size || i + 1}`}
                        onClick={() => onChange({ ...value, rows: value.rows.filter((_, j) => j !== i) })}
                      >
                        <Icon name="x" size={16} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {value.rows.map((_, i) => {
            const list = rowErrors(i)
            return list.length ? (
              <p key={i} className="text-caption text-danger" role="alert">
                Row {i + 1}: {list.join(' ')}
              </p>
            ) : null
          })}
          {errors.size_chart ? (
            <p className="text-caption text-danger" role="alert">
              {errors.size_chart}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-caption text-ink-3">More measurements:</span>
            {MEASURES.filter((m) => !cols.includes(m)).map((m) => (
              <Button key={m} type="button" variant="ghost" size="xs" onClick={() => setExtra((x) => [...x, m])}>
                <Icon name="plus" size={14} />
                {MEASURE_LABEL[m]}
              </Button>
            ))}
            {cols.length === MEASURES.length ? <span className="text-caption text-ink-3">all shown</span> : null}
          </div>
        </div>
      ) : (
        <p className="text-small text-ink-2">No sizes yet. Tap a size above to start the chart.</p>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------------------------- Party */

const PARTY_LABEL: Record<PartyField, string> = {
  legal_name: 'Legal name',
  address_line1: 'Address',
  address_line2: 'Address line 2',
  city: 'City',
  state_code: 'State',
  postal_code: 'PIN code',
  gstin: 'GSTIN',
}

/** A manufacturer (or any business party) address in India. Errors keyed by party field. */
export function PartyFields({
  id,
  value,
  onChange,
  errors,
  onBlur,
  submitCount,
  disabled,
}: {
  id: string
  value: PartyDraft
  onChange: (v: PartyDraft) => void
  errors: Partial<Record<PartyField, string>>
  onBlur?: (field: PartyField) => void
  submitCount?: number
  disabled?: boolean
}) {
  const field = (k: PartyField, props: Partial<React.ComponentProps<typeof Input>> = {}, hint?: string, className?: string) => (
    <LaField label={PARTY_LABEL[k]} htmlFor={`${id}-${k}`} error={errors[k]} hint={hint} submitCount={submitCount} confirmFix className={className}>
      <Input
        id={`${id}-${k}`}
        value={value[k]}
        onChange={(e) => onChange({ ...value, [k]: e.target.value })}
        onBlur={() => onBlur?.(k)}
        aria-invalid={errors[k] ? true : undefined}
        aria-describedby={fieldHintId(`${id}-${k}`)}
        disabled={disabled}
        {...props}
      />
    </LaField>
  )
  return (
    <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
      {field('legal_name', { autoComplete: 'organization', maxLength: 600 }, 'As registered, for the label and the marketplace.', 'md:col-span-2')}
      {field('address_line1', { autoComplete: 'address-line1', maxLength: 600 }, undefined, 'md:col-span-2')}
      {field('address_line2', { autoComplete: 'address-line2', maxLength: 600 }, 'Optional.', 'md:col-span-2')}
      {field('city', { autoComplete: 'address-level2', maxLength: 200 })}
      <LaField label={PARTY_LABEL.state_code} htmlFor={`${id}-state_code`} error={errors.state_code} submitCount={submitCount} confirmFix>
        <Select
          value={value.state_code}
          onValueChange={(state_code) => {
            onChange({ ...value, state_code })
            onBlur?.('state_code')
          }}
          disabled={disabled}
        >
          <SelectTrigger
            id={`${id}-state_code`}
            className="w-full"
            aria-invalid={errors.state_code ? true : undefined}
            aria-describedby={fieldHintId(`${id}-state_code`)}
          >
            <SelectValue placeholder="Choose the state" />
          </SelectTrigger>
          <SelectContent>
            {IN_STATES.map((s) => (
              <SelectItem key={s.code} value={s.code}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </LaField>
      {field('postal_code', { inputMode: 'numeric', autoComplete: 'postal-code', maxLength: 8, className: 'tabular-nums' })}
      {field('gstin', { autoCapitalize: 'characters', spellCheck: false, maxLength: 20, className: 'font-mono uppercase' }, 'Optional. 15 characters.')}
    </div>
  )
}
