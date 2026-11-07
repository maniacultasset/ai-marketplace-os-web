/**
 * The barcode field, shared by the guided form and the product editor: a type (EAN, UPC, GTIN)
 * and the digits, or "No barcode (exempt)". On a style only the exemption shows, since each
 * variant carries its own barcode and the style's exemption reaches every variant without one.
 * Controlled and stateless about rules: the caller passes the draft and the `barcode` error.
 */
import { fieldHintId, LaField } from '@/components/la'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { BARCODE_LABEL, BARCODE_TYPES, normalizeBarcode, type BarcodeDraft, type BarcodeLevel, type BarcodeType } from './barcode'

const ITEM_HINT = 'EAN, UPC or GTIN from the pack. Amazon needs one unless your brand has a GTIN exemption.'
const EXEMPT_HINT = 'Only if Amazon approved a GTIN exemption for your brand.'
const STYLE_HINT = 'Each variant has its own barcode. Turn this on to mark every variant without one as exempt.'
const STYLE_EXEMPT_HINT = 'Every variant without a barcode is marked exempt. Only if Amazon approved a GTIN exemption for your brand.'

export function BarcodeField({
  id,
  value,
  onChange,
  onBlur,
  error,
  submitCount,
  level = 'item',
  className,
}: {
  id: string
  value: BarcodeDraft
  onChange: (v: BarcodeDraft) => void
  onBlur?: () => void
  error?: string
  submitCount?: number
  level?: BarcodeLevel
  className?: string
}) {
  const valueId = `${id}-value`
  const exemptId = `${id}-exempt`
  const style = level === 'style'
  const showDigits = !style && !value.exempt
  const filled = value.exempt || (!style && normalizeBarcode(value.value) !== '')
  const hint = style ? (value.exempt ? STYLE_EXEMPT_HINT : STYLE_HINT) : value.exempt ? EXEMPT_HINT : ITEM_HINT
  const labelFor = showDigits ? valueId : exemptId
  return (
    <LaField
      label="Barcode"
      htmlFor={labelFor}
      hint={hint}
      error={error}
      source={filled ? { kind: 'you' } : undefined}
      submitCount={submitCount}
      confirmFix
      className={className}
    >
      <div className="flex flex-col gap-3" data-testid={`${id}-field`}>
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
              placeholder={value.type === 'upc' ? '12 digits' : value.type === 'ean' ? '13 digits' : '8 to 14 digits'}
              maxLength={24}
              className="min-w-0 flex-1 font-mono tabular-nums"
              aria-invalid={error ? true : undefined}
              aria-describedby={fieldHintId(valueId)}
            />
          </div>
        ) : null}
        <label className="flex min-h-10 items-center gap-2.5 self-start text-small text-ink-2">
          <Switch
            id={exemptId}
            checked={value.exempt}
            onCheckedChange={(exempt) => {
              onChange({ ...value, exempt })
              onBlur?.()
            }}
            aria-describedby={showDigits ? undefined : fieldHintId(exemptId)}
            data-testid={`${id}-exempt`}
          />
          {style ? 'No barcodes (exempt)' : 'No barcode (exempt)'}
        </label>
      </div>
    </LaField>
  )
}
