import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { SignupStatusPage } from '@/features/public/signup-status'

/** `email` prefills the form (from "Check status" after applying). Never a password. */
const searchSchema = z.object({ email: z.string().max(320).optional() })

export const Route = createFileRoute('/signup/status')({
  validateSearch: searchSchema,
  component: function SignupStatus() {
    const { email } = Route.useSearch()
    return <SignupStatusPage initialEmail={email} />
  },
})
