import { createFileRoute, redirect } from '@tanstack/react-router'
import { z } from 'zod'
import { restoreSession } from '@/api/session'
import { LoginPage } from '@/features/public/login-page'
import { safeRedirect } from '@/lib/redirect'

const searchSchema = z.object({ redirect: z.string().optional() })

// Owner: public. Signed in already → the redirect target (or /home).
export const Route = createFileRoute('/login')({
  validateSearch: searchSchema,
  beforeLoad: async ({ search }) => {
    const status = await restoreSession()
    if (status === 'authenticated') throw redirect({ href: safeRedirect(search.redirect) ?? '/home', replace: true })
  },
  component: function Login() {
    const search = Route.useSearch()
    return <LoginPage target={safeRedirect(search.redirect) ?? '/home'} />
  },
})
