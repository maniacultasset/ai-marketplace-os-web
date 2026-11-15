/**
 * Inbox right pane > a group of identical open items across products (G1).
 *
 *   product_fact  one answer (the question's own input) for all of them, or the products picked;
 *                 a product that already has a value is never sent and never changed.
 *   exemption     the brand's GTIN exemption for the products without a barcode, after a confirm.
 *   brand         a brand party (manufacturer, marketer, packer or importer, from `field`), set
 *                 once (the Brand page's card, owner or admin).
 *   per_item      the list only: each one is opened and fixed on its own.
 *
 * After an answer, the affected listings the backend marks `redraft` are redrafted (on by default
 * for roles that can) with POST /listings/{id}/regenerate, only the sections the answer feeds, one
 * key per listing; past the brand's cap a draft waits for a free slot (B19). A listing with no
 * sections is never redrafted on its own. The others show why they wait (other questions open,
 * already drafting, AI paused); one never written or fed nothing is left out. With redraft off,
 * "Check again" re-runs the checks with the new facts (no AI). A brand-wide save uses the PATCH
 * reply's `affected_listings` the same way (the backend has re-checked them). Only the manual
 * "brand already set" redraft writes whole listings.
 */
import { Link } from '@tanstack/react-router'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { isApiError } from '@/api/errors'
import { Banner } from '@/components/la/banner'
import { LaCard } from '@/components/la/cards'
import { Icon } from '@/components/la/icons'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Spinner } from '@/components/ui/spinner'
import { AI_PAUSED_REASON } from '@/features/ai-credit/model'
import { useAiPaused } from '@/features/ai-credit/use-ai-paused'
import { BrandPartyCard } from '@/features/brand/party-card'
import type { InboxSearch } from '@/features/home-inbox/model'
import { AnswerInput } from '@/features/photo-facts/answer-card'
import { answerMode, checkAnswer, parseAnswerSpec } from '@/features/photo-facts/answer-spec'
import { factLabel } from '@/features/photo-facts/model'
import { OP_ACTION, useCan } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { useAnswerGroup, useRecheck, useRedraft, type GroupAnswerRun } from './api'
import {
  answerable,
  answerSummary,
  brandListings,
  brandRole,
  canRedraftItem,
  checkOnlyPlan,
  distinctListings,
  distinctProducts,
  fullPlan,
  groupMeta,
  groupTitle,
  heldReason,
  keptLabel,
  memberItemKey,
  otherSkips,
  recheckSummary,
  redraftPlan,
  redraftSummary,
  SKIP_COPY,
  type AffectedListing,
  type GroupMember,
  type InboxGroup,
  type RedraftPlanItem,
  type RedraftResult,
} from './model'

/** Rows shown before "Show all". */
const ROWS_SHOWN = 8

const n = (x: number) => x.toLocaleString('en-IN')
const productsWord = (x: number) => `${n(x)} ${x === 1 ? 'product' : 'products'}`
const listingsWord = (x: number) => `${n(x)} ${x === 1 ? 'listing' : 'listings'}`

export function GroupDetail({
  group,
  search,
  onDone,
}: {
  group: InboxGroup
  search: InboxSearch
  /** Told what was saved, so the list can keep the card with that line. */
  onDone?: (group: InboxGroup, line: string) => void
}) {
  const [rowStatus, setRowStatus] = useState<ReadonlyMap<string, string>>(() => new Map())
  const [mode, setMode] = useState<'all' | 'pick'>('all')
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set())
  const answers = group.scope === 'product_fact' || group.scope === 'exemption'

  return (
    <article className="flex max-w-[760px] flex-col gap-4" data-testid="group-detail" data-scope={group.scope}>
      <div>
        <h2 className="font-display text-[22px] leading-7 font-bold text-ink lg:text-[28px] lg:leading-[34px]" data-testid="group-title">
          {groupTitle(group)}
        </h2>
        <p className="mt-1 text-small text-ink-2" data-testid="group-meta">
          {[groupMeta(group), group.categories.length ? group.categories.map(categoryWords).join(', ') : null].filter(Boolean).join(' · ')}
        </p>
        <p className="mt-2 text-body text-ink" data-testid="group-sub">
          {answers
            ? 'Answer once for all of them, or pick some.'
            : group.scope === 'per_item'
              ? 'Each one needs its own fix. Open one to start.'
              : null}
        </p>
      </div>

      {group.scope === 'product_fact' || group.scope === 'exemption' ? (
        <ManyAnswer group={group} mode={mode} setMode={setMode} picked={picked} onRows={setRowStatus} onDone={onDone} />
      ) : group.scope === 'brand' ? (
        <BrandAnswer group={group} />
      ) : null}

      <MemberList
        group={group}
        search={search}
        choosing={answers && mode === 'pick'}
        picked={picked}
        onToggle={(id, on) =>
          setPicked((s) => {
            const next = new Set(s)
            if (on) next.add(id)
            else next.delete(id)
            return next
          })
        }
        rowStatus={rowStatus}
      />
    </article>
  )
}

/** `kurta_sets` → "Kurta sets". */
function categoryWords(c: string) {
  const w = c.replace(/[_-]+/g, ' ').trim()
  return w ? w.charAt(0).toLocaleUpperCase('en') + w.slice(1) : c
}

/* ------------------------------------------------------------------------- One answer, many */

function ManyAnswer({
  group,
  mode,
  setMode,
  picked,
  onRows,
  onDone,
}: {
  group: InboxGroup
  mode: 'all' | 'pick'
  setMode: (m: 'all' | 'pick') => void
  picked: ReadonlySet<string>
  onRows: (m: ReadonlyMap<string, string>) => void
  onDone?: (group: InboxGroup, line: string) => void
}) {
  const can = useCan()
  const allowed = can(OP_ACTION['POST /inbox/groups/answer'])
  const canRedraft = can(OP_ACTION['POST /listings/{listing_id}/regenerate'])
  const aiPaused = useAiPaused()
  const exemption = group.scope === 'exemption'
  const spec = useMemo(() => parseAnswerSpec(group.answer, group.field ?? null), [group.answer, group.field])
  const inputMode = answerMode(spec)
  const answer = useAnswerGroup()
  const id = useId()
  const [draft, setDraft] = useState<string | boolean | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [tries, setTries] = useState(0)
  const [confirmed, setConfirmed] = useState(false)
  const [redraftOn, setRedraftOn] = useState(true)
  const [failure, setFailure] = useState<string | null>(null)
  const [run, setRun] = useState<{ answer: GroupAnswerRun; keptBefore: number; redraft: boolean } | null>(null)

  const open = answerable(group.members)
  const kept = group.members.filter((m) => m.has_value && m.task_id)
  const targets = mode === 'all' ? open : open.filter((m) => picked.has(m.task_id!))
  const targetProducts = distinctProducts(targets)
  const targetListings = distinctListings(targets)
  const label = group.field ? factLabel(group.field) : 'Answer'

  if (!allowed)
    return (
      <Banner tone="neutral" icon="lock">
        <span data-testid="group-no-permission">Only people who can edit products can answer this. Ask an owner or operator.</span>
      </Banner>
    )

  if (run)
    return <AnswerResultBlock group={group} run={run.answer} keptBefore={run.keptBefore} redraftFirst={run.redraft} />

  // Every product here already has its own value: nothing to save, only the listings to redraft.
  if (!open.length)
    return (
      <div className="flex flex-col gap-3">
        <Banner tone="neutral" icon="info">
          <span data-testid="group-all-kept">
            {exemption ? 'Every product here has a barcode now.' : 'Every product here has its own value now.'} Check the listings again to close these.
          </span>
        </Banner>
        <NextStep plan={checkOnlyPlan(group.members.flatMap((m) => m.listing_ids))} auto={false} />
      </div>
    )

  if (!exemption && inputMode.mode !== 'input')
    return (
      <Banner tone="neutral" icon="info">
        <span data-testid="group-read-only">{inputMode.mode === 'read-only' ? inputMode.reason : 'This question can’t be answered here yet.'} Open one below to answer it.</span>
      </Banner>
    )

  const submit = async () => {
    setTries((t) => t + 1)
    setFailure(null)
    let value: string | number | boolean
    if (exemption) {
      if (!confirmed) {
        setFieldError('Confirm the exemption first.')
        return
      }
      value = true
    } else {
      const checked = checkAnswer(spec, draft)
      if (!checked.ok) {
        setFieldError(checked.error)
        return
      }
      value = checked.value
    }
    if (!targets.length) {
      setFieldError(mode === 'pick' ? 'Pick at least one product.' : 'Every product here already has a value.')
      return
    }
    setFieldError(null)
    try {
      const out = await answer.mutateAsync({ group: group.key, taskIds: targets.map((m) => m.task_id!), value })
      const rows = new Map<string, string>()
      for (const a of out.result.applied) rows.set(a.task_id, exemption ? 'Marked as exempt' : 'Saved')
      for (const s of out.result.skipped) rows.set(s.task_id, SKIP_COPY[s.reason])
      onRows(rows)
      const keptBefore = mode === 'all' ? distinctProducts(kept) : 0
      const redraft = redraftOn && canRedraft && !aiPaused
      setRun({ answer: out, keptBefore, redraft })
      onDone?.(group, answerSummary(out.result, keptBefore, group.scope))
    } catch (err) {
      setFailure(groupAnswerFailure(err, (m) => setFieldError(m)))
    }
  }

  const busy = answer.isPending
  return (
    <LaCard pad="sm" className="flex flex-col gap-4" data-testid="group-answer">
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <ScopePicker mode={mode} setMode={setMode} open={distinctProducts(open)} kept={distinctProducts(kept)} exemption={exemption} disabled={busy} />

        {exemption ? (
          <div className="flex flex-col gap-1">
            <div className="flex items-start gap-2.5">
              <Checkbox id={`${id}-exempt`} checked={confirmed} onCheckedChange={(v) => { setConfirmed(v === true); setFieldError(null) }} disabled={busy} className="mt-0.5" data-testid="group-exempt-confirm" />
              <label htmlFor={`${id}-exempt`} className="text-body text-ink">
                My brand has a GTIN exemption from Amazon for these products.
              </label>
            </div>
            {fieldError ? (
              <p className="text-small text-danger" role="alert" data-testid="group-field-error">
                {fieldError}
              </p>
            ) : null}
          </div>
        ) : (
          <AnswerInput
              id={`${id}-answer`}
              spec={spec}
              label={label}
              suggestions={[]}
              draft={draft}
              onChange={(v) => {
                setDraft(v)
                if (fieldError) setFieldError(null)
              }}
              error={fieldError}
              tries={tries}
              disabled={busy}
            />
        )}

        {canRedraft ? (
          <div className="flex flex-col gap-0.5">
            <div className="flex items-start gap-2.5">
              <Checkbox
                id={`${id}-redraft`}
                checked={redraftOn && !aiPaused}
                disabled={busy || aiPaused}
                onCheckedChange={(v) => setRedraftOn(v === true)}
                className="mt-0.5"
                data-testid="group-redraft"
              />
              <label htmlFor={`${id}-redraft`} className="text-body text-ink">
                Redraft the affected listings{targetListings ? ` (${n(targetListings)})` : ''}
              </label>
            </div>
            <p className="pl-7 text-caption text-ink-2">
              {aiPaused ? AI_PAUSED_REASON : 'Kuinn writes new drafts with your answer. Each one needs approval again.'}
            </p>
          </div>
        ) : null}

        {failure ? (
          <Banner tone="danger" role="alert" title="Not saved" data-testid="group-failure">
            {failure}
          </Banner>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button type="submit" size="lg" className="max-sm:h-[52px] max-sm:w-full" disabled={busy || !targets.length} data-testid="group-submit">
            {busy ? <Spinner data-icon="inline-start" aria-hidden /> : null}
            {busy ? 'Saving…' : exemption ? `Mark ${productsWord(targetProducts)} as exempt` : `Save for ${productsWord(targetProducts)}`}
          </Button>
        </div>
        <p className="text-caption text-ink-3">
          {exemption ? 'Products with a barcode are never changed.' : 'Your answer becomes each product’s value. A product with its own value is never changed.'}
        </p>
      </form>
    </LaCard>
  )
}

function ScopePicker({
  mode,
  setMode,
  open,
  kept,
  exemption,
  disabled,
}: {
  mode: 'all' | 'pick'
  setMode: (m: 'all' | 'pick') => void
  open: number
  kept: number
  exemption: boolean
  disabled: boolean
}) {
  const name = useId()
  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="mb-1 text-small font-semibold text-ink">Which products</legend>
      <div className="flex flex-wrap gap-2">
        {(
          [
            ['all', `All ${productsWord(open)}`],
            ['pick', 'Choose products'],
          ] as const
        ).map(([v, text]) => (
          <label
            key={v}
            className={cn(
              'inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border px-3.5 text-small font-semibold transition-[color,background-color,border-color,box-shadow] duration-150 has-[:focus-visible]:shadow-[var(--focus-ring)] motion-reduce:transition-none',
              mode === v ? 'border-brand bg-brand-bg text-brand-ink' : 'border-line-strong bg-surface text-ink',
            )}
          >
            <input type="radio" name={name} value={v} checked={mode === v} onChange={() => setMode(v)} className="sr-only" data-testid={`group-scope-${v}`} />
            {text}
          </label>
        ))}
      </div>
      {kept ? (
        <p className="text-caption text-ink-2" data-testid="group-kept-note">
          {exemption
            ? `${n(kept)} ${kept === 1 ? 'has a barcode and is' : 'have a barcode and are'} kept as ${kept === 1 ? 'it is' : 'they are'}.`
            : `${n(kept)} ${kept === 1 ? 'has its own value and is' : 'have their own value and are'} kept as ${kept === 1 ? 'it is' : 'they are'}.`}
        </p>
      ) : null}
      {mode === 'pick' ? <p className="text-caption text-ink-2">Tick the products below.</p> : null}
    </fieldset>
  )
}

/** A refused group answer in words. A 422 at `value` lands under the input instead (returns null). */
function groupAnswerFailure(err: unknown, onField: (message: string) => void): string | null {
  if (isApiError(err)) {
    const at = (name: string) => err.details.some((d) => d.loc.includes(name))
    if (err.status === 422 && at('value')) {
      onField('Not accepted for this product’s category.')
      return null
    }
    if (err.status === 422 && (at('task_ids') || at('group'))) return 'These questions changed since the list loaded. The list has been refreshed; try again.'
    if (err.status === 501) return 'Answering many at once isn’t switched on yet. Open each one below to answer it.'
    if (err.status === 403) return 'You can’t answer questions with your role.'
    if (err.status === 0) return 'Can’t reach the server. Your answer is still here; try again.'
  }
  return 'Couldn’t save your answer. Try again.'
}

/* ------------------------------------------------------------------------------ Result */

function AnswerResultBlock({ group, run, keptBefore, redraftFirst }: { group: InboxGroup; run: GroupAnswerRun; keptBefore: number; redraftFirst: boolean }) {
  const others = otherSkips(run.result)
  const byReason = new Map<string, number>()
  for (const s of others) byReason.set(SKIP_COPY[s.reason], (byReason.get(SKIP_COPY[s.reason]) ?? 0) + 1)
  const plan = redraftPlan(run.result.listings)
  return (
    <div className="flex flex-col gap-3" data-testid="group-result">
      <Banner tone={run.result.applied.length ? 'success' : 'attention'} role="status">
        <span data-testid="group-result-line">{answerSummary(run.result, keptBefore, group.scope)}</span>
        {byReason.size ? (
          <ul className="mt-1 list-none text-small" data-testid="group-result-skips">
            {[...byReason].map(([text, count]) => (
              <li key={text}>
                {productsWord(count)}: {text.charAt(0).toLocaleLowerCase('en') + text.slice(1)}
              </li>
            ))}
          </ul>
        ) : null}
      </Banner>
      {run.error ? (
        <Banner tone="danger" role="alert" title="Some were not saved">
          The rest couldn’t be saved. They are still in your Inbox; try again from there.
        </Banner>
      ) : null}
      {run.result.applied.length ? <NextStep plan={plan} auto={redraftFirst} members={group.members} /> : null}
    </div>
  )
}

/* ------------------------------------------------------------------------------ Brand */

function BrandAnswer({ group }: { group: InboxGroup }) {
  const can = useCan()
  const canEdit = can(OP_ACTION['PATCH /brand-profile'])
  const role = brandRole(group.field)
  const [saved, setSaved] = useState<boolean | null>(null)
  // After a save here: the PATCH reply's verdicts (the backend re-checked them), the same step as an answer.
  const [savedPlan, setSavedPlan] = useState<RedraftPlanItem[] | null>(null)
  const set = saved ?? group.brand_value_set
  const listings = brandListings(group.members)
  const onSaved = (s: boolean, affected?: AffectedListing[]) => {
    setSaved(s)
    setSavedPlan(s && affected ? redraftPlan(affected) : null)
  }
  return (
    <div className="flex flex-col gap-3" data-testid="group-brand" data-role={role}>
      {set ? (
        <p className="text-body text-ink" data-testid="group-brand-set">
          Your brand {role} is set. These listings were written before that. Redraft them to use it.
        </p>
      ) : canEdit ? (
        <p className="text-body text-ink" data-testid="group-brand-unset">
          Set the {role} once for the brand. Every product uses it unless it has its own.
        </p>
      ) : (
        <Banner tone="neutral" icon="lock">
          <span data-testid="group-brand-no-permission">Only an owner or admin can set the brand {role}. You can still add it on each product.</span>
        </Banner>
      )}
      {canEdit || set ? <BrandPartyCard role={role} canEdit={canEdit} onSaved={onSaved} /> : null}
      {savedPlan ? (
        <NextStep key="saved" plan={savedPlan} auto members={group.members} />
      ) : set && listings.length ? (
        <NextStep plan={fullPlan(listings)} auto={false} />
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------------- Redraft or check */

/**
 * The step after an answer: redraft the listings that can be (started at once when `auto`), or
 * check them again with the new facts. Only items with sections (or the manual full redraft) are
 * redrafted. The ones held show why. "Redraft the rest" resends only the ones that could not start.
 */
function NextStep({
  plan,
  auto,
  members = [],
}: {
  plan: readonly RedraftPlanItem[]
  auto: boolean
  members?: readonly GroupMember[]
}) {
  const can = useCan()
  const aiPaused = useAiPaused()
  const canRedraft = can(OP_ACTION['POST /listings/{listing_id}/regenerate'])
  const canCheck = can(OP_ACTION['POST /listings/validate'])
  const redraft = useRedraft()
  const recheck = useRecheck()
  const [results, setResults] = useState<RedraftResult[] | null>(null)
  const [checked, setChecked] = useState<{ failed: number; closed: number | null } | null>(null)
  const [started, setStarted] = useState(false)
  const listingIds = plan.map((p) => p.listingId)
  const ready = plan.filter(canRedraftItem)
  const held = plan.filter((p) => !p.redraft && p.blocked)
  const sectionsOf = new Map(plan.map((p) => [p.listingId, p.sections]))

  const start = async (ids: readonly string[]) => {
    setStarted(true)
    const out = await redraft.run(ids.map((listingId) => ({ listingId, sections: sectionsOf.get(listingId) ?? [] })))
    setResults((prev) => {
      if (!prev) return out
      const next = new Map(prev.map((r) => [r.listingId, r]))
      for (const r of out) next.set(r.listingId, r)
      return [...next.values()]
    })
  }

  // Right after the answer: redraft the ready ones when it was ticked. Once (the ref holds through
  // a remount check).
  const autoRan = useRef(false)
  useEffect(() => {
    if (autoRan.current) return
    autoRan.current = true
    if (auto && canRedraft && !aiPaused && ready.length > 0) void start(ready.map((p) => p.listingId))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, for the answer that mounted this step
  }, [])

  if (!listingIds.length) return null
  const nameOf = (productId: string | null) => {
    const m = productId ? members.find((x) => x.product_id === productId) : undefined
    return [m?.sku, m?.title].filter(Boolean).join(' · ') || 'A listing'
  }
  const summary = results ? redraftSummary(results) : null
  const running = !!redraft.progress
  return (
    <div className="flex flex-col gap-3" data-testid="group-next">
      {running ? (
        <p className="flex items-center gap-2 text-small text-ink-2" role="status" data-testid="group-redraft-progress">
          <Spinner aria-hidden />
          Starting redrafts… {n(redraft.progress!.done)} of {n(redraft.progress!.total)}
        </p>
      ) : null}
      {summary ? (
        <div className="flex flex-col gap-2" data-testid="group-redraft-result">
          {summary.started ? (
            <Banner tone="info" icon="refresh" role="status">
              <span data-testid="group-redraft-started">{summary.started}</span>
            </Banner>
          ) : null}
          {summary.busy ? <p className="text-small text-ink-2" data-testid="group-redraft-busy">{summary.busy}</p> : null}
          {summary.failed ? (
            <Banner
              tone="attention"
              role="alert"
              action={
                <Button variant="secondary" size="sm" disabled={running || aiPaused} onClick={() => void start(summary.retry)} data-testid="group-redraft-rest">
                  Redraft the rest
                </Button>
              }
            >
              <span data-testid="group-redraft-failed">{aiPaused ? AI_PAUSED_REASON : summary.failed}</span>
            </Banner>
          ) : null}
        </div>
      ) : null}
      {checked ? (
        <p className="text-small text-ink" role="status" data-testid="group-recheck-result">
          {recheckSummary(checked.closed)}
          {checked.failed ? ` Couldn’t check ${listingsWord(checked.failed)}.` : ''}
        </p>
      ) : null}
      {held.length ? (
        <div className="flex flex-col gap-1" data-testid="group-redraft-held">
          <p className="text-small font-semibold text-ink">{held.length === 1 ? 'One listing waits' : `${n(held.length)} listings wait`}</p>
          <ul className="flex list-none flex-col gap-0.5 text-small text-ink-2">
            {held.slice(0, ROWS_SHOWN).map((h) => (
              <li key={h.listingId} data-testid="group-held-row">
                {nameOf(h.productId)}: {heldReason(h)}
              </li>
            ))}
          </ul>
          {held.length > ROWS_SHOWN ? <p className="text-caption text-ink-3">And {n(held.length - ROWS_SHOWN)} more.</p> : null}
        </div>
      ) : null}
      {!started && !running ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {canRedraft && ready.length ? (
            <Button disabled={aiPaused} onClick={() => void start(ready.map((p) => p.listingId))} data-testid="group-redraft-now">
              <Icon name="refresh" size={16} />
              Redraft {listingsWord(ready.length)}
            </Button>
          ) : null}
          {canCheck ? (
            <Button
              variant="secondary"
              disabled={recheck.running}
              onClick={async () => setChecked(await recheck.run(listingIds))}
              data-testid="group-recheck"
            >
              {recheck.running ? <Spinner data-icon="inline-start" aria-hidden /> : null}
              {recheck.running ? 'Checking…' : 'Check again'}
            </Button>
          ) : null}
        </div>
      ) : null}
      {!started && canRedraft && ready.length ? (
        <p className="text-caption text-ink-2">{aiPaused ? AI_PAUSED_REASON : 'Kuinn writes new drafts with your answer. Each one needs approval again.'}</p>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------------------ Members */

function MemberList({
  group,
  search,
  choosing,
  picked,
  onToggle,
  rowStatus,
}: {
  group: InboxGroup
  search: InboxSearch
  choosing: boolean
  picked: ReadonlySet<string>
  onToggle: (taskId: string, on: boolean) => void
  rowStatus: ReadonlyMap<string, string>
}) {
  const [all, setAll] = useState(false)
  const rows = all || group.members.length <= ROWS_SHOWN + 1 ? group.members : group.members.slice(0, ROWS_SHOWN)
  const heading = group.item_kind === 'issue' ? listingsWord(group.listings) : productsWord(group.products)
  return (
    <section aria-label="Products in this group" className="flex flex-col gap-2" data-testid="group-members">
      <h3 className="text-[15px] font-bold text-ink">{heading}</h3>
      <ul className="flex flex-col divide-y divide-line rounded-card border border-line bg-surface">
        {rows.map((m) => (
          <MemberRow
            key={m.task_id ?? m.issue_id ?? m.product_id}
            member={m}
            group={group}
            search={search}
            choosing={choosing}
            picked={!!m.task_id && picked.has(m.task_id)}
            onToggle={onToggle}
            status={m.task_id ? rowStatus.get(m.task_id) : undefined}
          />
        ))}
      </ul>
      {rows.length < group.members.length ? (
        <Button variant="ghost" size="sm" className="self-start" onClick={() => setAll(true)} data-testid="group-show-all">
          Show all {n(group.members.length)}
        </Button>
      ) : null}
      {group.members_more ? (
        <p className="text-caption text-ink-2">Showing the first {n(group.members.length)}. Answer these, and the rest appear next.</p>
      ) : null}
    </section>
  )
}

function MemberRow({
  member,
  group,
  search,
  choosing,
  picked,
  onToggle,
  status,
}: {
  member: GroupMember
  group: InboxGroup
  search: InboxSearch
  choosing: boolean
  picked: boolean
  onToggle: (taskId: string, on: boolean) => void
  status?: string
}) {
  const id = useId()
  const key = memberItemKey(member)
  const kept = member.has_value && group.item_kind === 'task'
  const name = [member.sku, member.title].filter(Boolean).join(' · ') || 'A product'
  const line = status ?? (kept ? keptLabel(group.scope) : 'Open')
  return (
    <li className="flex min-h-[52px] items-center gap-3 px-3.5 py-2.5" data-testid="group-member" data-kept={kept || undefined}>
      {choosing && member.task_id ? (
        <Checkbox
          id={id}
          checked={picked && !kept}
          disabled={kept}
          onCheckedChange={(v) => onToggle(member.task_id!, v === true)}
          aria-label={`Choose ${name}`}
          data-testid="group-member-pick"
        />
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="truncate text-small font-semibold text-ink">{name}</p>
        <p className={cn('truncate text-caption', kept ? 'text-ink-3' : 'text-ink-2')} data-testid="group-member-status">
          {line}
        </p>
      </div>
      {key ? (
        <Button asChild variant="ghost" size="sm" className="shrink-0">
          <Link to="/inbox" search={{ ...search, item: key }} data-testid="group-member-open">
            Open
            <Icon name="chev" size={14} className="-rotate-90" />
          </Link>
        </Button>
      ) : null}
    </li>
  )
}
