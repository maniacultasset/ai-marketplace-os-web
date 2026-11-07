/**
 * Compliance facts: where each one is kept. Shared by setup step 2 (/setup/manufacturer) and
 * Settings > Compliance (/settings/compliance).
 *
 * The brand manufacturer is set once for the brand (GET/PATCH /brand-profile, ManufacturerCard).
 * Everything else a garment label needs (country of origin, HSN, MRP, size, care) is a product fact,
 * given in the guided form or the spreadsheet. There are no other brand-wide compliance defaults,
 * so none are shown.
 */
import type { ReactNode } from 'react'
import { CardHead, LaCard } from '@/components/la/cards'
import { Icon, IconTile } from '@/components/la/icons'
import { ManufacturerCard } from '@/features/brand/manufacturer-card'
import { OP_ACTION, useCan } from '@/lib/permissions'
import { cn } from '@/lib/utils'

/** The brand manufacturer card, editable with settings:manage (PATCH /brand-profile). */
export function BrandManufacturer({ onEditingChange }: { onEditingChange?: (editing: boolean) => void }) {
  const can = useCan()
  return <ManufacturerCard canEdit={can(OP_ACTION['PATCH /brand-profile'])} onEditingChange={onEditingChange} />
}

/** Right column: where each declaration comes from, and the not-legal-advice note. */
export function ComplianceAside() {
  return (
    <>
      <LaCard pad="sm" data-testid="compliance-aside">
        <CardHead title="Where this appears" sub="Garment listings show these declarations to customers." icon="info" />
        <ul className="mt-4 flex flex-col gap-2 text-small text-ink">
          <Declared brand>Manufacturer</Declared>
          <Declared>Country of origin</Declared>
          <Declared>Size, MRP and care</Declared>
        </ul>
        <p className="mt-3 text-caption text-ink-3">
          The manufacturer is set once here. The rest are set on each product, in the guided form or the spreadsheet.
        </p>
      </LaCard>
      <div className="flex items-start gap-3 rounded-card border border-line bg-canvas px-4 py-3">
        <IconTile icon="shield" size="sm" />
        <p className="text-small text-ink">We store what you tell us and never guess these facts. We don’t certify legal compliance, so check with your advisor.</p>
      </div>
    </>
  )
}

function Declared({ children, brand }: { children: ReactNode; brand?: boolean }) {
  return (
    <li className="flex items-center gap-2.5">
      <span
        aria-hidden
        className={cn(
          'inline-flex size-[18px] shrink-0 items-center justify-center rounded-sm border-[1.5px]',
          brand ? 'border-brand bg-brand text-white shadow-raised-brand' : 'border-line-strong bg-field shadow-inset-sm',
        )}
      >
        {brand ? <Icon name="check" size={14} /> : null}
      </span>
      <span>
        {children}
        {brand ? null : (
          <span className="ml-1 rounded-sm bg-subtle px-1.5 py-0.5 text-caption font-semibold text-ink-2">per product</span>
        )}
        <span className="sr-only">{brand ? ' (set once for the brand)' : ' (set on each product)'}</span>
      </span>
    </li>
  )
}
