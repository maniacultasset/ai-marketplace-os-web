import { createFileRoute, redirect } from '@tanstack/react-router'

/** Retired: compliance defaults had no API. Setup step 2 is now the brand manufacturer. */
export const Route = createFileRoute('/_app/setup/compliance')({
  beforeLoad: () => {
    throw redirect({ to: '/setup/manufacturer', replace: true })
  },
})
