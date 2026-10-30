import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { prefetchGoogleConfig } from '@/features/google/api'
import { SignupPage } from '@/features/public/signup-page'

/** `email` prefills the form ("Apply again" from a rejected request). Never a password. */
const searchSchema = z.object({ email: z.string().max(320).optional() })

export const Route = createFileRoute('/signup/')({
  validateSearch: searchSchema,
  loader: () => prefetchGoogleConfig(),
  component: function Signup() {
    const { email } = Route.useSearch()
    return <SignupPage initialEmail={email} />
  },
})
