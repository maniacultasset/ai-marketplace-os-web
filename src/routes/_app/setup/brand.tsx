import { createFileRoute } from '@tanstack/react-router'
import { BrandStep } from '@/features/onboarding/brand-step'

/** Setup step 1 of 3, hi-fi 02 (owner: onboarding). */
export const Route = createFileRoute('/_app/setup/brand')({
  staticData: { title: 'Set up', solo: true },
  component: BrandStep,
})
