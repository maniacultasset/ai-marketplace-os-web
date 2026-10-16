import { createFileRoute } from '@tanstack/react-router'
import { ComplianceStep } from '@/features/onboarding/compliance'

/** Setup step 2 of 3, hi-fi 03 (owner: onboarding). */
export const Route = createFileRoute('/_app/setup/compliance')({
  staticData: { title: 'Set up', solo: true },
  component: ComplianceStep,
})
