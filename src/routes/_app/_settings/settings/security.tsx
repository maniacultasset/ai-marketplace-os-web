import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback } from 'react'
import { z } from 'zod'
import { Page, PageHeader } from '@/components/app/page-header'
import { SecurityView } from '@/features/mfa/security-view'

const searchSchema = z.object({ setup: z.boolean().optional().catch(undefined) })

/** Settings > Security (owner: mfa): login codes, recovery codes and the password (DPP-1). */
export const Route = createFileRoute('/_app/_settings/settings/security')({
  staticData: { title: 'Settings' },
  validateSearch: searchSchema,
  component: SecurityPage,
})

function SecurityPage() {
  const { setup } = Route.useSearch()
  const navigate = useNavigate()
  // Drop ?setup once the setup panel is open, so a reload does not open it again.
  const onSetupShown = useCallback(() => void navigate({ to: '/settings/security', search: {}, replace: true }), [navigate])
  return (
    <Page className="max-w-[1100px]">
      <PageHeader title="Security" description="Login codes and your password." />
      <SecurityView setup={setup === true} onSetupShown={onSetupShown} />
    </Page>
  )
}
