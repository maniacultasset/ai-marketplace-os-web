import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { AppShell } from '@/components/app/app-shell'
import { BrandMark } from '@/components/app/brand-mark'
import { ErrorState } from '@/components/states/error-state'
import { Skeleton } from '@/components/ui/skeleton'
import { networkError } from '@/api/errors'
import { getSession, restoreSession, retryRestore } from '@/api/session'
import { meQueryOptions } from '@/lib/auth'
import { ImportJobsWatcher } from '@/features/imports/import-jobs-watcher'

class SessionUnreachable extends Error {}

/** Authenticated layout: restores the session (refresh) and loads /auth/me before any child. */
export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ location, context }) => {
    const status = await restoreSession()
    if (status === 'unreachable') throw new SessionUnreachable("Can't reach the server.")
    if (status !== 'authenticated') {
      throw redirect({ to: '/login', search: { redirect: location.href }, replace: true })
    }
    const { tenantId } = getSession()
    await context.queryClient.ensureQueryData(meQueryOptions(tenantId!))
  },
  pendingComponent: ShellPending,
  errorComponent: ShellError,
  component: AppLayout,
})

function AppLayout() {
  return (
    <>
      {/* Polls import jobs this browser started so every screen refreshes when they end. */}
      <ImportJobsWatcher />
      <AppShell />
    </>
  )
}

function ShellPending() {
  return (
    <div className="flex min-h-svh" aria-busy="true" aria-label="Loading">
      <div className="hidden w-64 shrink-0 flex-col gap-3 border-r bg-sidebar p-3 md:flex">
        <div className="flex items-center gap-2.5 pb-3">
          <BrandMark />
          <Skeleton className="h-4 w-28" />
        </div>
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-7 w-full" />
        ))}
      </div>
      <div className="flex-1">
        <div className="flex h-14 items-center gap-3 border-b px-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="ml-auto size-7 rounded-full" />
        </div>
      </div>
    </div>
  )
}

function ShellError({ error }: { error: unknown }) {
  const router = useRouter()
  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl border bg-card shadow-sm">
        <ErrorState
          error={error instanceof SessionUnreachable ? networkError() : error}
          title={error instanceof SessionUnreachable ? "Can't reach the server" : "Couldn't load your workspace"}
          onRetry={() => {
            void retryRestore().then(() => router.invalidate())
          }}
        />
      </div>
    </div>
  )
}
