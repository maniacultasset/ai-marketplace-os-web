import { createFileRoute } from '@tanstack/react-router'
import { ResetPasswordPage } from '@/features/public/reset-password-page'

/**
 * Owner: public. `/reset-password#token=…` from a reset link an owner or admin made. No session is
 * needed or used; the token is read and removed from the address bar by the page.
 */
export const Route = createFileRoute('/reset-password')({
  component: ResetPasswordPage,
})
