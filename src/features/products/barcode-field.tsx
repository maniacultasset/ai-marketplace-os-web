/**
 * The barcode field, shared by the guided form and the product editor: an explicit choice between
 * "Has a barcode" (a type, EAN, UPC or GTIN, and the digits) and "No barcode: my brand has an
 * Amazon GTIN exemption" (just "No barcode" when Amazon is not chosen). On a style only the exemption choice shows, since each variant carries
 * its own barcode and the style's exemption reaches every variant without one.
 *
 * `amazon`: Amazon is one of the marketplaces chosen for this product. Amazon refuses to create a
 * listing with neither a barcode nor an exemption (backend adapters/amazon/mapping.py
 * `_identifier`, IDENTIFIER_MISSING), so the label says "Needed for Amazon" from the first visit.
 * Saving never needs a barcode (./barcode.ts), so this is a mark, never an error.
 *
 * Controlled and stateless about rules: the caller passes the draft and the `barcode` error.
 */
import { useId, type ReactNode } from 'react'
import { fieldHintId, LaField } from '@/components/la'
import { cn } from '@/lib/utils'
import { chipFor, type ChipProps } from './field-sources'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { BARCODE_LABEL, BARCODE_TYPES, normalizeBarcode, type BarcodeDraft, type BarcodeLevel, type BarcodeType } from './barcode'

/** The formats Amazon and Flipkart take, in seller words. */
export const BARCODE_FORMATS = 'GTIN-8, 12, 13 or 14: an EAN, UPC or GTIN from the pack.'
/** One line on how exemptions work (Amazon's Brand Registry exemption, per brand and category). */
export const EXEMPT_EXPLAINER = 'Amazon approves GTIN exemptions per brand and category. Choose this only if yours is approved.'

const ITEM_HINT = BARCODE_FORMATS
const ITEM_HINT_AMAZON = `${BARCODE_FORMATS} Amazon needs one to create the listing.`
const STYLE_HINT = 'Each variant has its own barcode. Add them on each variant, or choose the exemption for every variant without one.'
const STYLE_HINT_PLAIN = 'Each variant has its own barcode. Add them on each variant, or choose no barcodes for every variant without one.'
const STYLE_EXEMPT_HINT = `Every variant without a barcode is marked exempt. ${EXEMPT_EXPLAINER}`
/** Without Amazon the exemption is just "no barcode": no marketplace rule to explain. */
const ITEM_EXEMPT_PLAIN = 'Saved without a barcode.'
const STYLE_EXEMPT_PLAIN = 'Every variant without a barcode is saved without one.'

const HAS_BARCODE = { item: 'Has a barcode', style: 'Variants have barcodes' } as const
const NO_BARCODE = { item: 'No barcode: my brand has an Amazon GTIN exemption', style: 'No barcodes: my brand has an Amazon GTIN exemption' } as const
const NO_BARCODE_PLAIN = { item: 'No barcode', style: 'No barcodes' } as const

/** The field's hint: Amazon's rule only when Amazon is a chosen marketplace. */
function barcodeHint({ exempt, style, amazon }: { exempt: boolean; style: boolean; amazon: boolean }): string {
  if (exempt) return style ? (amazon ? STYLE_EXEMPT_HINT : STYLE_EXEMPT_PLAIN) : amazon ? EXEMPT_EXPLAINER : ITEM_EXEMPT_PLAIN
  if (style) return amazon ? STYLE_HINT : STYLE_HINT_PLAIN
  return amazon ? ITEM_HINT_AMAZON : ITEM_HINT
}

/**
 * The two-way choice, also used on the variants page: a native radio pair (arrow keys and one
 * Tab stop for free), drawn as quiet option rows. `exempt` is the second option.
 */
export function BarcodeChoice({
  id,
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
  exempt: boolean
  onChange: (exempt: boolean) => void
  level?: BarcodeLevel
  /** The group's accessible name. */
  label?: string
  describedBy?: string
  className?: string
  testId?: string
  /** Amazon is a chosen marketplace: the second option names its GTIN exemption. */
  amazon?: boolean
}) {
  const name = useId()
  const option = (value: boolean, text: ReactNode, inputId: string) => {
    const on = exempt === value
    return (
      <label
        className={cn(
          'flex min-h-10 cursor-pointer items-center gap-2.5 rounded-control border px-3 py-2 text-small transition-[color,background-color,border-color,box-shadow] duration-150 has-[:focus-visible]:border-brand has-[:focus-visible]:shadow-[var(--focus-ring)] motion-reduce:transition-none',
          on ? 'border-brand-line bg-brand-bg text-ink shadow-selected-inset' : 'border-line-strong bg-surface text-ink-2 shadow-raised-sm hover:border-edge-hover hover:text-ink',
        )}
      >
        <input
          id={inputId}
          type="radio"
          name={name}
          className="sr-only"
          checked={on}
          onChange={() => onChange(value)}
          aria-describedby={describedBy}
          data-testid={value ? `${testId ?? id}-exempt` : `${testId ?? id}-has`}
        />
        {/* The dot: brand ring when chosen, an inset hollow when not. */}
        <span
          aria-hidden
          className={cn('size-4 shrink-0 rounded-full border', on ? 'border-[5px] border-brand bg-surface' : 'border-line-strong bg-field shadow-inset-sm')}
        />
        <span className={cn('min-w-0', on && 'font-semibold')}>{text}</span>
      </label>
    )
  }
  return (
    <div id={`${id}-choice`} role="radiogroup" aria-label={label} className={cn('flex flex-col gap-2 sm:flex-row sm:flex-wrap', className)} data-testid={`${testId ?? id}-choice`}>
      {option(false, HAS_BARCODE[level], `${id}-has`)}
      {option(true, (amazon ? NO_BARCODE : NO_BARCODE_PLAIN)[level], `${id}-exempt`)}
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
  const showDigits = !style && !value.exempt
  const filled = value.exempt || (!style && normalizeBarcode(value.value) !== '')
  const hint = barcodeHint({ exempt: value.exempt, style, amazon })
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
          exempt={value.exempt}
          describedBy={showDigits ? undefined : fieldHintId(choiceId)}
          onChange={(exempt) => {
            onChange(style ? { ...value, exempt, touched: true } : { ...value, exempt })
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
      </div>
    </LaField>
  )
}
