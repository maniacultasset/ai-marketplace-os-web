import { createFileRoute } from '@tanstack/react-router'
import { PrivacyPolicy } from '@/features/public/privacy-policy'

// Owner: public (privacy policy). Public page, no session needed.
export const Route = createFileRoute('/privacy')({
  component: PrivacyPolicy,
})
