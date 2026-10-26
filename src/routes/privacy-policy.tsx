import { createFileRoute, redirect } from '@tanstack/react-router'

// Owner: public. The company's Terms link to /privacy-policy; the policy itself lives at /privacy.
export const Route = createFileRoute('/privacy-policy')({
  beforeLoad: () => {
    throw redirect({ to: '/privacy', replace: true })
  },
})
