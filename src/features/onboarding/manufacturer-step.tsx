/**
 * Setup step 2, "Manufacturer": the brand manufacturer, set once (GET/PATCH /brand-profile through
 * ManufacturerCard). Every product uses it on its label and listings unless it sets its own.
 * Optional here: Continue works without it, and Home keeps it on the checklist until it is saved.
 * While the card's edit form is open, Back and Continue wait, so an unsaved manufacturer is never lost.
 */
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useBrandManufacturer } from '@/features/products/api'
import { BrandManufacturer, ComplianceAside } from './compliance'
import { SetupBody, SetupColumns, SetupFooter, SetupHeading } from './setup-frame'

export function ManufacturerStep() {
  const navigate = useNavigate()
  const q = useBrandManufacturer()
  const [editing, setEditing] = useState(false)
  const set = !!q.data?.data.default_manufacturer
  const status = editing
    ? 'Save the manufacturer or cancel it first.'
    : q.isPending
      ? 'Checking…'
      : set
        ? 'Saved. Every product uses it.'
        : 'Add it now, or later in Brand profile.'
  return (
    <>
      <SetupBody step={1}>
        <SetupColumns
          main={
            <div className="flex flex-col gap-4">
              <SetupHeading title="Who makes your products?" sub="Marketplaces show the manufacturer on every garment listing. Add it once for the brand." />
              <BrandManufacturer onEditingChange={setEditing} />
            </div>
          }
          aside={<ComplianceAside />}
        />
      </SetupBody>
      <SetupFooter status={status}>
        <Button variant="secondary" onClick={() => void navigate({ to: '/setup/brand' })} disabled={editing}>
          Back
        </Button>
        <Button
          onClick={() => void navigate({ to: '/setup/marketplaces' })}
          disabled={editing}
          aria-describedby={editing ? 'setup-footer-reason' : undefined}
          data-testid="setup-continue"
        >
          Continue
        </Button>
        {editing ? (
          <span id="setup-footer-reason" className="sr-only">
            Save the manufacturer or cancel it first.
          </span>
        ) : null}
      </SetupFooter>
    </>
  )
}
