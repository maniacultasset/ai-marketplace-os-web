import { createFileRoute, redirect } from '@tanstack/react-router'
import { restoreSession } from '@/api/session'
import { Landing } from '@/features/public/landing'

/** '/': the landing page when signed out, Home when signed in. Owner: public. */
export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const status = await restoreSession()
    if (status === 'authenticated') throw redirect({ href: '/home', replace: true })
  },
  component: Landing,
})
