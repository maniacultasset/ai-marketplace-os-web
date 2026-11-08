/**
 * SI8 inputs shared by the guided form and the product editor: the audience select and the
 * brand field ("From brand profile" by default, or one of the brand's other names).
 */
import { fieldHintId, LaField } from '@/components/la/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { AUDIENCE_HINT, BRAND_HINT, GENDER_LABEL, GENDERS, type Gender } from './audience'
import { chipFor, type ChipProps } from './field-sources'

/** Radix Select can't hold an empty value: "Not set" is this sentinel. */
const NONE = '__none__'

export function AudienceSelect({
  id,
  value,
  onChange,
  error,
  submitCount,
  allowClear,
  className,
  source,
  needed,
}: ChipProps & {
  id: string
  value: Gender | ''
  onChange: (v: Gender | '') => void
  error?: string
  submitCount?: number
  /** Offer "Not set" (the editor clears a saved value; the guided form starts empty). */
  allowClear?: boolean
  className?: string
}) {
  return (
    <LaField
      label="Audience"
      htmlFor={id}
      hint={AUDIENCE_HINT}
      error={error}
      {...chipFor(!!value, { source, needed }, false, error)}
      submitCount={submitCount}
      confirmFix
      className={className}
    >
      <Select value={value || (allowClear ? NONE : undefined)} onValueChange={(v) => onChange(v === NONE ? '' : (v as Gender))}>
        <SelectTrigger id={id} className="w-full" aria-invalid={error ? true : undefined} aria-describedby={fieldHintId(id)} data-testid={id}>
          <SelectValue placeholder="Choose who it is for" />
        </SelectTrigger>
        <SelectContent>
          {allowClear ? <SelectItem value={NONE}>Not set</SelectItem> : null}
          {GENDERS.map((g) => (
            <SelectItem key={g} value={g}>
              {GENDER_LABEL[g]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </LaField>
  )
}

export function BrandField({
  id,
  own,
  onOwnChange,
  value,
  onChange,
  onBlur,
  defaultName,
  error,
  submitCount,
  className,
}: {
  id: string
  /** false: the brand profile (store name) applies. */
  own: boolean
  onOwnChange: (own: boolean) => void
  value: string
  onChange: (v: string) => void
  onBlur?: () => void
  /** The store name the brand profile gives, when known. */
  defaultName: string
  error?: string
  submitCount?: number
  className?: string
}) {
  const switchId = `${id}-default`
  return (
    <LaField
      label="Brand"
      htmlFor={own ? id : switchId}
      hint={own ? BRAND_HINT : defaultName ? `Lists as ${defaultName}.` : 'Lists under your store name.'}
      error={own ? error : undefined}
      source={own ? (value.trim() ? { kind: 'you' } : undefined) : { kind: 'brand-profile' }}
      submitCount={submitCount}
      confirmFix
      className={className}
    >
      <div className="flex flex-col gap-2">
        <label htmlFor={switchId} className="inline-flex min-h-10 items-center gap-3 text-body text-ink">
          <Switch id={switchId} checked={!own} onCheckedChange={(on) => onOwnChange(!on)} data-testid={`${id}-default`} />
          From brand profile
        </label>
        {own ? (
          <Input
            id={id}
            name={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            maxLength={120}
            autoComplete="off"
            placeholder={defaultName || 'Brand name'}
            aria-invalid={error ? true : undefined}
            aria-describedby={fieldHintId(id)}
            data-testid={id}
          />
        ) : null}
      </div>
    </LaField>
  )
}
