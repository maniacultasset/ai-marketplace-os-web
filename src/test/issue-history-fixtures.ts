/** Builders for the issue history read (GET /listings/{id}/issue-history) in tests. */
import type { Fix, HistoryIssue, IssueHistory } from '@/features/listing-flow/issue-history-model'

const AT = '2026-11-11T10:00:00Z'

export function issue(over: Partial<HistoryIssue> = {}): HistoryIssue {
  return {
    id: 'issue-1',
    field: 'attributes.color',
    error_code: 'VALUE_NOT_ALLOWED',
    group: 'content_data',
    handler: 'you',
    lane: 'seller',
    status: 'open',
    marketplace_code: '90244',
    marketplace_message: "The value for 'color' is not one of the allowed values.",
    cause: 'Amazon accepts only values from its own list for this detail, and the value sent is not on it.',
    action: "Pick a value from Amazon's list for that detail, then send the listing again.",
    value_submitted: 'navy blue',
    occurrences: 1,
    first_seen_at: AT,
    last_seen_at: AT,
    resolved_at: null,
    ...over,
  }
}

export function fix(over: Partial<Fix> = {}): Fix {
  return {
    id: 'fix-1',
    issue_id: null,
    kind: 'repair',
    field: 'attributes.color',
    rule: 'enum_fold',
    before: 'navy blue',
    after: 'Navy Blue',
    reason: 'The marketplace accepts only values from its own list, so Kuinn sent the matching value from that list.',
    outcome: 'waiting',
    at: AT,
    suggested: false,
    ...over,
  }
}

export function history(over: Partial<IssueHistory> = {}): IssueHistory {
  return {
    marketplace: 'amazon',
    counts: { fixed: 0, fixing: 0, needs_you: 0, marketplace: 0, staff: 0 },
    issues: [],
    fixes: [],
    attempts: [],
    ...over,
  }
}
