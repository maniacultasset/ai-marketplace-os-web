import { createFileRoute } from '@tanstack/react-router'
import { Page, PageHeader } from '@/components/app/page-header'
import { AccountView } from '@/features/team-account/account-view'

export const Route = createFileRoute('/_app/account')({ component: AccountPage })

function AccountPage() {
  return (
    <Page>
      <PageHeader title="Account" description="Your sign-in details and the brands you belong to." />
      <AccountView />
    </Page>
  )
}
