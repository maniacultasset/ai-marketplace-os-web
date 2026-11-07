import { createFileRoute } from '@tanstack/react-router'
import { ManufacturerStep } from '@/features/onboarding/manufacturer-step'

/** Setup step 2 of 3: the brand manufacturer (owner: onboarding). */
export const Route = createFileRoute('/_app/setup/manufacturer')({
  staticData: { title: 'Set up', solo: true },
  component: ManufacturerStep,
})
