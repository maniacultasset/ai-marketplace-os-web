/**
 * Sign in with Google (contract 2.1.0). All public ops: no bearer token, and a 401 never refreshes
 * or ends a session (src/api/client.ts PUBLIC_PATHS).
 *
 *   GET  /auth/google/config    { enabled }: whether the button is shown at all
 *   GET  /auth/google/start     a full-page navigation, see start.ts
 *   POST /auth/google/complete  { handle, binding } -> GoogleCompleteOut
 *   POST /auth/google/link      { link_handle, binding, password } -> LoginResult
 *   POST /signup/google         { details_handle, binding, brand_name, owner_name, phone?, website? } -> 202 SignupStatusOut
 *
 * Plain async functions, not mutations: the binding secret and the password must not sit in the
 * MutationCache after the screen is gone.
 */
import { queryOptions, useQuery } from '@tanstack/react-query'
import { api, unwrap } from '@/api/client'
import type { LoginResult, Schema } from '@/api/types'
import { queryClient } from '@/lib/query-client'

export type GoogleCompleteOut = Schema<'GoogleCompleteOut'>
export type GoogleDetails = Schema<'GoogleDetailsOut'>
export type GoogleLink = Schema<'GoogleLinkOut'>
export type GoogleSignupBody = Schema<'GoogleSignupRequest'>
export type GoogleSignupFields = Omit<GoogleSignupBody, 'details_handle' | 'binding'>

/**
 * Whether the backend has Google sign-in switched on. Any failure (an older API without the op,
 * the flag off, the network) means "off", so the button never shows when it cannot work.
 */
export const googleConfigQuery = queryOptions({
  queryKey: ['public', 'google-config'] as const,
  queryFn: async (): Promise<{ enabled: boolean }> => {
    try {
      const { data, response } = await api.GET('/auth/google/config')
      return { enabled: response.ok && data?.enabled === true }
    } catch {
      return { enabled: false }
    }
  },
  staleTime: 5 * 60_000,
  retry: false,
})

export function useGoogleEnabled(): boolean {
  return useQuery(googleConfigQuery).data?.enabled === true
}

/**
 * For route loaders: have the answer before the page paints, so the button does not pop in and
 * move the form. Waits at most `ms`; a slow answer still shows the button when it arrives.
 */
export function prefetchGoogleConfig(ms = 1200): Promise<void> {
  return Promise.race([
    queryClient.ensureQueryData(googleConfigQuery).then(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, ms)),
  ])
}

export const completeGoogle = (handle: string, binding: string): Promise<GoogleCompleteOut> =>
  unwrap(api.POST('/auth/google/complete', { body: { handle, binding } }))

export const linkGoogle = (link_handle: string, binding: string, password: string): Promise<LoginResult> =>
  unwrap(api.POST('/auth/google/link', { body: { link_handle, binding, password } }))

export const signupGoogle = (details_handle: string, binding: string, fields: GoogleSignupFields) =>
  unwrap(api.POST('/signup/google', { body: { details_handle, binding, ...fields } }))
