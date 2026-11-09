import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { isApiError, isMfaRequired } from '@/api/errors'
import { getSession } from '@/api/session'
import { isAiPausedError, markAiPaused } from '@/features/ai-credit/model'
import { toast } from 'sonner'
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

/** Longest a read waits on Retry-After before it gives up and shows its own error with Retry. */
export const RATE_LIMIT_WAIT_CAP_S = 20

/**
 * A 429 is the brand's shared limit: say so once, calmly, instead of leaving skeletons that never
 * fill. One toast for every read that is waiting (same id), replaced as the wait changes.
 */
export function noteRateLimited(waitS: number) {
  toast.info('Kuinn is busy', { id: 'rate-limited', description: `Too many requests from this brand right now. Trying again in ${waitS} s.` })
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
        // retry only network errors and 5xx (not 501); 429 waits Retry-After once (capped).
        retry: (count, error) => {
          if (!isApiError(error)) return false
          // One capped wait, then the screen's own error state with Retry.
          if (error.status === 429) return count < 1
          return count < 2 && (error.status === 0 || (error.status >= 500 && error.status !== 501))
        },
        retryDelay: (attempt, error) => {
          if (isApiError(error) && error.status === 429) {
            const wait = Math.min(error.retryAfter ?? RATE_LIMIT_WAIT_CAP_S, RATE_LIMIT_WAIT_CAP_S)
            noteRateLimited(wait)
            return wait * 1000
          }
          return Math.min(1000 * 2 ** attempt, 8000)
        },
        refetchOnWindowFocus: true,
      },
      mutations: { retry: false },
    },
  })
  return client
}

export const queryClient = createQueryClient()
