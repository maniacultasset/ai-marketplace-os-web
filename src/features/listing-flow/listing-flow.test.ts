import { describe, expect, it } from 'vitest'
import { failedJobRemedy, logEntries } from './agent-run'
import { clock, fieldLabel, findingText, plainMessage, sellerFinding } from './format'
import { applicableRules, claimFindings, dedupeFindings, currentFindings, fieldGate, findingGate, gateCounts, issueFindings, rollUpGates, ruleGate, type ErrorItem } from './gates'
import { mappingRows, payloadField } from './mapping'
import { externalIdFromUrl, liveProof, maskId } from './proof'
import { answeredAfter, approveAllTargets, approveBlockers, editToContent, sendBackItem, titleLimitWarning, validateEdit, validateSendBack } from './review-model'
import { runIsActive, runSteps } from './run-steps'
import { contentAuthor, listingActions, type AuditEvent, type Listing, type Submission, type ValidationSummary } from '@/features/listings/model'

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
      // image_requirement is stored but never evaluated by the backend, so it is no evidence.
      media: 'unchecked',
      classification: 'passed',
      identity: 'unchecked',
      compliance: 'unchecked',
      commercial: 'unchecked',
      submission: 'unchecked',
    })
    expect(gateCounts(gates)).toMatchObject({ passed: 1, blocked: 1, warning: 1, total: 9 })
  })

  const media = (input: Partial<Parameters<typeof rollUpGates>[0]>) =>
    rollUpGates({ listing: baseListing, validation: validation([]), rules: null, preview: null, ...input }).find((g) => g.id === 'media')!

  it('blocks media when the listing has no image, naming the marketplace', () => {
    for (const name of ['Amazon', 'Flipkart']) {
      const g = media({ imageCount: 0, marketplaceName: name, rules: [{ rule_type: 'image_requirement', field: 'images' }] })
      expect(g.state).toBe('blocked')
      expect(g.findings).toEqual([])
      expect(g.note).toBe(`Add at least one image. ${name} needs a main image.`)
    }
    expect(media({ imageCount: 0 }).note).toBe('Add at least one image. The marketplace needs a main image.')
  })

  it('folds the open blocking issues the server counts into the gates (prod demo 9 Nov)', () => {
    // three failed stored photo checks: the header said "Needs your info · 3", Review "0 need you"
    const photo = (code: string, over: Record<string, unknown> = {}) => ({
      status: 'open' as const,
      severity: 'error' as const,
      listing_version_id: V1,
      field_path: 'images[0]',
      error_code: 'IMAGE_NON_COMPLIANT' as const,
      error_class: 'media_error' as const,
      source: 'vision_model' as const,
      message: `image check failed: ${code}`,
      plain_message: null,
      marketplace_code: code,
      auto_fixable: false,
      ...over,
    })
    const rows = [
      photo('BACKGROUND_OFF'),
      photo('RESOLUTION_LOW', { listing_version_id: null }),
      photo('WRONG_ASPECT'),
      photo('OLD', { listing_version_id: V0 }), // an older version's row is history
      photo('WARN', { severity: 'warning' }), // a warning never blocks
      photo('SHUT', { status: 'resolved' }),
    ]
    const issues = issueFindings(rows as never, V1)
    expect(issues.map((i) => i.raw_code)).toEqual(['BACKGROUND_OFF', 'RESOLUTION_LOW', 'WRONG_ASPECT'])
    const g = media({ imageCount: 1, issues })
    expect(g).toMatchObject({ state: 'blocked', note: '3 blocking issues' })
    const gates = rollUpGates({ listing: baseListing, validation: validation([]), rules: null, preview: null, imageCount: 1, issues })
    expect(gateCounts(gates).blocked).toBe(1)
    // the same gap from the rules run and an issue counts once
    const twice = rollUpGates({
      listing: baseListing,
      validation: validation([item({ field: 'images[0]', error_code: 'IMAGE_NON_COMPLIANT' })]),
      rules: null,
      preview: null,
      issues: issueFindings([photo('X', { raw_code: undefined })] as never, V1),
    })
    expect(twice.find((x) => x.id === 'media')!.findings).toHaveLength(1)
  })

  it('offers Regenerate on Review for a fact answered after the version was written', () => {
    const t = (over: Record<string, unknown>) => ({ kind: 'missing_fact' as const, product_id: 'p1', answered_at: '2026-11-09T10:00:00Z', ...over })
    expect(answeredAfter([t({})], 'p1', '2026-11-09T09:00:00Z')).toBe(true)
    expect(answeredAfter([t({})], 'p1', '2026-11-09T11:00:00Z')).toBe(false) // a newer version uses it
    expect(answeredAfter([t({ product_id: 'p2' })], 'p1', '2026-11-09T09:00:00Z')).toBe(false)
    expect(answeredAfter([t({ kind: 'image_replacement' })], 'p1', '2026-11-09T09:00:00Z')).toBe(false)
    expect(answeredAfter([t({ answered_at: null })], 'p1', '2026-11-09T09:00:00Z')).toBe(false)
    expect(answeredAfter([t({})], 'p1', null)).toBe(false)
  })

  it('passes media only on a vision check of the current version', () => {
    const withVision = (version = V1): ValidationSummary => {
      const v = validation([])
      return { ...v, stages: [...v.stages!, { ...v.stages![0]!, listing_version_id: version, source: 'vision_model' }] }
    }
    expect(media({ imageCount: 2, validation: withVision() })).toMatchObject({ state: 'passed', note: 'Passed the image checks.' })
    expect(media({ imageCount: 2, validation: withVision(V0) }).state).toBe('unchecked')
    expect(media({ imageCount: 2 })).toMatchObject({ state: 'unchecked', note: 'Not checked yet.' })
    expect(media({ imageCount: null, validation: withVision() }).state).toBe('unchecked')
    expect(media({ imageCount: 2, rules: [{ rule_type: 'image_requirement', field: 'images' }] }).state).toBe('unchecked')
  })

  it('still blocks media on an image finding', () => {
    const v = validation([item({ error_code: 'IMAGE_NON_COMPLIANT', field: 'images[0]' })])
    expect(media({ imageCount: 2, validation: v }).state).toBe('blocked')
  })

  it('never passes a gate from a rule type the backend does not evaluate', () => {
    for (const rule_type of ['fact_source', 'fact_backed_attribute'] as const) {
      const gates = rollUpGates({ listing: baseListing, validation: validation([]), rules: [{ rule_type, field: 'attributes.x' }], preview: null })
      expect(gates.find((g) => g.id === 'attributes')!.state).toBe('unchecked')
    }
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
    // Past tense only once a step is done: the step in progress and the ones after it read as tasks.
    expect(s.map((x) => x.label)).toEqual([
      'Understood the product',
      'Write titles and bullets',
      'Check against the rules',
      'Your approval',
      'Send to the marketplace',
      'Confirm live',
    ])
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
    expect(pub('live', true).map((x) => x.label)).toEqual(['Understood the product', 'Wrote titles and bullets', 'Checked against the rules', 'Approved', 'Sent', 'Confirmed live'])
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

  it('says live but not buyable for a published, inactive listing, with its ASIN (SI9)', () => {
    const l = { status: 'published', marketplace_state: 'inactive', live_url: null, external_id: 'B0C9X12345' } as const
    const p = liveProof(l, null, [sub({ outcome: 'accepted', resolved_at: null })])
    expect(p.state).toBe('not-buyable')
    expect(p.externalId).toBe('B0C9X12345')
    // Without SI9 the ID still comes from the link.
    expect(liveProof({ ...l, external_id: undefined, live_url: 'https://www.amazon.in/dp/B0AAAAAAAA' }, null, []).externalId).toBe('B0AAAAAAAA')
    // Inactive while blocked is still a problem.
    expect(liveProof({ ...l, status: 'blocked' }, null, []).state).toBe('problem')
  })
})

describe('approve gate (SI9, SI10)', () => {
  const base = {
    listing: { status: 'validated', status_reason: null, current_version_id: V1, approved_version_id: null },
    validation: { passed: true, listing_version_id: V1 },
    can: () => true,
    publishBuilt: true,
  } as const

  it('follows the server’s can_approve and approve_hint over the history guess', () => {
    expect(listingActions({ ...base, maker: 'edited', canApprove: true }).approve.enabled).toBe(true)
    const own = listingActions({ ...base, canApprove: false, approveHint: 'own_work' }).approve
    expect(own).toMatchObject({ enabled: false, reason: 'You made this version, so a teammate approves it.' })
    expect(listingActions({ ...base, canApprove: false, approveHint: 'no_other_approver' }).approve.reason).toMatch(/Invite one in Team/)
  })

  it('falls back to the history when the backend sends no can_approve', () => {
    expect(listingActions({ ...base, maker: 'edited', canApprove: null }).approve.enabled).toBe(false)
    expect(listingActions({ ...base, maker: null }).approve.enabled).toBe(true)
  })

  it('reads the blocking items from a refused approve', () => {
    const warn = item({ severity: 'warning', field: 'title', message: 'Long title' })
    const block = item({ field: 'attributes.department', message: 'Department is required' })
    const res = {
      items: [
        {
          listing_id: 'l1',
          http_status: 422,
          error: { ...report([warn, block]), error_code: 'VALIDATION_FAILED' as const },
        },
        { listing_id: 'l2', http_status: 200 },
      ],
    }
    expect(approveBlockers(res, 'l1')).toEqual([block, warn])
    expect(approveBlockers(res, 'l2')).toBeNull()
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
    expect(validateEdit({ title: 'T', bullets: Array.from({ length: 11 }, (_, i) => `b${i}`).join('\n'), description: 'd' }).bullets).toBe('Use 10 bullets or fewer.')
    expect(editToContent({ title: ' T ', bullets: 'a\n\n b ', description: ' d ' })).toEqual({ title: 'T', bullets: ['a', 'b'], description: 'd' })
  })

  it('counts code points like the backend and refuses stray control characters', () => {
    // 2,000 emoji is 2,000 code points (4,000 UTF-16 units): still a valid note.
    expect(validateSendBack({ reason: 'poor_quality', note: '\u{1F642}'.repeat(2000), rewrite: true }).note).toBeUndefined()
    expect(validateSendBack({ reason: 'poor_quality', note: 'Fix\u0000this', rewrite: true }).note).toMatch(/control character/)
    // Line breaks and tabs are ordinary text in a note.
    expect(validateSendBack({ reason: 'poor_quality', note: 'Line one\n\tLine two', rewrite: true })).toEqual({})
    expect(validateEdit({ title: '\u{1F642}'.repeat(500), bullets: 'राहुल का कुर्ता', description: 'd' })).toEqual({})
    expect(validateEdit({ title: 'x'.repeat(501), bullets: 'a', description: 'd' }).title).toBe('Shorten the title to 500 characters or fewer.')
    expect(validateEdit({ title: 'T', bullets: `ok\n${'b'.repeat(1001)}`, description: 'd' }).bullets).toBe('Shorten bullet 2 to 1,000 characters or fewer.')
    expect(validateEdit({ title: 'T', bullets: 'a', description: 'd'.repeat(5001) }).description).toMatch(/5,000 characters or fewer/)
    expect(validateEdit({ title: 'T\u0007', bullets: 'a', description: 'd' }).title).toMatch(/control character/)
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
    expect(out[1]).toMatchObject({ tone: 'need', text: 'Rejected by a teammate. Reason: Off-brand voice.' })
    expect(out[2]).toMatchObject({ tone: 'bad', text: 'Generation failed. Model timed out' })
  })
  it('shows the reviewer note and drops internal reasons', () => {
    const out = logEntries(
      [
        ev({ id: 'r', action: 'listing.rejected', reason: 'inaccurate_fact', after: { status: 'blocked', note: 'The fabric is linen, not cotton.' } }),
        ev({ id: 'f', action: 'listing.auto_fixed', actor_type: 'system', reason: '[reformat content.title v1 a863fddbec2b1e22->89ed92f714419dba]', occurred_at: '2026-10-16T10:44:00Z' }),
        ev({ id: 'p', action: 'listing.publish_requested', reason: 'publish', occurred_at: '2026-10-16T10:43:00Z' }),
      ],
      { job_id: 'j', kind: 'listing_generate', status: 'succeeded', started_at: null, finished_at: null, error: null },
      'me',
    )
    expect(out[0]!.text).toBe('Rejected by you. Reason: Inaccurate fact. Note: “The fabric is linen, not cotton.”')
    expect(out[1]!.text).toBe('Fixed automatically by the agent.')
    expect(out[2]!.text).toBe('Asked to publish by you.')
  })
})

describe('field label', () => {
  it('names finding and claim paths in plain words', () => {
    expect(fieldLabel('content.title')).toBe('Title')
    expect(fieldLabel('content.bullets[0]')).toBe('Bullet 1')
    expect(fieldLabel('content.bullets[3]')).toBe('Bullet 4')
    expect(fieldLabel('content.description')).toBe('Description')
    expect(fieldLabel('keywords.search_terms')).toBe('Search terms')
    expect(fieldLabel('attributes.fabric_type')).toBe('Fabric type')
    expect(fieldLabel('images[1]')).toBe('Image 2')
    expect(fieldLabel('category')).toBe('Category')
    expect(fieldLabel('variants.size_map')).toBe('Variants size map')
    expect(fieldLabel('')).toBe('The listing')
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

describe('title limit in the editor', () => {
  it('warns at the marketplace limit, before the save is blocked', () => {
    expect(titleLimitWarning('x'.repeat(231), 'amazon', 'Amazon')).toBe('Amazon allows 200 characters. Shorten the title, or this version will be blocked by the checks.')
    expect(titleLimitWarning('x'.repeat(200), 'amazon', 'Amazon')).toBeNull()
    expect(titleLimitWarning('x'.repeat(151), 'flipkart', 'Flipkart')).toMatch(/150 characters/)
  })
})

describe('one problem, one finding', () => {
  it('drops a second report of the same field and code', () => {
    const f = (source: string) => ({ field: 'attributes.color', error_code: 'MISSING_ATTRIBUTE', source }) as never
    expect(dedupeFindings([f('rules_engine'), f('schema')])).toHaveLength(1)
  })
  it('speaks to the seller: sentence case, no agent guidance, "sent" only for a marketplace answer', () => {
    const t = findingText({ message: 'the color attribute is required for this category', suggestion: 'Set attributes.color from the product data.', source: 'rules_engine', value_submitted: 'Indigo' })
    expect(t).toEqual({ message: 'The color attribute is required for this category.', suggestion: null, value: 'value “Indigo”' })
    expect(findingText({ message: 'x', source: 'amazon_adapter', value_submitted: 'Indigo' }).value).toBe('sent “Indigo”')
  })
})

describe('plainMessage', () => {
  it('names raw field keys in the product form words (prod QA 9 Nov)', () => {
    expect(plainMessage('country_of_origin is required')).toBe('Country of origin is required')
    expect(plainMessage('attributes.selling_price must be at most mrp')).toBe('Selling price must be at most mrp')
    expect(plainMessage('fit_type is missing')).toBe('Fit type is missing')
    expect(plainMessage('The title is too long.')).toBe('The title is too long.')
  })
})

describe('sellerFinding (prod QA 9 Nov, item 25)', () => {
  it('never shows the agent guidance or raw keys', () => {
    const missing = sellerFinding({
      field: 'attributes.color',
      error_code: 'MISSING_ATTRIBUTE',
      message: 'the color attribute is required for this category',
      suggestion: 'Set attributes.color from the product data. If the source does not state it, leave it unset and flag the row rather than guessing.',
    })
    expect(missing).toEqual({ message: 'Colour is required for this category.', action: 'Add colour on the product page, then check again.' })
    const other = sellerFinding({
      field: 'attributes.fabric_type',
      error_code: 'VALUE_NOT_ALLOWED',
      message: 'the fabric_type attribute is not allowed',
      suggestion: 'Set attributes.fabric_type from the product data.',
    })
    expect(other.message).toBe('The Fabric type attribute is not allowed')
    expect(other.action).toBe('Fix fabric type on the product page, then check again.')
    expect(sellerFinding({ field: 'content.title', message: 'Title is too long.', suggestion: 'Keep it under 200 characters.' })).toEqual({
      message: 'Title is too long.',
      action: 'Keep it under 200 characters.',
    })
  })
})
