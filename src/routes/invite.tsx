import { createFileRoute } from '@tanstack/react-router'
import { restoreSession } from '@/api/session'
import { prefetchGoogleConfig } from '@/features/google/api'
import { InvitePage } from '@/features/public/invite-page'

/**
 * Owner: public. `/invite#token=…` from a teammate's invite. Works signed out (create an account,
 * or sign in first) and signed in (join with this account), so the session is restored, never
 * required. The token is read and removed from the address bar by the page.
 */
export const Route = createFileRoute('/invite')({
  beforeLoad: async () => {
    await restoreSession()
  },
  loader: () => prefetchGoogleConfig(),
  component: InvitePage,
})
