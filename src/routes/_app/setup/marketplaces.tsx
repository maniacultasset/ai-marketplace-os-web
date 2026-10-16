import { createFileRoute } from '@tanstack/react-router'
import { MarketplacesStep } from '@/features/onboarding/marketplaces-step'

/** Setup step 3 of 3, hi-fi 04 (owner: onboarding). */
export const Route = createFileRoute('/_app/setup/marketplaces')({
  staticData: { title: 'Set up', solo: true },
  component: MarketplacesStep,
})
