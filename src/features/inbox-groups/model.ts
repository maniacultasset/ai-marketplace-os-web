/**
 * G1 "Answer once for all products": the Inbox grouped (GET /inbox/groups) and one answer for
 * many products (POST /inbox/groups/answer). Pure: no React, no network, unit tested.
 *
 * Contract (backend `services/inbox_groups.py`, `services/inbox_groups_model.py`):
 *   - a group is identical open items across the brand's products: the same question kind,
 *     field family and answer spec, or the same issue code, field family, marketplace and severity;
 *   - `scope` says how a group is answered: `product_fact` and `exemption` take one answer for
 *     many tasks; `brand` is set once on the brand profile; `per_item` is opened item by item;
 *   - `total_items` is the summary's `inbox` count for the view (B16): the groups never change
 *     what the header, the tabs or the sidebar badge count.
 */
import type { Schema } from '@/api/types'
import { MARKETPLACE_LABEL } from '@/features/inbox/model'
import { fieldLabel } from '@/features/listing-flow/format'
import { factLabel } from '@/features/photo-facts/model'
import type { InboxItem, InboxView } from '@/features/home-inbox/model'
import { issueTitle } from '@/features/home-inbox/model'

type RawGroups = Schema<'InboxGroupsOut'>
type RawGroup = Schema<'InboxGroupOut'>
type RawMember = Schema<'InboxGroupMemberOut'>
/** A member with its defaulted list filled in. */
export type GroupMember = Omit<RawMember, 'listing_ids'> & { listing_ids: string[] }
/** A group with its defaulted lists filled in (`normalizeGroups`). */
export type InboxGroup = Omit<RawGroup, 'members' | 'categories'> & { members: GroupMember[]; categories: string[] }
export type InboxGroups = Omit<RawGroups, 'groups'> & { groups: InboxGroup[] }
export type GroupAnswerOut = Schema<'InboxGroupAnswerOut'>
export type GroupSkipped = Schema<'SkippedOut'>
export type SkipReason = GroupSkipped['reason']
export type RedraftSection = NonNullable<Schema<'RegenerateRequest'>['sections']>[number]
/** Why a listing is not redrafted now (backend `AffectedListingOut.reason`). */
export type RedraftReason = 'other_questions_open' | 'busy' | 'paused'
/**
 * One affected listing. `reason` says why `redraft` is false, `open_questions` how many other
 * questions it still waits on, `sections` the sections the answered fact feeds (regenerate only
 * those, `for_answers: true`). Optional: an older backend sends only `redraft`.
 */
export type AffectedListing = Schema<'AffectedListingOut'> & {
  reason?: RedraftReason | null
  open_questions?: number | null
  sections?: RedraftSection[] | null
}
export type GroupScope = InboxGroup['scope']
export type AnswerScalar = Schema<'InboxGroupAnswerIn'>['value']
type InboxCounts = Schema<'HomeSummaryOut'>['inbox']

/** Task ids one POST /inbox/groups/answer takes (backend ANSWER_IDS_MAX). */
export const ANSWER_CHUNK = 100

/** The read with the lists the contract defaults to `[]` filled in. */
export function normalizeGroups(raw: RawGroups): InboxGroups {
  return {
    ...raw,
    groups: (raw.groups ?? []).map((g) => ({
      ...g,
      categories: g.categories ?? [],
      members: (g.members ?? []).map((m) => ({ ...m, listing_ids: m.listing_ids ?? [] })),
    })),
  }
}

/* ------------------------------------------------------------------------------ Keys */

export const groupItemKey = (key: string) => `group:${key}`

/** The open item one member stands for, as the Inbox addresses it (`task:<id>`, `issue:<id>`). */
export function memberItemKey(m: Pick<GroupMember, 'task_id' | 'issue_id'>): string | null {
  if (m.task_id) return `task:${m.task_id}`
  if (m.issue_id) return `issue:${m.issue_id}`
  return null
}

/** A group of one shows as the item itself, exactly as the ungrouped list shows it. */
export function singleItem(g: InboxGroup): InboxItem | null {
  if (g.count !== 1) return null
  if (g.item_kind === 'task' && g.sample_task) return { kind: 'task', id: g.sample_task.id, at: g.sample_task.created_at, task: g.sample_task }
  if (g.item_kind === 'issue' && g.sample_issue) return { kind: 'issue', id: g.sample_issue.id, at: g.sample_issue.last_seen_at, issue: g.sample_issue }
  return null
}

/** Each member's item key to its group and member row, for drill-down and selection. */
export function memberIndex(groups: readonly InboxGroup[]): Map<string, { group: InboxGroup; member: GroupMember }> {
  const out = new Map<string, { group: InboxGroup; member: GroupMember }>()
  for (const group of groups)
    for (const member of group.members) {
      const k = memberItemKey(member)
      if (k && !out.has(k)) out.set(k, { group, member })
    }
  return out
}

/* ------------------------------------------------------------------------------ Counts */

/** The summary count a view's groups add up to (B16: one definition). */
export function viewCount(inbox: InboxCounts, view: InboxView): number {
  if (view === 'questions') return inbox.questions
  if (view === 'issues') return inbox.issues
  return inbox.open_items
}

/** Items in the listed groups. Equals `total_items` unless `more` cut the list. */
export const groupsTotal = (groups: readonly Pick<InboxGroup, 'count'>[]) => groups.reduce((n, g) => n + g.count, 0)

/**
 * Whether the groups and the summary count the same items: Σ count = total_items (unless the list
 * was cut) and total_items = the summary's count for the view. False means one of the two reads
 * is older than the other; the next re-read settles it. The header always shows the summary.
 */
export function countsAgree(data: Pick<InboxGroups, 'groups' | 'total_items' | 'more'>, inbox: InboxCounts | undefined, view: InboxView): boolean {
  if (!data.more && groupsTotal(data.groups) !== data.total_items) return false
  return !inbox || viewCount(inbox, view) === data.total_items
}

/* ------------------------------------------------------------------------------ Copy */

const n = (x: number) => x.toLocaleString('en-IN')
const products = (x: number) => `${n(x)} ${x === 1 ? 'product needs' : 'products need'}`

/** What the group asks about, in words, lower case after the first word ("the gender"). */
function fieldWords(g: Pick<InboxGroup, 'field'>): string {
  return g.field ? factLabel(g.field).replace(/^([A-Z])(?=[a-z])/, (c) => c.toLocaleLowerCase('en')) : 'an answer'
}

/**
 * The card title: "34 products need a manufacturer", "34 products need a barcode", "12 products
 * need the gender", "34 photos need replacing", else "5 listings: Value not allowed".
 */
export function groupTitle(g: Pick<InboxGroup, 'item_kind' | 'scope' | 'field' | 'task_kind' | 'error_code' | 'products' | 'listings' | 'count'>): string {
  if (g.item_kind === 'issue') {
    const listings = Math.max(g.listings, 1)
    return `${n(listings)} ${listings === 1 ? 'listing' : 'listings'}: ${g.error_code ? issueTitle({ error_code: g.error_code }) : 'Something to fix'}`
  }
  const p = Math.max(g.products, 1)
  if (g.task_kind === 'image_replacement') return `${n(g.count)} ${g.count === 1 ? 'photo needs' : 'photos need'} replacing`
  if (g.scope === 'brand' || g.field === 'manufacturer') return `${products(p)} a manufacturer`
  if (g.scope === 'exemption' || g.field === 'identifier') return `${products(p)} a barcode`
  if (g.field) return `${products(p)} the ${fieldWords(g)}`
  return `${products(p)} an answer`
}

/** The card meta: "Blocks 68 listings" or "Improves 12 listings", and the marketplace for issues. */
export function groupMeta(g: Pick<InboxGroup, 'blocking' | 'listings' | 'marketplace' | 'item_kind' | 'field'>): string {
  const listings = `${n(g.listings)} ${g.listings === 1 ? 'listing' : 'listings'}`
  const parts = [g.listings > 0 ? `${g.blocking ? 'Blocks' : 'Improves'} ${listings}` : null]
  if (g.item_kind === 'issue') {
    if (g.marketplace) parts.push(MARKETPLACE_LABEL[g.marketplace])
    if (g.field) parts.push(fieldLabel(g.field.replace(/\[\]/g, '')))
  }
  return parts.filter(Boolean).join(' · ')
}

export const SKIP_COPY: Record<SkipReason, string> = {
  has_value: 'Has its own value. Kept as it is.',
  closed: 'Already answered or closed.',
  not_allowed: 'Not accepted for this product’s category.',
  wrong_level: 'Set on the style or on each size instead. Open the product to set it.',
  gone: 'No longer in your Inbox.',
}

/** The kept-row label: a barcode for the exemption, else the product's own value. */
export const keptLabel = (scope: GroupScope) => (scope === 'exemption' ? 'Has a barcode. Kept.' : 'Has its own value. Kept as it is.')

/* ------------------------------------------------------------------------------ Answer */

/** Members one answer can go to: an open question without a value of its own. */
export function answerable(members: readonly GroupMember[]): GroupMember[] {
  return members.filter((m) => !!m.task_id && !m.has_value)
}

export const distinctProducts = (members: readonly Pick<GroupMember, 'product_id' | 'task_id' | 'issue_id'>[]) =>
  new Set(members.map((m) => m.product_id ?? m.task_id ?? m.issue_id)).size

/** Distinct listings of the members (each lists at most 4 of its product's listings). */
export const distinctListings = (members: readonly Pick<GroupMember, 'listing_ids'>[]) => new Set(members.flatMap((m) => m.listing_ids)).size

/** `ids` in chunks of `size`, sorted so the same selection always makes the same chunks. */
export function chunks(ids: readonly string[], size = ANSWER_CHUNK): string[][] {
  const sorted = [...new Set(ids)].sort()
  const out: string[][] = []
  for (let i = 0; i < sorted.length; i += size) out.push(sorted.slice(i, i + size))
  return out
}

/** Several chunk answers as one. A listing named twice is kept once. */
export function mergeAnswers(parts: readonly GroupAnswerOut[]): GroupAnswerOut {
  const listings = new Map<string, AffectedListing>()
  for (const p of parts) for (const l of p.listings) listings.set(l.listing_id, l)
  return { applied: parts.flatMap((p) => p.applied), skipped: parts.flatMap((p) => p.skipped), listings: [...listings.values()] }
}

/** The listings to redraft after an answer: the ones the backend says can be written again now. */
export function redraftTargets(listings: readonly AffectedListing[]): string[] {
  return [...new Set(listings.filter((l) => l.redraft).map((l) => l.listing_id))]
}

/** One listing in the step after an answer: redrafted now (`redraft`), or held with a reason. */
export type RedraftPlanItem = {
  listingId: string
  productId: string | null
  redraft: boolean
  reason: RedraftReason | null
  openQuestions: number | null
  sections: RedraftSection[]
}

/**
 * The step after an answer, from the backend's affected listings: redraft on only where `redraft`
 * is true; a held one shows its reason; a listing never written (no reason) is left out.
 */
export function redraftPlan(listings: readonly AffectedListing[]): RedraftPlanItem[] {
  const out = new Map<string, RedraftPlanItem>()
  for (const l of listings) {
    if (!l.redraft && !l.reason) continue
    out.set(l.listing_id, {
      listingId: l.listing_id,
      productId: l.product_id,
      redraft: l.redraft,
      reason: l.redraft ? null : (l.reason ?? null),
      openQuestions: l.open_questions ?? null,
      sections: l.sections ?? [],
    })
  }
  return [...out.values()]
}

/** Listings that can be redrafted with no more to know (a full regenerate). */
export const plainPlan = (listingIds: readonly string[]): RedraftPlanItem[] =>
  [...new Set(listingIds)].map((listingId) => ({ listingId, productId: null, redraft: true, reason: null, openQuestions: null, sections: [] }))

/**
 * The plan for a listing read after a brand-wide save (GET /listings/{id}): never written is left
 * out, one being written is held as busy, the AI pause holds the rest; the sections are the ones
 * the new answers feed (`affected_sections`).
 */
export function listingPlan(
  l: { id: string; product_id: string; status: string; affected_sections?: RedraftSection[] | null },
  aiPaused: boolean,
): RedraftPlanItem | null {
  if (l.status === 'created') return null
  const busy = l.status === 'generating'
  const reason: RedraftReason | null = busy ? 'busy' : aiPaused ? 'paused' : null
  return { listingId: l.id, productId: l.product_id, redraft: !reason, reason, openQuestions: null, sections: l.affected_sections ?? [] }
}

/** Why a listing waits, in words. */
export function heldReason(item: Pick<RedraftPlanItem, 'reason' | 'openQuestions'>): string {
  if (item.reason === 'busy') return 'Already drafting.'
  if (item.reason === 'paused') return 'AI drafting is paused.'
  const q = item.openQuestions
  const open = q && q > 0 ? `${n(q)} ${q === 1 ? 'question' : 'questions'}` : 'questions'
  return `Still has ${open} open. Kuinn redrafts it when they’re answered.`
}

/** A brand-wide value reaches the products without their own: their listings, deduplicated. */
export function brandListings(members: readonly GroupMember[]): string[] {
  return [...new Set(members.filter((m) => !m.has_value).flatMap((m) => m.listing_ids))]
}

/**
 * The result in words: "Saved for 31 products. 3 already had a value and were kept." `keptBefore`
 * counts the products the screen already showed as kept (not sent).
 */
export function answerSummary(r: GroupAnswerOut, keptBefore = 0, scope: GroupScope = 'product_fact'): string {
  const saved = new Set(r.applied.map((a) => a.product_id)).size
  const kept = keptBefore + new Set(r.skipped.filter((s) => s.reason === 'has_value').map((s) => s.product_id ?? s.task_id)).size
  const verb = scope === 'exemption' ? 'Marked as exempt for' : 'Saved for'
  const head = saved ? `${verb} ${n(saved)} ${saved === 1 ? 'product' : 'products'}.` : 'Nothing was saved.'
  const tail = kept
    ? scope === 'exemption'
      ? ` ${n(kept)} ${kept === 1 ? 'has a barcode and was' : 'have a barcode and were'} kept.`
      : ` ${n(kept)} already had a value and ${kept === 1 ? 'was' : 'were'} kept.`
    : ''
  return head + tail
}

/** Skipped rows other than kept ones (those are counted in the summary line), by reason. */
export function otherSkips(r: Pick<GroupAnswerOut, 'skipped'>): GroupSkipped[] {
  return r.skipped.filter((s) => s.reason !== 'has_value')
}

/* ------------------------------------------------------------------------------ Redraft */

export type RedraftOutcome = 'accepted' | 'waiting' | 'busy' | 'limited' | 'failed'
export type RedraftResult = { listingId: string; outcome: RedraftOutcome }

/** Lines for the redraft result: started, waiting, busy, and what could not start. */
export function redraftSummary(results: readonly RedraftResult[]): { started: string | null; busy: string | null; failed: string | null; retry: string[] } {
  const count = (o: RedraftOutcome) => results.filter((r) => r.outcome === o).length
  const accepted = count('accepted')
  const waiting = count('waiting')
  const busy = count('busy')
  const retry = results.filter((r) => r.outcome === 'limited' || r.outcome === 'failed').map((r) => r.listingId)
  const started = accepted + waiting
  return {
    started: started
      ? `Redrafting ${n(started)} ${started === 1 ? 'listing' : 'listings'}.${waiting ? ` ${n(waiting)} ${waiting === 1 ? 'is' : 'are'} waiting for a free slot.` : ''}`
      : null,
    busy: busy ? `${busy === 1 ? 'One is' : `${n(busy)} are`} already being written.` : null,
    failed: retry.length ? `Couldn’t start ${n(retry.length)} ${retry.length === 1 ? 'redraft' : 'redrafts'}. Try again in a few minutes.` : null,
    retry,
  }
}

/**
 * After a re-check: `closed` is how many Inbox items the checks closed (the summary's open items
 * before less after), or null when that is unknown. `redrafting`: the redrafts start next, so no
 * prompt to redraft.
 */
export function recheckSummary(closed: number | null, redrafting = false): string {
  if (closed === null) return 'Checked again.'
  if (closed <= 0) return redrafting ? 'Checked again.' : 'Checked again. Nothing closed yet. Redraft the listings to use your answer.'
  const done = `Checked again. ${n(closed)} ${closed === 1 ? 'item is' : 'items are'} done.`
  return redrafting ? done : `${done} Redraft the rest to use your answer.`
}
