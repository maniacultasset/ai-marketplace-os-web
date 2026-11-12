/** A GET /home/brands body for tests: two brands, the first one current. */
import type { HomeBrands } from '@/features/home-inbox/brands-model'

const counts = (over: Partial<HomeBrands['brands'][number]['listings']> = {}) => ({
  total: 0, live: 0, partly_live: 0, live_products: 0, in_progress: 0, problem: 0, ready_to_approve: 0, ready_to_publish: 0, draft: 0, inactive: 0, ...over,
})
export const brands = (over: Partial<HomeBrands> = {}): HomeBrands => ({
  as_of: '2026-11-12T09:00:00Z',
  brands: [
    { tenant_id: 't1', name: 'Acme', role: 'owner', current: true, products: 1284, listings: counts({ total: 9, live: 3, partly_live: 1, in_progress: 2 }), needs_you: 4 },
    { tenant_id: 't2', name: 'Bharat', role: 'reviewer', current: false, products: 1, listings: counts({ total: 1 }), needs_you: 0 },
  ],
  more: false,
  ...over,
})
