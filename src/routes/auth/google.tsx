import { createFileRoute, redirect } from '@tanstack/react-router'
import { z } from 'zod'
import { restoreSession } from '@/api/session'
import { GoogleReturnPage } from '@/features/google/google-return-page'

/**
 * Where the backend's Google callback lands: `?handle=` (single use, 60 s, bound to this tab) or
 * `?error=cancelled|failed|unavailable`. The page strips both from the address bar as soon as it reads them.
 */
const searchSchema = z.object({
  handle: z.string().min(1).max(128).optional().catch(undefined),
  error: z.string().max(32).optional().catch(undefined),
})

// Owner: public. Signed in already (another tab finished first) → /home.
export const Route = createFileRoute('/auth/google')({
  validateSearch: searchSchema,
  beforeLoad: async () => {
    const status = await restoreSession()
    if (status === 'authenticated') throw redirect({ href: '/home', replace: true })
  },
  component: function GoogleReturn() {
    const search = Route.useSearch()
    return <GoogleReturnPage search={search} />
  },
})
