/** A GET /home/summary body for tests: two marketplaces, one item of each kind, a short feed. */
import type { HomeSummary } from '@/features/home-inbox/summary-model'

export const P1 = '0b1c2d3e-0000-4000-8000-000000000101'
export const L1 = '0b1c2d3e-0000-4000-8000-000000000201'
export const L2 = '0b1c2d3e-0000-4000-8000-000000000202'
export const ISSUE = '0b1c2d3e-0000-4000-8000-000000001001'
export const TASK = '0b1c2d3e-0000-4000-8000-000000001101'
const AT = '2026-11-11T09:30:00Z'

export function summary(over: Partial<HomeSummary> = {}): HomeSummary {
  return {
    as_of: AT,
    listings: { total: 9, live: 3, partly_live: 1, live_products: 2, in_progress: 1, problem: 2, ready_to_approve: 1, ready_to_publish: 1, draft: 0, inactive: 0 },
    by_marketplace: [
      { marketplace: 'amazon', listings: 6, live: 2, partly_live: 1, in_progress: 1, problem: 1, ready_to_approve: 1, ready_to_publish: 0 },
      { marketplace: 'flipkart', listings: 3, live: 1, partly_live: 0, in_progress: 0, problem: 1, ready_to_approve: 0, ready_to_publish: 1 },
    ],
    needs_you: { total: 4, blocked: 1, blocked_without_issue: 0, own_work: 0, waiting_on_account: 0, questions: 1, ready_to_approve: 1, ready_to_publish: 1, publishing_paused: 0, improve: 2 },
    needs_you_items: [
      { kind: 'blocked', action: 'fix', product_id: P1, product_sku: 'KURTA-001', product_title: 'Block Print Kurta', marketplace: 'amazon', listing_id: L1, issue_id: ISSUE, issue: 'The title is longer than Amazon allows.', issue_count: 2, at: AT },
      { kind: 'question', action: 'answer', product_id: P1, product_sku: 'KURTA-001', product_title: 'Block Print Kurta', task_id: TASK, issue: 'What is the fabric?', issue_count: 0, at: AT },
      { kind: 'approve', action: 'approve', product_id: P1, product_sku: 'KURTA-001', product_title: 'Block Print Kurta', marketplace: 'amazon', listing_id: L2, issue: 'Written and checked. Review it and approve.', issue_count: 0, at: AT },
    ],
    activity: [
      { kind: 'write', state: 'pending', text: 'Writing the Amazon listing for Block Print Kurta', product_id: P1, product_title: 'Block Print Kurta', listing_id: L1, marketplace: 'amazon', needs_fix: 0, at: AT },
      { kind: 'send', state: 'failed', text: 'Could not send Block Print Kurta to Flipkart', product_id: P1, product_title: 'Block Print Kurta', listing_id: L2, marketplace: 'flipkart', needs_fix: 0, at: AT },
      { kind: 'import', state: 'completed', text: 'Imported your spreadsheet', needs_fix: 0, at: AT },
    ],
    marketplaces: [
      { marketplace: 'amazon', enabled: true, account: 'connected', publishing_enabled: false, next_step: 'fix' },
      { marketplace: 'flipkart', enabled: true, account: 'connected', publishing_enabled: true, next_step: 'fix' },
    ],
    products: 7,
    ...over,
  }
}
