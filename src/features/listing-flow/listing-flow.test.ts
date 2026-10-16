import { describe, expect, it } from 'vitest'
import { failedJobRemedy, logEntries } from './agent-run'
import { clock } from './format'
import { applicableRules, claimFindings, currentFindings, fieldGate, findingGate, gateCounts, rollUpGates, ruleGate, type ErrorItem } from './gates'
import { mappingRows, payloadField } from './mapping'
import { externalIdFromUrl, liveProof, maskId } from './proof'
import { approveAllTargets, editToContent, sendBackItem, validateEdit, validateSendBack } from './review-model'
import { runIsActive, runSteps } from './run-steps'
import { contentAuthor, type AuditEvent, type Listing, type Submission, type ValidationSummary } from '@/features/listings/model'

const V1 = '0b1c2d3e-0000-4000-8000-0000000004a1'
const V0 = '0b1c2d3e-0000-4000-8000-0000000004a0'

const item = (over: Partial<ErrorItem> = {}): ErrorItem => ({
  auto_fixable: false,
  error_code: 'MISSING_ATTRIBUTE',
  field: 'attributes.fabric_type',
  message: 'fabric_type is required',
  retryable: false,
  severity: 'error',
  source: 'rules_engine',
  ...over,
})

const report = (errors: ErrorItem[]) => ({ attempts_used: 1, max_attempts: 3, retryable: false, schema_version: '1', status: errors.length ? ('failed' as const) : ('passed' as const), errors })

const validation = (errors: ErrorItem[], version = V1): ValidationSummary => ({
  blocking_count: errors.filter((e) => e.severity === 'error').length,
  warning_count: errors.filter((e) => e.severity === 'warning').length,
  listing_id: 'l1',
  listing_version_id: version,
  passed: !errors.some((e) => e.severity === 'error'),
  schema_version: '1',
  stages: [
    {
      attempt: 1,
      created_at: '2026-10-16T10:40:00Z',
      duration_ms: 12,
      listing_id: 'l1',
      listing_version_id: version,
      marketplace: 'amazon',
      passed: !errors.length,
      report: report(errors),
      rules_version: 3,
      schema_version: '1',
      source: 'rules_engine',
      tenant_id: 't',
    },
  ],
})

const baseListing = { status: 'needs_review', status_reason: null, marketplace_state: 'not_submitted', current_version_id: V1, marketplace: 'amazon' } as const

describe('gates', () => {
  it('places findings by code, then class, then field', () => {
    expect(findingGate(item({ error_code: 'PRICE_ABOVE_MRP', field: 'attributes.mrp' }))).toBe('commercial')
    expect(findingGate(item({ error_code: 'VALUE_NOT_ALLOWED', error_class: 'media_error', field: 'x' }))).toBe('media')
    expect(findingGate(item({ error_code: 'MISSING_ATTRIBUTE', error_class: 'missing_data', field: 'attributes.color' }))).toBe('attributes')
    expect(findingGate(item({ error_code: 'MISSING_ATTRIBUTE', field: 'attributes.price' }))).toBe('commercial')
    expect(findingGate(item({ error_code: 'UNSUPPORTED_CLAIM', field: 'content.bullets[3]' }))).toBe('content')
    expect(findingGate(item({ error_code: 'MARKETPLACE_UNKNOWN_ERROR', field: '', source: 'amazon_adapter' }))).toBe('submission')
  })

  it('maps rules and field paths to gates', () => {
    expect(ruleGate({ rule_type: 'image_requirement', field: 'images' })).toBe('media')
    expect(ruleGate({ rule_type: 'banned_terms', field: '*' })).toBe('content')
    expect(ruleGate({ rule_type: 'required_attribute', field: 'attributes.color' })).toBe('attributes')
    expect(fieldGate('category')).toBe('classification')
    expect(fieldGate('')).toBeNull()
  })

  it('keeps only enabled rules of the marketplace and category (or every category)', () => {
    const rules = [
      { marketplace: 'amazon', category: null, enabled: true },
      { marketplace: 'amazon', category: 'womens_tshirts', enabled: true },
      { marketplace: 'amazon', category: 'lamps', enabled: true },
      { marketplace: 'flipkart', category: null, enabled: true },
      { marketplace: 'amazon', category: null, enabled: false },
    ] as const
    expect(applicableRules(rules, 'amazon', 'womens_tshirts')).toHaveLength(2)
  })

  it('never says passed without a check on the current version', () => {
    const gates = rollUpGates({ listing: baseListing, validation: null, rules: [{ rule_type: 'max_length', field: 'content.title' }], preview: null })
    expect(gates.every((g) => g.state === 'unchecked')).toBe(true)
    const stale = rollUpGates({ listing: baseListing, validation: validation([], V0), rules: [{ rule_type: 'max_length', field: 'content.title' }], preview: null })
    expect(stale.find((g) => g.id === 'content')!.state).toBe('unchecked')
  })

  it('passes covered gates, blocks gates with errors, leaves uncovered gates unchecked', () => {
    const gates = rollUpGates({
      listing: baseListing,
      validation: validation([item(), item({ severity: 'warning', error_code: 'BANNED_TERM', field: 'content.title' })]),
      rules: [
        { rule_type: 'max_length', field: 'content.title' },
        { rule_type: 'image_requirement', field: 'images' },
        { rule_type: 'required_attribute', field: 'attributes.fabric_type' },
      ],
      preview: { errors: [], productType: 'SHIRT' },
    })
    const by = Object.fromEntries(gates.map((g) => [g.id, g.state]))
    expect(by).toMatchObject({
      attributes: 'blocked',
      content: 'warning',
      media: 'passed',
      classification: 'passed',
      identity: 'unchecked',
      compliance: 'unchecked',
      commercial: 'unchecked',
      submission: 'unchecked',
    })
    expect(gateCounts(gates)).toMatchObject({ passed: 2, blocked: 1, warning: 1, total: 9 })
  })

  it('decides submission from the marketplace', () => {
    const g = (over: Partial<typeof baseListing> | Record<string, unknown>) =>
      rollUpGates({ listing: { ...baseListing, ...over } as typeof baseListing, validation: null, rules: null, preview: null }).find((x) => x.id === 'submission')!.state
    expect(g({ status: 'published', marketplace_state: 'live' })).toBe('passed')
    expect(g({ status: 'published', marketplace_state: 'processing' })).toBe('working')
    expect(g({ status: 'failed', status_reason: 'marketplace_rejected' })).toBe('blocked')
  })

  it('reads findings only from the current version and finds claims', () => {
    expect(currentFindings(validation([item()]), V0).checked).toBe(false)
    const cur = currentFindings(validation([item(), item({ error_code: 'UNSUPPORTED_CLAIM' })]), V1)
    expect(cur.findings).toHaveLength(2)
    expect(claimFindings(cur.findings)).toHaveLength(1)
  })
})

describe('run steps', () => {
  const job = (over: Record<string, unknown> = {}) => ({ kind: 'listing_generate' as const, status: 'running' as const, stage: null, ...over })
  const states = (s: ReturnType<typeof runSteps>) => s.map((x) => `${x.id}:${x.state}`)

  it('follows the generation stage while the job runs', () => {
    const s = runSteps({ job: job({ stage: 'keyword_agent' }), listing: { ...baseListing, status: 'generating' } as Listing })
    expect(states(s)).toEqual(['understand:done', 'write:now', 'check:todo', 'approve:todo', 'submit:todo', 'live:todo'])
    expect(s[1]!.sub).toBe('Choosing search terms…')
    expect(runSteps({ job: job({ status: 'queued' }), listing: null })[0]).toMatchObject({ state: 'now', sub: 'Waiting for a worker…' })
  })

  it('stops at approval after generation (approval is always on)', () => {
    const s = runSteps({ job: job({ status: 'succeeded', stage: 'quality_check' }), listing: { ...baseListing, status: 'needs_review' } as Listing, validation: { blocking: 0, warnings: 2 } })
    expect(states(s).slice(0, 4)).toEqual(['understand:done', 'write:done', 'check:done', 'approve:needs-you'])
    expect(s[2]!.sub).toBe('2 warnings to read')
  })

  it('marks the failed stage when the job fails', () => {
    const s = runSteps({ job: job({ status: 'failed', stage: 'validate_rules' }), listing: { ...baseListing, status: 'failed', status_reason: 'generation_failed' } as Listing })
    expect(s.find((x) => x.id === 'check')!.state).toBe('failed')
  })

  it('only marks live done with the same proof the Live screen needs', () => {
    const pub = (ms: string, liveConfirmed = false) =>
      runSteps({ job: { kind: 'listing_publish', status: 'succeeded', stage: null }, listing: { ...baseListing, status: 'published', marketplace_state: ms } as Listing, liveConfirmed })
    expect(pub('processing').find((x) => x.id === 'live')!.state).toBe('now')
    expect(pub('live', true).every((x) => x.state === 'done')).toBe(true)
    expect(pub('live').find((x) => x.id === 'live')).toMatchObject({ state: 'now', sub: 'Amazon reports it live. We can’t confirm it yet' })
    expect(pub('rejected').find((x) => x.id === 'submit')!.state).toBe('failed')
  })

  it('is not Working while it waits for a person or the marketplace', () => {
    const done = { kind: 'listing_generate' as const, status: 'succeeded' as const, stage: 'quality_check' as const }
    expect(runIsActive({ job: done, listing: { ...baseListing, status: 'validated' } as Listing })).toBe(false)
    expect(runIsActive({ job: { kind: 'listing_publish', status: 'succeeded', stage: null }, listing: { ...baseListing, status: 'published', marketplace_state: 'processing' } as Listing })).toBe(false)
    expect(runIsActive({ job: job({ stage: 'content_agent' }), listing: { ...baseListing, status: 'generating' } as Listing })).toBe(true)
    expect(runIsActive({ job: { kind: 'listing_publish', status: 'running', stage: null }, listing: { ...baseListing, status: 'publishing' } as Listing })).toBe(true)
  })

  it('sends a rejected listing back to approval', () => {
    const s = runSteps({ job: null, listing: { ...baseListing, status: 'blocked', status_reason: 'rejected' } as Listing })
    expect(s.find((x) => x.id === 'approve')).toMatchObject({ state: 'needs-you', sub: 'Sent back by a reviewer' })
  })
})

describe('live proof', () => {
  const sub = (over: Partial<Submission> = {}): Submission => ({
    attempt: 1,
    created_at: '2026-10-16T10:42:00Z',
    id: 's1',
    listing_version_id: V1,
    operation: 'create',
    outcome: 'live',
    requested_by_user_id: 'u',
    sent_at: '2026-10-16T10:42:00Z',
    resolved_at: '2026-10-16T10:51:00Z',
    items: [
      { listing_item_id: 'i1', marketplace_state: 'live', seller_sku: 'FSH-TEE-001-S' },
      { listing_item_id: 'i2', marketplace_state: 'live', seller_sku: 'FSH-TEE-001-M' },
    ],
    ...over,
  })

  it('reads the ID from the link the backend builds', () => {
    expect(externalIdFromUrl('https://www.amazon.in/dp/B0C9X12345')).toBe('B0C9X12345')
    expect(externalIdFromUrl('https://www.flipkart.com/p/itm1')).toBeNull()
    expect(maskId('B0C9X12345')).toBe('B0C9X••••')
  })

  it('says live only with state, ID and confirmation time', () => {
    const l = { status: 'published', marketplace_state: 'live', live_url: 'https://www.amazon.in/dp/B0C9X12345' } as const
    const ok = liveProof(l, null, [sub()])
    expect(ok.state).toBe('live')
    expect(ok.variants).toEqual({ live: 2, total: 2 })
    expect(liveProof({ ...l, live_url: null }, null, [sub()]).state).toBe('unconfirmed')
    expect(liveProof(l, null, [sub({ outcome: 'accepted', resolved_at: null })]).state).toBe('unconfirmed')
    expect(liveProof({ ...l, marketplace_state: 'processing' }, null, [sub({ outcome: 'accepted' })]).state).toBe('waiting')
  })

  it('says partly live instead of waiting when only some variants are live', () => {
    const l = { status: 'published', marketplace_state: 'partially_live', live_url: null } as const
    const p = liveProof(l, null, [
      sub({ outcome: 'accepted', resolved_at: null, items: [
        { listing_item_id: 'i1', marketplace_state: 'live', seller_sku: 'A' },
        { listing_item_id: 'i2', marketplace_state: 'rejected', seller_sku: 'B' },
      ] }),
    ])
    expect(p.state).toBe('partial')
    expect(p.variants).toEqual({ live: 1, total: 2 })
  })

  it('prefers the fresher status endpoint and handles never-sent listings', () => {
    const l = { status: 'approved', marketplace_state: 'not_submitted', live_url: null } as const
    expect(liveProof(l, null, []).state).toBe('not-sent')
    expect(liveProof(l, { status: 'published', marketplace_state: 'rejected' }, [sub({ outcome: 'rejected' })]).state).toBe('problem')
  })
})

describe('mapping rows', () => {
  it('matches marketplace fields by name only and flags rows with findings first', () => {
    const rows = mappingRows({
      attributes: { color: 'Jet Black', fabric_type: '95% cotton', sleeve: 'short' },
      payload: { productType: 'SHIRT', attributes: { color: [{ value: 'Black', marketplace_id: 'X' }], item_name: [{ value: 'T' }] } },
      rules: [
        { field: 'attributes.color', rule_type: 'required_attribute' },
        { field: 'attributes.fabric_type', rule_type: 'required_attribute' },
        { field: 'attributes.size', rule_type: 'conditional_required' },
      ],
      findings: [item()],
      checked: true,
    })
    expect(rows.map((r) => r.key)).toEqual(['fabric_type', 'color', 'size', 'sleeve'])
    expect(rows[0]).toMatchObject({ state: 'blocked', rule: 'Required', marketplaceField: null })
    expect(rows[1]).toMatchObject({ state: 'passed', marketplaceField: { name: 'color', value: 'Black' } })
    expect(rows[2]).toMatchObject({ yourValue: null, rule: 'Conditional' })
    expect(rows[3]).toMatchObject({ rule: 'No rule', state: 'unchecked' })
  })

  it('is unchecked without a validation on this version', () => {
    const rows = mappingRows({ attributes: { color: 'Black' }, payload: undefined, rules: [], findings: [], checked: false })
    expect(rows[0]!.state).toBe('unchecked')
  })

  it('formats measurement payloads', () => {
    expect(payloadField({ attributes: { item_weight: [{ value: 250, unit: 'grams' }] } }, 'item_weight')).toEqual({ name: 'item_weight', value: '250 grams' })
  })
})

describe('review rules', () => {
  it('needs a reason and a note to send back, and builds a reject item', () => {
    expect(validateSendBack({ reason: '', note: ' ', rewrite: true })).toEqual({ reason: 'Choose a reason.', note: 'Write what should change.' })
    expect(validateSendBack({ reason: 'poor_quality', note: 'x'.repeat(2001), rewrite: false }).note).toMatch(/2,000/)
    expect(sendBackItem({ id: 'l1', current_version_id: V1 }, { reason: 'inaccurate_fact', note: ' Fabric is wrong ', rewrite: true })).toEqual({
      listing_id: 'l1',
      listing_version_id: V1,
      decision: 'reject',
      reason_code: 'inaccurate_fact',
      feedback: 'Fabric is wrong',
      regenerate: true,
    })
  })

  it('validates the edit like ListingContent', () => {
    expect(validateEdit({ title: '', bullets: '\n', description: '' })).toEqual({
      title: 'Write a title.',
      bullets: 'Write at least one bullet, one per line.',
      description: 'Write a description.',
    })
    expect(validateEdit({ title: 'T', bullets: Array.from({ length: 11 }, (_, i) => `b${i}`).join('\n'), description: 'd' }).bullets).toBe('At most 10 bullets.')
    expect(editToContent({ title: ' T ', bullets: 'a\n\n b ', description: ' d ' })).toEqual({ title: 'T', bullets: ['a', 'b'], description: 'd' })
  })

  it('approves all only validated listings, and only with two or more', () => {
    const row = (id: string, status: Listing['status']) => ({ id, status, status_reason: null, current_version_id: `${id}v`, approved_version_id: null, marketplace: 'amazon' as const })
    expect(approveAllTargets([row('a', 'validated')])).toEqual([])
    expect(approveAllTargets([row('a', 'validated'), row('b', 'validated'), row('c', 'needs_review')]).map((r) => r.id)).toEqual(['a', 'b'])
  })
})

describe('agent log', () => {
  const ev = (over: Partial<AuditEvent>): AuditEvent => ({
    action: 'listing.approved',
    actor_type: 'user',
    actor_user_id: 'me',
    entity_id: 'l1',
    entity_type: 'listing',
    id: 'e1',
    occurred_at: '2026-10-16T10:45:00Z',
    ...over,
  })
  it('merges history with the job start and end, newest first', () => {
    const out = logEntries(
      [ev({}), ev({ id: 'e2', action: 'listing.rejected', actor_user_id: 'other', occurred_at: '2026-10-16T10:44:00Z', reason: 'off_brand_voice' })],
      { job_id: 'j', kind: 'listing_generate', status: 'failed', started_at: '2026-10-16T10:38:00Z', finished_at: '2026-10-16T10:39:00Z', error: report([item({ message: 'Model timed out' })]) },
      'me',
    )
    expect(out.map((e) => e.id)).toEqual(['e1', 'e2', 'j:end', 'j:start'])
    expect(out[0]!.text).toBe('Approved by you.')
    expect(out[1]).toMatchObject({ tone: 'need', text: 'Rejected by a teammate. Reason: off brand voice.' })
    expect(out[2]).toMatchObject({ tone: 'bad', text: 'Generation failed. Model timed out' })
  })
})

describe('clock', () => {
  it('shows the time today and the date otherwise', () => {
    const now = new Date('2026-10-16T12:00:00')
    expect(clock(new Date('2026-10-16T10:42:00').toISOString(), now)).toBe('10:42')
    expect(clock(new Date('2026-10-14T10:42:00').toISOString(), now)).toMatch(/14 Oct.*10:42/)
    expect(clock(null)).toBe('')
  })
})

describe('content author', () => {
  const ev = (action: string, after?: Record<string, unknown>): AuditEvent => ({
    action,
    actor_type: 'user',
    actor_user_id: 'u',
    entity_id: 'l1',
    entity_type: 'listing',
    id: action,
    occurred_at: '2026-10-16T10:45:00Z',
    ...(after ? { after } : {}),
  })
  it('lets the newest edit or regeneration decide, not the copied confidence score', () => {
    expect(contentAuthor([])).toBe('agent')
    expect(contentAuthor([ev('listing.approved'), ev('listing.edited')])).toBe('team')
    expect(contentAuthor([ev('listing.regenerate_requested'), ev('listing.edited')])).toBe('agent')
    expect(contentAuthor([ev('listing.rejected', { status: 'generating' }), ev('listing.edited')])).toBe('agent')
    expect(contentAuthor([ev('listing.rejected', { status: 'blocked' }), ev('listing.edited')])).toBe('team')
    expect(contentAuthor([ev('listing.approved')], false)).toBe('unknown')
    expect(contentAuthor(undefined)).toBe('unknown')
  })
})

describe('failed job remedy', () => {
  const on = { show: true, enabled: true }
  const off = { show: false, enabled: false }
  const acts = (o: Partial<Record<'retryFields' | 'publish' | 'regenerate', typeof on>> = {}) => ({
    retryFields: off,
    regenerate: on,
    ...o,
    publish: { ...(o.publish ?? off), label: 'Publish again' },
  })
  it('never offers a regeneration for a failed publish or status check', () => {
    expect(failedJobRemedy('listing_generate', acts())).toBe('regenerate')
    expect(failedJobRemedy('listing_publish', acts({ retryFields: on }))).toBe('retry-fields')
    expect(failedJobRemedy('listing_publish', acts({ publish: on }))).toBe('publish')
    expect(failedJobRemedy('listing_publish', acts())).toBe('status')
    expect(failedJobRemedy('listing_status_sync', acts({ publish: on }))).toBe('status')
  })
})
