import { createFileRoute } from '@tanstack/react-router'
import { Terms } from '@/features/public/terms'

// Owner: public (terms and conditions). Public page, no session needed.
export const Route = createFileRoute('/terms')({
  component: Terms,
})
