import { createFileRoute, redirect, useRouterState } from '@tanstack/react-router'
import { z } from 'zod'
import { restoreSession } from '@/api/session'
import { prefetchGoogleConfig } from '@/features/google/api'
import { LoginPage, type LoginNotice } from '@/features/public/login-page'
import { safeRedirect } from '@/lib/redirect'
import { readApprovedSignIn } from '@/lib/sign-in-state'

const NOTICES = ['google_unavailable', 'expired', 'attempts', 'mfa-off', 'invalid'] as const

/**
 * `error=google_unavailable` comes from the backend when Google sign-in is off; `restart` is a
 * sign-in step that /auth/google sent back here. Anything else is ignored.
 */
const searchSchema = z.object({
  redirect: z.string().optional(),
  error: z.string().optional(),
  restart: z.string().optional(),
})

function noticeFrom(search: z.infer<typeof searchSchema>): LoginNotice | undefined {
  const value = search.error ?? search.restart
  return (NOTICES as readonly string[]).includes(value ?? '') ? (value as LoginNotice) : undefined
}

// Owner: public. Signed in already → the redirect target (or /home).
export const Route = createFileRoute('/login')({
  validateSearch: searchSchema,
  beforeLoad: async ({ search }) => {
    const status = await restoreSession()
    if (status === 'authenticated') throw redirect({ href: safeRedirect(search.redirect) ?? '/home', replace: true })
  },
  loader: () => prefetchGoogleConfig(),
  component: function Login() {
    const search = Route.useSearch()
    // From the approved card: history state only (never the URL), read once per location.
    const approved = useRouterState({ select: (s) => readApprovedSignIn(s.location.state) })
    return (
      <LoginPage
        target={safeRedirect(search.redirect) ?? '/home'}
        notice={noticeFrom(search)}
        approved={approved !== null}
        initialEmail={approved?.email ?? undefined}
      />
    )
  },
})
