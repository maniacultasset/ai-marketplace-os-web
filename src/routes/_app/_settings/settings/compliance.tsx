import { createFileRoute } from '@tanstack/react-router'
import { ComplianceAside, ComplianceForm } from '@/features/onboarding/compliance'
import { SetupColumns } from '@/features/onboarding/setup-frame'

/** Settings → Compliance (hi-fi 03 form, owner: onboarding). Shares the form with /setup/compliance. */
export const Route = createFileRoute('/_app/_settings/settings/compliance')({
  staticData: { title: 'Settings' },
  component: () => (
    <div className="animate-page-in px-4 pt-5 pb-10 md:px-10 md:py-7">
      {/* The settings sub-nav takes 200px, so the context column joins the form only from 1280px. */}
      <SetupColumns className="lg:grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px]" main={<ComplianceForm />} aside={<ComplianceAside />} />
    </div>
  ),
})
