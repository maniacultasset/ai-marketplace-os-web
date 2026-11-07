/**
 * Setup step 2, "Manufacturer": the brand manufacturer, set once (GET/PATCH /brand-profile through
 * ManufacturerCard). Every product uses it on its label and listings unless it sets its own.
 * Optional here: Continue works without it, and Home keeps it on the checklist until it is saved.
 */
import { useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { useBrandManufacturer } from '@/features/products/api'
import { BrandManufacturer, ComplianceAside } from './compliance'
import { SetupBody, SetupColumns, SetupFooter, SetupHeading } from './setup-frame'

export function ManufacturerStep() {
  const navigate = useNavigate()
  const q = useBrandManufacturer()
  const set = !!q.data?.data.default_manufacturer
  const status = q.isPending ? 'Checking…' : set ? 'Saved. Every product uses it.' : 'Add it now, or later in Brand profile.'
  return (
    <>
      <SetupBody step={1}>
        <SetupColumns
          main={
            <div className="flex flex-col gap-4">
              <SetupHeading title="Who makes your products?" sub="Marketplaces show the manufacturer on every garment listing. Add it once for the brand." />
              <BrandManufacturer />
            </div>
          }
          aside={<ComplianceAside />}
        />
      </SetupBody>
      <SetupFooter status={status}>
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
