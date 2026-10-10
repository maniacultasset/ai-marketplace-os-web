import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import { NetworkBanner } from '@/components/app/network-banner'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'

export interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
})

function RootLayout() {
  return (
    <TooltipProvider delayDuration={300}>
      <NetworkBanner />
      <Outlet />
      <Toaster position="bottom-right" closeButton />
    </TooltipProvider>
  )
}
