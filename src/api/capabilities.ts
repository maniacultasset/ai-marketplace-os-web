/**
 * Pending (501) endpoints sit behind capability flags.
 * A nav item / button with `capability: X` renders only when BUILT[X] (a screen exists in this
 * build) AND the runtime probe says the backend serves it. Nothing "coming soon" is shown.
 */
import { api } from './client'

export type Capability =
  | 'brand'
  | 'listings.generate'
  | 'listings.review'
  | 'listings.publish'
  | 'images'
  | 'analytics'
  | 'inbox'
  | 'signups'

export const CAPABILITIES: readonly Capability[] = [
  'brand',
  'listings.generate',
  'listings.review',
  'listings.publish',
  'images',
  'analytics',
  'inbox',
  'signups',
]

/** Flip to true in the same PR that adds the screen. */
export const BUILT: Record<Capability, boolean> = {
  /** /brand: GET /tenants/me + brand documents. */
  brand: true,
  /** /runs/$id, /listings/$id/review|live|mapping (listing-flow): generate, approve, publish. */
  'listings.generate': true,
  'listings.review': true,
  'listings.publish': true,
  /** Images card on product detail: upload + compliance report. */
  images: true,
  /** Dashboard at /: GET /analytics/summary + GET /analytics. */
  analytics: true,
  /** /inbox: GET /issues + GET /tasks. */
  inbox: true,
  /** /admin/signups: the platform admin's sign-up queue. */
  signups: true,
}

export type ProbeResult = 'live' | 'stub' | 'unknown' | 'error'

export interface ProbeOutcome {
  capability: Capability
  op: string
  request: string
  result: ProbeResult
  status: number | null
  requestId: string | null
}

const NIL = '00000000-0000-4000-8000-000000000000'

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

/** One probe: a safe GET whose policy + param validation run before the stub body (so a stub is exactly 501). */
async function run(
  capability: Capability,
  op: string,
  request: string,
  liveStatus: number | readonly number[],
  call: () => Promise<{ response: Response }>,
): Promise<ProbeOutcome> {
  try {
    const { response } = await call()
    const status = response.status
    const live = typeof liveStatus === 'number' ? [liveStatus] : liveStatus
    const result: ProbeResult = status === 501 ? 'stub' : live.includes(status) ? 'live' : 'error'
    return { capability, op, request, result, status, requestId: response.headers.get('X-Request-ID') }
  } catch {
    return { capability, op, request, result: 'error', status: 0, requestId: null }
  }
}

export async function probeCapabilities(): Promise<ProbeOutcome[]> {
  const to = new Date()
  const from = new Date(to.getTime() - 30 * 86_400_000)
  const results = await Promise.all([
    run('brand', 'tenants_me', 'GET /tenants/me', 200, () => api.GET('/tenants/me')),
    run('listings.generate', 'listings_status', `GET /listings/${NIL}/status`, 404, () =>
      api.GET('/listings/{listing_id}/status', { params: { path: { listing_id: NIL } } }),
    ),
    run('listings.review', 'listings_list', 'GET /listings?limit=1', 200, () =>
      api.GET('/listings', { params: { query: { limit: 1 } } }),
    ),
    run('images', 'images_report', `GET /images/${NIL}/report`, 404, () =>
      api.GET('/images/{image_id}/report', { params: { path: { image_id: NIL } } }),
    ),
    run('inbox', 'issues_list', 'GET /issues?limit=1', 200, () =>
      api.GET('/issues', { params: { query: { limit: 1 } } }),
    ),
    // 403 for anyone but a platform admin still proves the route is served; the nav item is
    // additionally gated on `platform:admin` (GET /auth/me is_platform_admin).
    run('signups', 'admin_signup_requests_list', 'GET /admin/signup-requests?limit=1', [200, 403], () =>
      api.GET('/admin/signup-requests', { params: { query: { limit: 1 } } }),
    ),
    run('analytics', 'analytics_summary', 'GET /analytics/summary?from&to (last 30 days)', 200, () =>
      api.GET('/analytics/summary', { params: { query: { from: isoDate(from), to: isoDate(to) } } }),
    ),
  ])
  results.push({
    capability: 'listings.publish',
    op: 'listings_publish',
    request: 'no GET op exists (build-time flag only)',
    result: 'unknown',
    status: null,
    requestId: null,
  })
  return results
}
