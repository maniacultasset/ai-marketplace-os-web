/**
 * While Amazon publishing is switched off (GET /tenants/me capabilities.amazon_publishing_enabled
 * false), no screen offers Publish, retry or resend for Amazon, and an approved Amazon listing reads
 * "Approved · publishing paused" everywhere. Approve stays available.
 */
import { describe, expect, it } from 'vitest'
import type { Schema } from '@/api/types'
import { AMAZON_PUBLISHING_PAUSED_TEXT } from '@/features/brand/api'
import { publishCounts, needsYouTile, summarizeListings } from '@/features/home-inbox/model'
import { accountTaskHelp } from '@/features/inbox/model'
import { listingActions } from '@/features/listings/model'
import { bucketOf, cellChip, OVERALL_CHIP, overallStatus } from '@/features/products-add/catalog-model'
import { APPROVED_PAUSED_LABEL, listingChip } from '@/lib/listing-chip'
import { failedJobRemedy } from './agent-run'
import { notSentHero, publishGate } from './publishing'
import { resolutionHeadline } from './resolution-model'
import { runSteps } from './run-steps'

type Listing = Schema<'ListingOut'>

const PAUSED = { amazonPublishingPaused: true }
const V = '00000000-0000-4000-8000-000000000001'

const row = (over: Partial<Listing>): Listing =>
  ({
    id: '00000000-0000-4000-8000-0000000000aa',
    product_id: '00000000-0000-4000-8000-0000000000bb',
    marketplace: 'amazon',
    status: 'approved',
    marketplace_state: 'not_submitted',
    current_version_id: V,
    approved_version_id: V,
    status_reason: null,
    status_changed_at: '2026-11-09T10:00:00Z',
    updated_at: '2026-11-09T10:00:00Z',
    ...over,
  }) as Listing

describe('listing chip while Amazon publishing is paused', () => {
  it('an approved Amazon listing says Approved · publishing paused, never Ready to list', () => {
    expect(listingChip(row({}), PAUSED)).toEqual({ status: 'paused', label: APPROVED_PAUSED_LABEL })
    expect(APPROVED_PAUSED_LABEL).toBe('Approved · publishing paused')
  })

  it('publishing on, another marketplace, or another status: the chip is unchanged', () => {
    expect(listingChip(row({})).label).toBe('Ready to list')
    expect(listingChip(row({}), { amazonPublishingPaused: false }).label).toBe('Ready to list')
    expect(listingChip(row({ marketplace: 'flipkart' }), PAUSED).label).toBe('Ready to list')
    expect(listingChip(row({ status: 'validated' }), PAUSED).label).toBe('Ready to approve')
    expect(listingChip(row({ status: 'published', marketplace_state: 'live' }), PAUSED).label).toBe('Live')
  })
})

describe('Products list and product overview card', () => {
  it('a product whose Amazon listing is approved is Publishing paused, in In progress, not Needs you', () => {
    const o = overallStatus([row({})], PAUSED)
    expect(o).toBe('paused')
    expect(OVERALL_CHIP[o]).toEqual({ status: 'paused', label: 'Publishing paused' })
    expect(bucketOf(o)).toBe('progress')
    expect(cellChip(row({}), PAUSED).label).toBe(APPROVED_PAUSED_LABEL)
  })

  it('publishing on: Ready to list, counted in Needs you, as before', () => {
    expect(overallStatus([row({})])).toBe('ready-to-list')
    expect(bucketOf(overallStatus([row({})]))).toBe('needs-you')
  })

  it('a listing still waiting for approval keeps Awaiting approval (Approve stays)', () => {
    expect(overallStatus([row({}), row({ marketplace: 'flipkart', status: 'validated' })], PAUSED)).toBe('ready')
  })
})

describe('Home', () => {
  const snapshot = summarizeListings([row({}), row({ marketplace: 'flipkart' }), row({})], true)

  it('counts approved Amazon listings apart', () => {
    expect(snapshot).toMatchObject({ publish: 3, publishAmazon: 2 })
  })

  it('paused: approved Amazon listings are never "to publish"; they are said as paused', () => {
    expect(publishCounts(snapshot, { paused: true, known: true }, true)).toEqual({ publish: 1, paused: 2 })
    const t = needsYouTile(
      { tasks: { n: 0, more: false }, issues: { n: 0, more: false }, approve: 0, publish: 0, paused: 2, snapshotComplete: true },
      1000,
    )
    expect(t).toMatchObject({ value: '0', caption: 'Nothing needs you right now.', aside: '2 listings approved · publishing paused.' })
    expect(t.caption).not.toMatch(/publish/i)
  })

  it('Amazon approvals wait for the tenant read, so "ready to publish" is never said and taken back', () => {
    expect(publishCounts(snapshot, { paused: false, known: false }, true)).toEqual({ publish: 1, paused: 0 })
    expect(publishCounts(snapshot, { paused: false, known: true }, true)).toEqual({ publish: 3, paused: 0 })
    expect(publishCounts(snapshot, { paused: false, known: true }, false)).toEqual({ publish: 0, paused: 0 })
  })
})

describe('agent run screen', () => {
  const failedPublish = row({ status: 'failed', status_reason: 'publish_failed' })
  const actions = (paused: boolean) =>
    listingActions({ listing: failedPublish, can: () => true, publishBuilt: publishGate('amazon', { paused, known: true }, true).publishBuilt })

  it('paused: a failed publish offers no Publish or retry, only the status', () => {
    const a = actions(true)
    expect(a.publish.show).toBe(false)
    expect(a.retryFields.show).toBe(false)
    expect(failedJobRemedy('listing_publish', a)).toBe('status')
  })

  it('publishing on: the retry is offered as before', () => {
    expect(failedJobRemedy('listing_publish', actions(false))).toBe('retry-fields')
  })

  it('paused: Approve stays available on a listing waiting for review', () => {
    const a = listingActions({
      listing: row({ status: 'validated', approved_version_id: null }),
      validation: { passed: true, listing_version_id: V },
      can: () => true,
      publishBuilt: publishGate('amazon', { paused: true, known: true }, true).publishBuilt,
    })
    expect(a.approve.show).toBe(true)
    expect(a.publish.show).toBe(false)
  })

  it('the send step of an approved listing says publishing is paused', () => {
    const steps = runSteps({ job: null, listing: row({}), publishingPaused: true })
    expect(steps.find((s) => s.id === 'submit')).toMatchObject({ state: 'todo', sub: 'Publishing paused' })
    expect(runSteps({ job: null, listing: row({}) }).find((s) => s.id === 'submit')?.sub).toBeUndefined()
  })
})

describe('listing live screen', () => {
  it('paused: an approved listing not sent yet reads Approved · publishing paused, never "it goes out"', () => {
    expect(notSentHero('Kurta set', 'Amazon', { paused: true, approved: true })).toEqual({
      title: `Kurta set: ${APPROVED_PAUSED_LABEL}`,
      line: AMAZON_PUBLISHING_PAUSED_TEXT,
    })
    expect(notSentHero('Kurta set', 'Amazon', { paused: true, approved: false }).line).toBe(AMAZON_PUBLISHING_PAUSED_TEXT)
  })

  it('publishing on: the old line', () => {
    expect(notSentHero('Kurta set', 'Amazon').line).toBe('It goes out after a person approves it and it is published.')
  })
})

describe('resolution card and Inbox', () => {
  const fixReady = { state: 'fix_ready' as const, attempts: [], cycles_used: 1, max_cycles: 3 }

  it('paused: a fix is approved, never "approve to resend"', () => {
    const h = resolutionHeadline(fixReady, { marketplace: 'amazon', publishingPaused: true })
    expect(h.title).toBe('Fix ready to approve')
    expect(`${h.title} ${h.line}`).not.toMatch(/resend|sent again/)
    expect(resolutionHeadline(fixReady, { marketplace: 'amazon' }).title).toBe('Fix ready: approve to resend')
  })

  it('paused: an account task does not promise a send', () => {
    expect(accountTaskHelp('permission_decision', 'amazon', true)).not.toMatch(/send it again/)
    expect(accountTaskHelp('permission_decision', 'amazon', true)).toMatch(/paused for now/)
    expect(accountTaskHelp('permission_decision', 'amazon')).toMatch(/send it again/)
  })
})
