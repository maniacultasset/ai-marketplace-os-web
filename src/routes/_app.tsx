import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { AppShell } from '@/components/app/app-shell'
import { BrandMark } from '@/components/app/brand-mark'
import { ErrorState } from '@/components/states/error-state'
import { Skeleton } from '@/components/ui/skeleton'
import { networkError } from '@/api/errors'
import { getSession, restoreSession, retryRestore } from '@/api/session'
import { meQueryOptions } from '@/lib/auth'
import { ImportJobsWatcher } from '@/features/imports/import-jobs-watcher'
import { StepUpHost } from '@/features/mfa/step-up-dialog'
import { SoloShell } from '@/components/app/solo-shell'
import { useRouteMeta } from '@/lib/route-meta'

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
  const meta = useRouteMeta()
  return (
    <>
      {/* Polls import jobs this browser started so every screen refreshes when they end. */}
      <ImportJobsWatcher />
      {/* Answers 403 MFA_STEP_UP_REQUIRED from any request with a code, then the request is replayed. */}
      <StepUpHost />
      {meta.solo ? <SoloShell title={meta.title} /> : <AppShell />}
    </>
  )
}

function ShellPending() {
  return (
    <div className="grid min-h-svh grid-cols-1 bg-canvas md:grid-cols-[232px_minmax(0,1fr)]" aria-busy="true" aria-label="Loading">
      <div className="hidden flex-col gap-2 border-r border-line bg-surface px-3 py-4 md:flex">
        <div className="mb-3.5 flex items-center gap-2.5 px-1.5">
          <BrandMark />
          <Skeleton className="h-4 w-28" />
        </div>
        <Skeleton className="mb-3.5 h-[46px] w-full rounded-[10px]" />
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} className="h-[38px] w-full" />
        ))}
      </div>
      <div>
        <div className="flex h-14 items-center gap-3 border-b border-line bg-surface px-4 md:px-7">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="ml-auto hidden h-[34px] w-60 sm:block" />
          <Skeleton className="size-7 rounded-full" />
        </div>
        <div className="p-4 md:p-7">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-2 h-4 w-72" />
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
