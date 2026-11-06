import { createFileRoute } from '@tanstack/react-router'
import { Page } from '@/components/app/page-header'
import { ComplianceAside, ComplianceForm } from '@/features/onboarding/compliance'
import { SetupColumns } from '@/features/onboarding/setup-frame'

/** Settings → Compliance (hi-fi 03 form, owner: onboarding). Shares the form with /setup/compliance. */
export const Route = createFileRoute('/_app/_settings/settings/compliance')({
  staticData: { title: 'Settings' },
  component: () => (
    <Page className="mx-0 max-w-[1100px]">
      {/* The settings sub-nav takes 200px, so the context column joins the form only from 1280px. */}
      <SetupColumns className="lg:grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px]" main={<ComplianceForm />} aside={<ComplianceAside />} />
    </Page>
  ),
})
