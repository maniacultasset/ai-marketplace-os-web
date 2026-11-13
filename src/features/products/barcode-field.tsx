/**
 * The barcode field, shared by the guided form and the product editor: an explicit choice between
 * "Has a barcode" (a type, EAN, UPC or GTIN, and the digits) and "No barcode". With Amazon chosen,
 * "No barcode" then asks "Has Amazon granted your brand a GTIN exemption?" (client Chrome pass
 * B5): only a yes saves the exemption, and a no says plainly that Amazon will not create the
 * listing without one, next to how to apply. On a style only the barcodes-or-exemption choice
 * shows, since each variant carries its own barcode and the style's exemption reaches every
 * variant without one.
 *
 * `amazon`: Amazon is one of the marketplaces chosen for this product. Amazon refuses to create a
 * listing with neither a barcode nor an exemption (backend adapters/amazon/mapping.py
 * `_identifier`, IDENTIFIER_MISSING), so the label says "Needed for Amazon" from the first visit.
 * Saving never needs a barcode (./barcode.ts), so this is a mark, never an error.
 *
 * Controlled and stateless about rules: the caller passes the draft and the `barcode` error.
 */
import { useId, useState, type ReactNode } from 'react'
import { fieldHintId, LaField } from '@/components/la'
import { cn } from '@/lib/utils'
import { chipFor, type ChipProps } from './field-sources'
import { GtinExemptionHelp } from './gtin-exemption'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { BARCODE_LABEL, BARCODE_TYPES, barcodeHint, EXEMPTION_QUESTION, normalizeBarcode, type BarcodeChoiceValue, type BarcodeDraft, type BarcodeLevel, type BarcodeType } from './barcode'

const HAS_BARCODE = { item: 'Has a barcode', style: 'Variants have barcodes' } as const
const NO_BARCODE = { item: 'No barcode', style: 'No barcodes' } as const

/** One quiet option row of a native radio group (arrow keys and one Tab stop for free). */
function OptionRow({ name, on, onPick, inputId, testId, describedBy, children }: { name: string; on: boolean; onPick: () => void; inputId: string; testId: string; describedBy?: string; children: ReactNode }) {
  return (
    <label
      className={cn(
        'flex min-h-10 cursor-pointer items-center gap-2.5 rounded-control border px-3 py-2 text-small transition-[color,background-color,border-color,box-shadow] duration-150 has-[:focus-visible]:border-brand has-[:focus-visible]:shadow-[var(--focus-ring)] motion-reduce:transition-none',
        on ? 'border-brand-line bg-brand-bg text-ink shadow-selected-inset' : 'border-line-strong bg-surface text-ink-2 shadow-raised-sm hover:border-edge-hover hover:text-ink',
      )}
    >
      <input id={inputId} type="radio" name={name} className="sr-only" checked={on} onChange={onPick} aria-describedby={describedBy} data-testid={testId} />
      {/* The dot: brand ring when chosen, an inset hollow when not. */}
      <span aria-hidden className={cn('size-4 shrink-0 rounded-full border', on ? 'border-[5px] border-brand bg-surface' : 'border-line-strong bg-field shadow-inset-sm')} />
      <span className={cn('min-w-0', on && 'font-semibold')}>{children}</span>
    </label>
  )
}

/**
 * The choice, also used on the variants page: "Has a barcode" or "No barcode", then (Amazon only,
 * after "No barcode") the exemption question, Yes or No. Choosing "No barcode" never answers it:
 * neither answer shows until the seller picks one, and no answer saves no exemption.
 */
export function BarcodeChoice({
  id,
  none,
  exempt,
  onChange,
  level = 'item',
  label = 'Barcode',
  describedBy,
  className,
  testId,
  amazon = true,
}: {
  id: string
  none: boolean
  exempt: boolean
  onChange: (v: BarcodeChoiceValue) => void
  level?: BarcodeLevel
  /** The group's accessible name. */
  label?: string
  describedBy?: string
  className?: string
  testId?: string
  /** Amazon is a chosen marketplace: "No barcode" asks about its GTIN exemption. */
  amazon?: boolean
}) {
  const name = useId()
  const answerName = useId()
  const tid = testId ?? id
  const isNone = none || exempt
  // A "no" is only shown once picked: "No barcode" alone leaves the question open.
  const [saidNo, setSaidNo] = useState(false)
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div id={`${id}-choice`} role="radiogroup" aria-label={label} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap" data-testid={`${tid}-choice`}>
        <OptionRow name={name} on={!isNone} onPick={() => onChange({ none: false, exempt: false })} inputId={`${id}-has`} testId={`${tid}-has`} describedBy={describedBy}>
          {HAS_BARCODE[level]}
        </OptionRow>
        <OptionRow
          name={name}
          on={isNone}
          onPick={() => {
            setSaidNo(false)
            onChange({ none: true, exempt: false })
          }}
          inputId={`${id}-none`}
          testId={`${tid}-none`}
          describedBy={describedBy}
        >
          {NO_BARCODE[level]}
        </OptionRow>
      </div>
      {amazon && isNone ? (
        <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0" data-testid={`${tid}-exemption-question`}>
          <legend className="mb-2 p-0 text-small font-semibold text-ink">{EXEMPTION_QUESTION}</legend>
          <div role="radiogroup" aria-label={EXEMPTION_QUESTION} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <OptionRow name={answerName} on={exempt} onPick={() => onChange({ none: true, exempt: true })} inputId={`${id}-exempt`} testId={`${tid}-exempt`} describedBy={describedBy}>
              Yes, it is approved
            </OptionRow>
            <OptionRow
              name={answerName}
              on={!exempt && saidNo}
              onPick={() => {
                setSaidNo(true)
                onChange({ none: true, exempt: false })
              }}
              inputId={`${id}-not-exempt`}
              testId={`${tid}-not-exempt`}
              describedBy={describedBy}
            >
              No
            </OptionRow>
          </div>
        </fieldset>
      ) : null}
    </div>
  )
}

export function BarcodeField({
  id,
  value,
  onChange,
  onBlur,
  error,
  submitCount,
  level = 'item',
  className,
  source,
  needed,
  amazon = false,
}: ChipProps & {
  id: string
  value: BarcodeDraft
  onChange: (v: BarcodeDraft) => void
  onBlur?: () => void
  error?: string
  submitCount?: number
  level?: BarcodeLevel
  className?: string
  /** Amazon is a chosen marketplace: "Needed for Amazon" beside the label from the start. */
  amazon?: boolean
}) {
  const valueId = `${id}-value`
  // With no digits, the label points at the choice group (never at one radio: it would rename it).
  const choiceId = `${id}-choice`
  const style = level === 'style'
  const isNone = value.none || value.exempt
  const showDigits = !style && !isNone
  // Filled is what Amazon takes: a barcode or a confirmed exemption ("No barcode" alone is not).
  const filled = value.exempt || (!amazon && isNone) || (!style && !isNone && normalizeBarcode(value.value) !== '')
  const hint = barcodeHint({ none: value.none, exempt: value.exempt, style, amazon })
  const labelFor = showDigits ? valueId : choiceId
  // The mark already says who needs it: the "Amazon needs this" chip would say it twice.
  const chip = chipFor(filled, { source, needed: amazon ? undefined : needed }, false, error)
  return (
    <LaField
      label="Barcode"
      htmlFor={labelFor}
      hint={hint}
      error={error}
      required={amazon ? 'Needed for Amazon' : undefined}
      {...chip}
      submitCount={submitCount}
      confirmFix
      className={className}
    >
      <div className="flex flex-col gap-3" data-testid={`${id}-field`} data-barcode-field>
        <BarcodeChoice
          id={id}
          level={level}
          amazon={amazon}
          none={value.none}
          exempt={value.exempt}
          describedBy={showDigits ? undefined : fieldHintId(choiceId)}
          onChange={({ none, exempt }) => {
            onChange(style ? { ...value, none, exempt, touched: true } : { ...value, none, exempt })
            onBlur?.()
          }}
        />
        {showDigits ? (
          <div className="flex min-w-0 gap-2">
            <Select
              value={value.type}
              onValueChange={(type) => {
                onChange({ ...value, type: type as BarcodeType })
                onBlur?.()
              }}
            >
              <SelectTrigger id={`${id}-type`} className="w-24 shrink-0" aria-label="Barcode type">
                <SelectValue>{BARCODE_LABEL[value.type]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {BARCODE_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              id={valueId}
              name={valueId}
              value={value.value}
              onChange={(e) => onChange({ ...value, value: e.target.value })}
              onBlur={onBlur}
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              placeholder={value.type === 'upc' ? '12 digits' : value.type === 'ean' ? '8 or 13 digits' : '8 to 14 digits'}
              maxLength={24}
              className="min-w-0 flex-1 font-mono tabular-nums"
              aria-invalid={error ? true : undefined}
              aria-describedby={fieldHintId(valueId)}
            />
          </div>
        ) : null}
        {/* Amazon only: where to apply, next to the exemption choice. */}
        {amazon ? <GtinExemptionHelp testId={`${id}-exemption-help`} /> : null}
      </div>
    </LaField>
  )
}
