import { createFileRoute } from '@tanstack/react-router'
import { restoreSession } from '@/api/session'
import { Landing } from '@/features/public/landing'

/**
 * '/': the landing page for everyone. A signed-in user reaches it from the app's Kuinn mark, so it
 * no longer redirects to Home; the session is restored first so the header offers "Open dashboard".
 * Owner: public.
 */
export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    await restoreSession()
  },
  component: Landing,
})
