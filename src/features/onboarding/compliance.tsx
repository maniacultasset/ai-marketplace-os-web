/**
 * Compliance defaults (hi-fi 03): setup step 2 at /setup/compliance and the Settings page at
 * /settings/compliance share `ComplianceForm`.
 *
 * The API has no place for these facts yet: TenantOut/TenantPatch (schemas/tenants.py) carry name,
 * tone, guidelines and glossary only, and no other route stores customer care contacts, registered
 * address, manufacturers, importer, country of origin, GST or HSN defaults. Every field renders
 * where the design puts it, disabled, under one banner. Nothing is saved and nothing is guessed.
 */
import { useNavigate } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { Banner } from '@/components/la/banner'
import { CardHead, LaCard } from '@/components/la/cards'
import { LaField } from '@/components/la/field'
import { Icon, IconTile } from '@/components/la/icons'
import { UnavailableButton } from '@/components/la/unavailable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { NEEDS_BACKEND } from './model'
import { SetupBody, SetupColumns, SetupFooter, SetupHeading } from './setup-frame'

export function ComplianceStep() {
  const navigate = useNavigate()
  return (
    <>
      <SetupBody step={1}>
        <SetupColumns main={<ComplianceForm />} aside={<ComplianceAside />} />
      </SetupBody>
      <SetupFooter status="Nothing on this step is saved yet. You can continue.">
        <Button variant="secondary" onClick={() => void navigate({ to: '/setup/brand' })}>
          Back
        </Button>
        <Button onClick={() => void navigate({ to: '/setup/marketplaces' })} data-testid="setup-continue">
          Continue
        </Button>
      </SetupFooter>
    </>
  )
}

/** The form card. Shared with /settings/compliance. */
export function ComplianceForm({ className }: { className?: string }) {
  return (
    <LaCard className={cn('flex flex-col gap-4', className)} data-testid="compliance-form">
      <SetupHeading title="Facts every garment listing needs" sub="We store what you tell us. We never fill these in from guesses." />

      <Banner tone="neutral" icon="alert" title="Compliance defaults can’t be saved yet">
        {NEEDS_BACKEND} Until then, give manufacturer, country of origin and HSN code per product: the bulk spreadsheet has a column for each.
      </Banner>

      <div className="grid gap-4 md:grid-cols-2">
        <LaField label="Customer care email" htmlFor="care-email">
          <Input id="care-email" type="email" inputMode="email" autoComplete="email" spellCheck={false} disabled placeholder="care@yourbrand.in" />
        </LaField>
        <LaField label="Customer care phone" htmlFor="care-phone">
          <Input id="care-phone" type="tel" inputMode="tel" autoComplete="tel" disabled placeholder="+91" />
        </LaField>
      </div>

      <LaField label="Registered address" htmlFor="registered-address">
        <Textarea id="registered-address" autoComplete="street-address" disabled placeholder="Street, city, state, PIN code" className="min-h-[64px]" />
      </LaField>

      <LaCard emphasis="tint" pad="sm" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-body font-bold text-ink">Manufacturer</h4>
          <UnavailableButton variant="secondary" size="sm" reason={NEEDS_BACKEND}>
            <Icon name="plus" size={14} />
            Add another
          </UnavailableButton>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <LaField label="Name" htmlFor="mfr-name">
            <Input id="mfr-name" autoComplete="off" disabled placeholder="Who makes the garments" />
          </LaField>
          <LaField label="Address" htmlFor="mfr-address">
            <Input id="mfr-address" autoComplete="off" disabled placeholder="Factory address" />
          </LaField>
        </div>
        <DisabledToggle label="We import some products (adds importer details)" />
      </LaCard>

      <div className="grid gap-4 md:grid-cols-3">
        <LaField label="Default country of origin" htmlFor="origin" hint="Never inferred from where your brand is.">
          <FakeSelect id="origin" placeholder="Choose a country" />
        </LaField>
        <LaField label="GST number" htmlFor="gst">
          <Input id="gst" maxLength={15} autoCapitalize="characters" autoComplete="off" spellCheck={false} disabled placeholder="15 characters" />
        </LaField>
        <LaField label="Default HSN code" htmlFor="hsn">
          <FakeSelect id="hsn" placeholder="Choose, or set per product" />
        </LaField>
      </div>
    </LaCard>
  )
}

/** Right column: where these declarations appear, and the not-legal-advice note. */
export function ComplianceAside() {
  return (
    <>
      <LaCard pad="sm">
        <CardHead title="Where this appears" sub="Garment listings can require these declarations to be shown to customers." icon="eye" />
        <ul className="mt-4 flex flex-col gap-2 text-small text-ink">
          <Declared>Manufacturer, marketer or importer</Declared>
          <Declared>Consumer care contact</Declared>
          <Declared>Country of origin</Declared>
          <Declared perProduct>
            Size and MRP{' '}
            <span className="ml-1 rounded-[5px] bg-subtle px-1.5 py-0.5 text-caption font-semibold text-ink-2">per product</span>
          </Declared>
        </ul>
      </LaCard>
      <div className="flex items-start gap-3 rounded-card border border-line bg-canvas px-4 py-3">
        <IconTile icon="shield" size="sm" />
        <p className="text-small text-ink">We capture this data. We do not certify legal compliance. Please confirm with your advisor.</p>
      </div>
    </>
  )
}

function Declared({ children, perProduct }: { children: ReactNode; perProduct?: boolean }) {
  return (
    <li className="flex items-center gap-2.5">
      <span
        aria-hidden
        className={cn(
          'inline-flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px]',
          perProduct ? 'border-line-strong bg-field shadow-inset-sm' : 'border-brand bg-brand text-white shadow-raised-brand',
        )}
      >
        {perProduct ? null : <Icon name="check" size={12} strokeWidth={2.5} />}
      </span>
      <span>
        {children}
        <span className="sr-only">{perProduct ? ' (set on each product)' : ' (brand default)'}</span>
      </span>
    </li>
  )
}

/** A select that cannot open: same 40px box with the chevron, disabled. */
function FakeSelect({ id, placeholder }: { id: string; placeholder: string }) {
  return (
    <button
      id={id}
      type="button"
      disabled
      className="flex h-10 w-full cursor-not-allowed items-center justify-between rounded-control border border-dashed border-line-strong bg-subtle px-3 text-left text-[14px] text-ink-3"
    >
      <span className="truncate">{placeholder}</span>
      <Icon name="chev" size={16} />
    </button>
  )
}

function DisabledToggle({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <button
        type="button"
        role="switch"
        aria-checked={false}
        disabled
        aria-label={label}
        className="relative inline-flex h-[22px] w-10 shrink-0 cursor-not-allowed rounded-full border border-dashed border-line-strong bg-subtle"
      >
        <span aria-hidden className="absolute top-[2px] left-[2px] size-4 rounded-full bg-surface shadow-thumb" />
      </button>
      <span className="text-small text-ink-2">{label}</span>
    </div>
  )
}
