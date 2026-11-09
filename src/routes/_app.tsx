import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { AppShell, readPref } from '@/components/app/app-shell'
import { BrandMark } from '@/components/app/brand-mark'
import { Page } from '@/components/app/page-header'
import { ErrorState } from '@/components/states/error-state'
import { Skeleton } from '@/components/ui/skeleton'
import { isApiError, isRateLimited, networkError } from '@/api/errors'
import { useCallback, useEffect, useState } from 'react'
import { getSession, restoreSession, retryRestore } from '@/api/session'
import { meQueryOptions } from '@/lib/auth'
import { ImportJobsWatcher } from '@/features/imports/import-jobs-watcher'
import { StepUpHost } from '@/features/mfa/step-up-dialog'
import { SoloShell } from '@/components/app/solo-shell'
import { useRouteMeta } from '@/lib/route-meta'
import { cn } from '@/lib/utils'

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
    // A 429 is not retried here in silence behind the skeleton: ShellError counts it down at once.
    await context.queryClient.ensureQueryData({
      ...meQueryOptions(tenantId!),
      retry: (count, e) => isApiError(e) && e.status !== 429 && count < 2 && (e.status === 0 || (e.status >= 500 && e.status !== 501)),
    })
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

/**
 * First load: the shell's own frame (same sidebar width, tones and top bar container) with calm
 * placeholders, so the real shell drops in without a jump.
 */
function ShellPending() {
  const collapsed = readPref() === 'collapsed'
  return (
    <div
      className={cn(
        'grid min-h-svh grid-cols-1 bg-canvas',
        collapsed ? 'md:grid-cols-[72px_minmax(0,1fr)]' : 'md:grid-cols-[232px_minmax(0,1fr)]',
      )}
      aria-busy="true"
      aria-label="Loading Kuinn"
    >
      <div className="sticky top-0 hidden h-svh flex-col gap-0.5 border-r border-line bg-canvas px-3 py-4 md:flex">
        <div
          className={cn(
            'mb-3.5 flex items-center gap-2.5 px-1.5 font-display text-[15px] font-bold text-ink',
            collapsed && 'justify-center px-0',
          )}
        >
          <BrandMark />
          <span className={cn(collapsed && 'sr-only')}>Kuinn</span>
        </div>
        <Skeleton className="mb-3.5 h-[46px] w-full rounded-card" />
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} className="h-[38px] w-full rounded-tile" />
        ))}
        <Skeleton className="mt-auto h-[54px] w-full rounded-card" />
        <Skeleton className="mt-2 h-8 w-full rounded-tile" />
      </div>
      <div className="flex min-w-0 flex-col">
        <header className="material-bar h-14 shrink-0">
          <div className="mx-auto flex h-full w-full max-w-[var(--page-max)] items-center gap-3.5 px-4 md:px-7">
            <Skeleton className="h-5 w-32" />
            <div className="ml-auto flex items-center gap-2 md:gap-3.5">
              <Skeleton className="hidden h-[34px] w-60 rounded-tile sm:block" />
              <span className="inline-flex size-9 items-center justify-center">
                <Skeleton className="size-7 rounded-full" />
              </span>
            </div>
          </div>
        </header>
        <Page>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-1 h-5 w-72 max-w-full" />
        </Page>
      </div>
    </div>
  )
}

function ShellError({ error }: { error: unknown }) {
  const router = useRouter()
  const retry = useCallback(() => void retryRestore().then(() => router.invalidate()), [router])
  if (isRateLimited(error)) return <ShellBusy wait={Math.min((error as { retryAfter?: number | null }).retryAfter ?? 20, 60)} onRetry={retry} />
  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <div className="w-full max-w-md rounded-card border border-line bg-surface shadow-raised-md">
        <ErrorState
          error={error instanceof SessionUnreachable ? networkError() : error}
          title={error instanceof SessionUnreachable ? "Can't reach the server" : "Couldn't load your workspace"}
          onRetry={retry}
        />
      </div>
    </div>
  )
}

/** The brand hit its shared request limit: a live countdown, then Kuinn tries again on its own. */
function ShellBusy({ wait, onRetry }: { wait: number; onRetry: () => void }) {
  const [until] = useState(() => Date.now() + wait * 1000)
  const [left, setLeft] = useState(wait)
  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, Math.ceil((until - Date.now()) / 1000))), 500)
    return () => clearInterval(t)
  }, [until])
  useEffect(() => {
    if (left === 0) onRetry()
  }, [left, onRetry])
  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <div role="status" className="w-full max-w-md rounded-card border border-line bg-surface p-6 text-center shadow-raised-md" data-testid="shell-busy">
        <p className="font-display text-h3 text-ink">Kuinn is busy</p>
        <p className="mt-1 text-body text-ink-2">
          Your brand sent a lot of requests in the last minute. {left > 0 ? `Trying again in ${left} s.` : 'Trying again now…'}
        </p>
      </div>
    </div>
  )
}
