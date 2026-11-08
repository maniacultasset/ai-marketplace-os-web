import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { isApiError, isMfaRequired } from '@/api/errors'
import { getSession } from '@/api/session'
import { isAiPausedError, markAiPaused } from '@/features/ai-credit/model'
import { toastError } from '@/lib/toast'

declare module '@tanstack/react-query' {
  interface Register {
    defaultError: import('@/api/errors').ApiError
    mutationMeta: {
      /** false = the screen shows this error inline (field errors, panels); no global toast. */
      toast?: boolean
      /** Title for the default error toast. */
      errorTitle?: string
    }
  }
}

/** 503 AI_CREDIT_EXHAUSTED / AI_PROVIDER_KEY_INVALID: show the pause banner now and re-read /auth/me. */
function notePause(client: QueryClient, error: unknown): boolean {
  if (!isAiPausedError(error)) return false
  markAiPaused()
  const { tenantId } = getSession()
  if (tenantId) void client.invalidateQueries({ queryKey: ['t', tenantId, 'me'] })
  return true
}

function refetchMeAfter403(client: QueryClient, error: unknown) {
  // Role is re-read on every request; a 403 means ours may have changed.
  if (isApiError(error) && error.status === 403 && !isMfaRequired(error)) {
    const { tenantId } = getSession()
    if (tenantId) void client.invalidateQueries({ queryKey: ['t', tenantId, 'me'] })
  }
}

export function createQueryClient() {
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => refetchMeAfter403(client, error),
    }),
    mutationCache: new MutationCache({
      onError: (error, _vars, _ctx, mutation) => {
        refetchMeAfter403(client, error)
        // The app-wide banner says it once; no toast per refused generate.
        if (notePause(client, error)) return
        if (mutation.meta?.toast === false) return
        if (isApiError(error) && error.status === 401) return // session handling redirects
        toastError(error, mutation.meta?.errorTitle)
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // retry only network errors and 5xx (not 501); 429 waits Retry-After.
        retry: (count, error) => {
          if (!isApiError(error)) return false
          if (error.status === 429) return count < 2
          return count < 2 && (error.status === 0 || (error.status >= 500 && error.status !== 501))
        },
        retryDelay: (attempt, error) =>
          isApiError(error) && error.status === 429
            ? (error.retryAfter ?? 60) * 1000
            : Math.min(1000 * 2 ** attempt, 8000),
        refetchOnWindowFocus: true,
      },
      mutations: { retry: false },
    },
  })
  return client
}

export const queryClient = createQueryClient()
