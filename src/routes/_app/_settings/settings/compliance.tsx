import { createFileRoute } from '@tanstack/react-router'
import { Page } from '@/components/app/page-header'
import { BrandManufacturer, ComplianceAside } from '@/features/onboarding/compliance'
import { SetupColumns } from '@/features/onboarding/setup-frame'

/** Settings > Compliance: the brand manufacturer and where the other facts live (owner: onboarding). */
export const Route = createFileRoute('/_app/_settings/settings/compliance')({
  staticData: { title: 'Settings' },
  component: () => (
    <Page className="mx-0 max-w-[1100px]">
      {/* The settings sub-nav takes 200px, so the context column joins the card only from 1280px. */}
      <SetupColumns className="lg:grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px]" main={<BrandManufacturer />} aside={<ComplianceAside />} />
    </Page>
  ),
})
