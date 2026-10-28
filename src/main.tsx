import { QueryClientProvider } from '@tanstack/react-query'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { onSessionEnd } from '@/api/session'
import { setEnrollmentHandler } from '@/api/step-up'
import { Page } from '@/components/app/page-header'
import { ErrorState } from '@/components/states/error-state'
import { NotFound } from '@/components/states/not-found'
import { queryClient } from '@/lib/query-client'
import { toast } from '@/lib/toast'
import { routeTree } from './routeTree.gen'
import './index.css'

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
  // Data freshness is owned by TanStack Query.
  defaultPreloadStaleTime: 0,
  defaultPendingMs: 150,
  scrollRestoration: true,
  defaultErrorComponent: ({ error, reset }) => (
    <Page>
      <ErrorState error={error} onRetry={reset} />
    </Page>
  ),
  defaultNotFoundComponent: () => (
    <Page>
      <NotFound />
    </Page>
  ),
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

// Session ended (logout here or in another tab, or refresh failed): leave the app, then drop the cache.
onSessionEnd((reason) => {
  const here = router.state.location.href
  if (reason === 'expired') toast.error('Your session ended.', { description: 'Sign in again to continue.' })
  void router
    .navigate({ to: '/login', search: reason === 'expired' ? { redirect: here } : {}, replace: true })
    .then(() => queryClient.clear())
})

// 403 MFA_ENROLLMENT_REQUIRED (a sensitive action before login codes are set up): go set them up.
setEnrollmentHandler(() => {
  if (router.state.location.pathname === '/settings/security') return
  toast.info('Set up login codes first', { description: 'This change needs login codes. It takes a minute.' })
  void router.navigate({ to: '/settings/security', search: { setup: true } })
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
