/**
 * The listing's section cards on Review (client feedback 14 and 16; rules in sections-model.ts).
 * One card per section: Title, Key features, Description, Search terms and Attributes. Each card
 * has its own limit counter, its own errors (the checks' findings on its paths and the edit's own
 * validation), its own Save (PATCH /listings/{id}/content: no AI runs, and the edit is locked) and
 * its own "Regenerate this section" (POST /listings/{id}/regenerate with `sections`: the agent
 * rewrites only this section into a new version that waits for approval). A locked section says
 * "Locked: your edit is kept" and offers Unlock.
 */
import { useId, useState, type ReactNode } from 'react'
import { describeError, isApiError } from '@/api/errors'
import { useIntentKey } from '@/api/idempotency'
import { fieldHintId, Icon, LaCard, StatusChip } from '@/components/la'
import { ReferenceId } from '@/components/states/reference-id'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { AI_PAUSED_REASON, isAiPausedError } from '@/features/ai-credit/model'
import { useAiPaused } from '@/features/ai-credit/use-ai-paused'
import { useRegenerateListing, useSaveContent } from '@/features/listings/api'
import { rememberJob } from '@/features/listings/job-memory'
import type { ActionState, ListingDetail } from '@/features/listings/model'
import { toast, toastError } from '@/lib/toast'
import { codePoints } from '@/lib/validation'
import { cn } from '@/lib/utils'
import { mpName, sellerFinding } from './format'
import type { ErrorItem } from './gates'
import {
  attributeKind,
  attributeLabel,
  attributeText,
  bulletIndex,
  fullyLocked,
  keywordWhy,
  limitsFor,
  overLimit,
  parseAttribute,
  SECTION_LABEL,
  sectionLocks,
  sectionOf,
  sectionPatch,
  splitTerms,
  unlockPatch,
  utf8Bytes,
  validateBullets,
  validateDescription,
  validateTerms,
  validateTitle,
  type AttributeValue,
  type Section,
} from './sections-model'
import { ActionButton } from './ui'

const fmt = (n: number) => n.toLocaleString('en-IN')
const SAVE_NOTE = 'Saving keeps your text and locks it. The agent does not run.'

interface Shared {
  listing: ListingDetail
  etag: string | null
  findings: readonly ErrorItem[]
  editState: ActionState
  regenerateState: ActionState
  onSaved: (section: Section) => void
}

/** The five cards, in the order the marketplace shows them. */
export function SectionCards(props: Shared) {
  return (
    <section aria-label="Listing content" className="flex flex-col gap-3" data-testid="section-cards">
      <TitleCard {...props} />
      <BulletsCard {...props} />
      <DescriptionCard {...props} />
      <KeywordsCard {...props} />
      <AttributesCard {...props} />
    </section>
  )
}

/* ---- the shell every card shares ---- */

function useSectionActions(section: Section, { listing, etag, onSaved }: Pick<Shared, 'listing' | 'etag' | 'onSaved'>) {
  const save = useSaveContent(listing.id)
  const regenerate = useRegenerateListing(listing.id)
  const key = useIntentKey()
  const [refusal, setRefusal] = useState<{ message: string; ref: string | null; path: string | null } | null>(null)

  function onError(e: unknown) {
    const path = isApiError(e) ? refusedPath(e.details) : null
    setRefusal({
      message:
        isApiError(e) && e.type === 'STALE_VERSION'
          ? 'Someone changed this listing while you were editing. Read the new version and edit again.'
          : path?.startsWith('attributes.') && isApiError(e) && e.status === 422
            ? `${attributeLabel(path.slice('attributes.'.length))} comes from your product. Change it on the product page.`
            : describeError(e),
      ref: isApiError(e) ? e.correlationId : null,
      path,
    })
  }

  return {
    refusal,
    clearRefusal: () => setRefusal(null),
    saving: save.isPending,
    regenerating: regenerate.isPending,
    save(body: Parameters<typeof save.mutate>[0]['body'], done: () => void) {
      setRefusal(null)
      save.mutate(
        { body, etag },
        {
          onSuccess: () => {
            done()
            onSaved(section)
          },
          onError,
        },
      )
    },
    unlock(paths: readonly string[]) {
      if (!listing.content) return
      setRefusal(null)
      save.mutate(
        { body: unlockPatch(listing.content, paths), etag },
        {
          onSuccess: () => toast.success(`${SECTION_LABEL[section]} unlocked`, { description: 'Regenerate may rewrite it now.' }),
          onError,
        },
      )
    },
    regenerate() {
      setRefusal(null)
      regenerate.mutate(
        { instructions: null, key: key.get(), sections: [section] },
        {
          onSuccess: (a) => {
            key.reset()
            rememberJob(listing.id, a.job_id)
            toast.success(`Rewriting the ${SECTION_LABEL[section].toLowerCase()}`, {
              description: 'Only this section changes. The new version waits for approval.',
            })
          },
          onError: (e) => {
            if (isApiError(e) && !e.isNetwork) key.reset()
            if (isAiPausedError(e)) return // the app-wide banner says so
            toastError(e, 'Couldn’t start the rewrite')
          },
        },
      )
    },
  }
}

/** The field a 422 names (`body.attributes.color` → `attributes.color`), else null. */
function refusedPath(details: readonly { loc: (string | number)[] }[]): string | null {
  const loc = details[0]?.loc
  if (!loc?.length) return null
  const parts = loc[0] === 'body' ? loc.slice(1) : loc
  return parts.length ? parts.join('.') : null
}

function SectionShell({
  section,
  listing,
  counter,
  warning,
  findings,
  editing,
  editState,
  regenerateState,
  actions,
  onEdit,
  onCancel,
  onSave,
  saveDisabled,
  children,
  editor,
}: {
  section: Section
  listing: ListingDetail
  counter?: ReactNode
  warning?: string | null
  findings: readonly ErrorItem[]
  editing: boolean
  editState: ActionState
  regenerateState: ActionState
  actions: ReturnType<typeof useSectionActions>
  onEdit: () => void
  onCancel: () => void
  onSave: () => void
  saveDisabled?: boolean
  children: ReactNode
  editor: ReactNode
}) {
  const paused = useAiPaused()
  const headingId = useId()
  const locks = sectionLocks(section, listing.locked_paths)
  const locked = locks.length > 0
  const allLocked = fullyLocked(section, listing.locked_paths)
  const label = SECTION_LABEL[section]
  const regen: ActionState = !regenerateState.show
    ? regenerateState
    : paused
      ? { show: true, enabled: false, reason: AI_PAUSED_REASON }
      : allLocked
        ? { show: true, enabled: false, reason: 'Unlock it first. Your edit is kept until you do.' }
        : regenerateState
  const mine = findings.filter((f) => sectionOf(f.field) === section)
  return (
    <LaCard pad="sm" aria-labelledby={headingId} data-testid={`section-${section}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 id={headingId} className="text-h3 text-ink">
          {label}
        </h3>
        {counter ? (
          <span className={cn('shrink-0 text-caption tabular-nums', warning ? 'font-semibold text-attention-ink' : 'text-ink-3')} data-testid={`section-${section}-count`}>
            {counter}
          </span>
        ) : null}
      </div>
      {locked ? (
        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-caption text-ink-2" data-testid={`section-${section}-locked`}>
          <Icon name="lock" size={12} aria-hidden />
          {section === 'attributes' && locks.length > 1 ? `Locked: your ${locks.length} edits are kept.` : 'Locked: your edit is kept.'}
          {editState.show && editState.enabled && !editing ? (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-caption"
              disabled={actions.saving}
              onClick={() => actions.unlock(locks)}
              data-testid={`section-${section}-unlock`}
            >
              Unlock
            </Button>
          ) : null}
        </p>
      ) : null}
      <div className="mt-3">{editing ? editor : children}</div>
      {warning ? (
        <p role="status" className="mt-2 text-small text-attention-ink" data-testid={`section-${section}-warning`}>
          {warning}
        </p>
      ) : null}
      {mine.length && !editing ? (
        <ul className="m-0 mt-3 flex list-none flex-col gap-1.5 p-0" data-testid={`section-${section}-findings`}>
          {mine.map((f, i) => (
            <li key={i} className="flex items-start gap-2 text-small text-ink">
              <StatusChip status={f.severity === 'error' ? 'blocked' : 'needs-you'} iconOnly label={f.severity === 'error' ? 'Blocking' : 'Warning'} className="mt-px" />
              <span className="min-w-0 flex-1 break-words">{sellerFinding(f).message}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {actions.refusal ? (
        <p role="alert" className="mt-2 text-small font-semibold text-danger">
          {actions.refusal.message} <ReferenceId id={actions.refusal.ref} className="ml-1 font-normal" />
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {editing ? (
          <>
            <Button size="sm" variant="primary" disabled={actions.saving || saveDisabled} onClick={onSave} data-testid={`section-${section}-save`}>
              {actions.saving ? 'Saving…' : 'Save'}
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <span className="text-caption text-ink-3">{SAVE_NOTE}</span>
          </>
        ) : (
          <>
            <ActionButton state={editState} size="sm" variant="secondary" onClick={onEdit} data-testid={`section-${section}-edit`}>
              <Icon name="file" size={14} />
              Edit
            </ActionButton>
            <ActionButton
              state={regen}
              size="sm"
              variant="ghost"
              disabled={actions.regenerating}
              onClick={actions.regenerate}
              title="The agent rewrites only this section. The new version waits for approval."
              data-testid={`section-${section}-regenerate`}
            >
              <Icon name="refresh" size={14} />
              {actions.regenerating ? 'Starting…' : 'Regenerate this section'}
            </ActionButton>
          </>
        )}
      </div>
    </LaCard>
  )
}

function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return children ? (
    <p id={id} role="alert" className="mt-1 text-small text-danger">
      {children}
    </p>
  ) : null
}

/* ---- Title ---- */

function TitleCard(props: Shared) {
  const { listing } = props
  const content = listing.content!.content
  const actions = useSectionActions('title', props)
  const [draft, setDraft] = useState<string | null>(null)
  const [tried, setTried] = useState(false)
  const id = useId()
  const limits = limitsFor(listing.marketplace)
  const mp = mpName(listing.marketplace)
  const value = draft ?? content.title
  const count = codePoints(value.trim())
  const error = tried ? validateTitle(value) : undefined
  const close = () => {
    setDraft(null)
    setTried(false)
    actions.clearRefusal()
  }
  return (
    <SectionShell
      section="title"
      {...props}
      actions={actions}
      counter={`${fmt(count)} / ${fmt(limits.title)}`}
      warning={overLimit(count, limits.title, mp, 'characters')}
      editing={draft !== null}
      onEdit={() => setDraft(content.title)}
      onCancel={close}
      onSave={() => {
        setTried(true)
        if (validateTitle(value)) return
        actions.save(sectionPatch(listing.content!, { section: 'title', title: value }), close)
      }}
      editor={
        <>
          <label htmlFor={id} className="sr-only">
            Title
          </label>
          <Input
            id={id}
            value={value}
            autoComplete="off"
            aria-invalid={!!error}
            aria-describedby={fieldHintId(id)}
            onChange={(e) => setDraft(e.target.value)}
            data-testid="section-title-input"
          />
          <FieldError id={fieldHintId(id)}>{error}</FieldError>
        </>
      }
    >
      <p className="font-sans text-body font-semibold text-ink" data-testid="section-title-value">
        {content.title}
      </p>
    </SectionShell>
  )
}

/* ---- Key features ---- */

function BulletsCard(props: Shared) {
  const { listing } = props
  const content = listing.content!.content
  const actions = useSectionActions('bullets', props)
  const [draft, setDraft] = useState<string[] | null>(null)
  const [tried, setTried] = useState(false)
  const base = useId()
  const limits = limitsFor(listing.marketplace)
  const mp = mpName(listing.marketplace)
  const rows = draft ?? content.bullets
  const kept = rows.filter((b) => b.trim())
  const checked = validateBullets(rows)
  const longest = Math.max(0, ...kept.map((b) => codePoints(b.trim())))
  const warning =
    overLimit(kept.length, limits.bullets, mp, 'key features') ?? overLimit(longest, limits.bullet, mp, 'characters in each key feature')
  const close = () => {
    setDraft(null)
    setTried(false)
    actions.clearRefusal()
  }
  const set = (i: number, text: string) => setDraft((d) => (d ?? content.bullets).map((b, j) => (j === i ? text : b)))
  return (
    <SectionShell
      section="bullets"
      {...props}
      actions={actions}
      counter={`${kept.length} / ${limits.bullets}`}
      warning={warning}
      editing={draft !== null}
      onEdit={() => setDraft([...content.bullets])}
      onCancel={close}
      onSave={() => {
        setTried(true)
        const v = validateBullets(rows)
        if (v.list || Object.keys(v.items).length) return
        actions.save(sectionPatch(listing.content!, { section: 'bullets', bullets: rows }), close)
      }}
      editor={
        <div className="flex flex-col gap-2">
          {rows.map((b, i) => {
            const id = `${base}-${i}`
            const err = tried ? checked.items[i] : undefined
            return (
              <div key={i}>
                <div className="flex items-start gap-2">
                  <label htmlFor={id} className="sr-only">
                    Key feature {i + 1}
                  </label>
                  <Textarea
                    id={id}
                    rows={2}
                    value={b}
                    autoComplete="off"
                    aria-invalid={!!err}
                    aria-describedby={fieldHintId(id)}
                    onChange={(e) => set(i, e.target.value)}
                    data-testid={`section-bullets-input-${i}`}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Remove key feature ${i + 1}`}
                    onClick={() => setDraft((d) => (d ?? content.bullets).filter((_, j) => j !== i))}
                  >
                    <Icon name="x" size={14} />
                  </Button>
                </div>
                <div className="flex justify-between gap-2">
                  <FieldError id={fieldHintId(id)}>{err}</FieldError>
                  <span className={cn('ml-auto mt-1 text-caption tabular-nums', codePoints(b.trim()) > limits.bullet ? 'text-attention-ink' : 'text-ink-3')}>
                    {fmt(codePoints(b.trim()))} / {fmt(limits.bullet)}
                  </span>
                </div>
              </div>
            )
          })}
          {tried && checked.list ? (
            <p role="alert" className="text-small text-danger">
              {checked.list}
            </p>
          ) : null}
          {rows.length < 10 ? (
            <Button size="sm" variant="ghost" className="self-start" onClick={() => setDraft((d) => [...(d ?? content.bullets), ''])} data-testid="section-bullets-add">
              <Icon name="plus" size={14} />
              Add a key feature
            </Button>
          ) : null}
        </div>
      }
    >
      <ul className="m-0 list-disc pl-[18px] text-body leading-6 text-ink" data-testid="section-bullets-value">
        {content.bullets.map((b, i) => {
          const flagged = props.findings.some((f) => bulletIndex(f.field) === i)
          return (
            <li key={i}>
              <span className={cn(flagged && '-mx-1 box-decoration-clone rounded-sm bg-attention-bg px-1')}>{b}</span>
            </li>
          )
        })}
      </ul>
    </SectionShell>
  )
}

/* ---- Description ---- */

function DescriptionCard(props: Shared) {
  const { listing } = props
  const content = listing.content!.content
  const actions = useSectionActions('description', props)
  const [draft, setDraft] = useState<string | null>(null)
  const [tried, setTried] = useState(false)
  const [more, setMore] = useState(false)
  const id = useId()
  const limits = limitsFor(listing.marketplace)
  const mp = mpName(listing.marketplace)
  const value = draft ?? content.description
  const count = codePoints(value.trim())
  const error = tried ? validateDescription(value) : undefined
  const close = () => {
    setDraft(null)
    setTried(false)
    actions.clearRefusal()
  }
  return (
    <SectionShell
      section="description"
      {...props}
      actions={actions}
      counter={`${fmt(count)} / ${fmt(limits.description)}`}
      warning={overLimit(count, limits.description, mp, 'characters')}
      editing={draft !== null}
      onEdit={() => setDraft(content.description)}
      onCancel={close}
      onSave={() => {
        setTried(true)
        if (validateDescription(value)) return
        actions.save(sectionPatch(listing.content!, { section: 'description', description: value }), close)
      }}
      editor={
        <>
          <label htmlFor={id} className="sr-only">
            Description
          </label>
          <Textarea
            id={id}
            rows={8}
            value={value}
            autoComplete="off"
            aria-invalid={!!error}
            aria-describedby={fieldHintId(id)}
            onChange={(e) => setDraft(e.target.value)}
            data-testid="section-description-input"
          />
          <FieldError id={fieldHintId(id)}>{error}</FieldError>
        </>
      }
    >
      <p className={cn('text-small whitespace-pre-line text-ink-2', !more && 'line-clamp-4')} data-testid="section-description-value">
        {content.description}
      </p>
      {content.description.length > 320 ? (
        <Button variant="link" size="sm" className="mt-1" onClick={() => setMore((m) => !m)} aria-expanded={more}>
          {more ? 'Show less' : 'Show all of it'}
        </Button>
      ) : null}
    </SectionShell>
  )
}

/* ---- Search terms ---- */

function KeywordsCard(props: Shared) {
  const { listing } = props
  const keywords = listing.content!.keywords
  const search = keywords?.search_terms ?? []
  const hidden = keywords?.hidden_terms ?? []
  const actions = useSectionActions('keywords', props)
  const [draft, setDraft] = useState<{ search: string; hidden: string } | null>(null)
  const [tried, setTried] = useState(false)
  const searchId = useId()
  const hiddenId = useId()
  const limits = limitsFor(listing.marketplace)
  const mp = mpName(listing.marketplace)
  const searchTerms = draft ? splitTerms(draft.search) : search
  const hiddenTerms = draft ? splitTerms(draft.hidden) : hidden
  const bytes = utf8Bytes(hiddenTerms.join(' '))
  const searchError = tried ? validateTerms(searchTerms) : undefined
  const hiddenError = tried ? validateTerms(hiddenTerms) : undefined
  const close = () => {
    setDraft(null)
    setTried(false)
    actions.clearRefusal()
  }
  return (
    <SectionShell
      section="keywords"
      {...props}
      actions={actions}
      counter={limits.hiddenBytes ? `${fmt(bytes)} / ${fmt(limits.hiddenBytes)} bytes` : `${searchTerms.length + hiddenTerms.length} terms`}
      warning={limits.hiddenBytes ? overLimit(bytes, limits.hiddenBytes, mp, 'bytes of backend keywords') : null}
      editing={draft !== null}
      onEdit={() => setDraft({ search: search.join(', '), hidden: hidden.join(', ') })}
      onCancel={close}
      onSave={() => {
        setTried(true)
        if (validateTerms(searchTerms) || validateTerms(hiddenTerms)) return
        actions.save(sectionPatch(listing.content!, { section: 'keywords', searchTerms, hiddenTerms }), close)
      }}
      editor={
        <div className="flex flex-col gap-3">
          <div>
            <label htmlFor={searchId} className="text-small font-semibold text-ink">
              Search terms
            </label>
            <Textarea
              id={searchId}
              rows={2}
              value={draft?.search ?? ''}
              autoComplete="off"
              aria-invalid={!!searchError}
              aria-describedby={fieldHintId(searchId)}
              onChange={(e) => setDraft((d) => ({ hidden: d?.hidden ?? '', search: e.target.value }))}
              data-testid="section-keywords-search"
            />
            <FieldError id={fieldHintId(searchId)}>{searchError}</FieldError>
          </div>
          <div>
            <label htmlFor={hiddenId} className="text-small font-semibold text-ink">
              Backend keywords
            </label>
            <Textarea
              id={hiddenId}
              rows={2}
              value={draft?.hidden ?? ''}
              autoComplete="off"
              aria-invalid={!!hiddenError}
              aria-describedby={fieldHintId(hiddenId)}
              onChange={(e) => setDraft((d) => ({ search: d?.search ?? '', hidden: e.target.value }))}
              data-testid="section-keywords-hidden"
            />
            <FieldError id={fieldHintId(hiddenId)}>{hiddenError}</FieldError>
          </div>
          <p className="text-caption text-ink-3">Separate terms with commas or new lines. Shoppers never see backend keywords.</p>
        </div>
      }
    >
      <TermList label="Search terms" terms={search} />
      <TermList label="Backend keywords" terms={hidden} className="mt-2" />
      <KeywordReasons reasons={listing.content!.keyword_reasons} terms={[...search, ...hidden]} />
    </SectionShell>
  )
}

/** Why the agent chose each term, where it comes from and where the copy uses it. */
function KeywordReasons({ reasons, terms }: { reasons: Parameters<typeof keywordWhy>[0]; terms: readonly string[] }) {
  const rows = keywordWhy(reasons, terms)
  if (!rows.length) return null
  return (
    <details className="group mt-3 text-small" data-testid="section-keywords-why">
      <summary className="focus-ring w-fit cursor-pointer rounded-sm font-semibold text-brand marker:content-none">
        Why these terms
      </summary>
      <ul className="mt-1.5 flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.term} className="min-w-0">
            <p className="break-words font-medium text-ink">{r.term}</p>
            <p className="break-words text-ink-2">Why: {r.why}</p>
            <p className="text-caption text-ink-3">
              {r.source} · {r.usedIn}
            </p>
          </li>
        ))}
      </ul>
    </details>
  )
}

function TermList({ label, terms, className }: { label: string; terms: readonly string[]; className?: string }) {
  return (
    <div className={className}>
      <p className="text-caption text-ink-3">{label}</p>
      <p className="text-small break-words text-ink">{terms.length ? terms.join(', ') : 'None yet.'}</p>
    </div>
  )
}

/* ---- Attributes ---- */

function AttributesCard(props: Shared) {
  const { listing } = props
  const canonical = listing.content!
  const attributes = canonical.attributes ?? {}
  const fromProduct = new Set(Object.keys(canonical.attribute_sources ?? {}))
  const keys = Object.keys(attributes).sort()
  const actions = useSectionActions('attributes', props)
  const [draft, setDraft] = useState<Record<string, string> | null>(null)
  const [tried, setTried] = useState(false)
  const base = useId()
  const locked = new Set(sectionLocks('attributes', listing.locked_paths))
  const editable = keys.filter((k) => !fromProduct.has(k))
  // Only the values the seller changed are parsed and sent: an untouched value stays exactly as
  // stored (a list item with a comma, edge spaces), so it is never re-typed or locked.
  const touched = draft ? editable.filter((k) => (draft[k] ?? '') !== attributeText(attributes[k] as AttributeValue)) : []
  const parsed: Record<string, ReturnType<typeof parseAttribute>> = draft
    ? Object.fromEntries(touched.map((k) => [k, parseAttribute(attributeKind(attributes[k] as AttributeValue), draft[k] ?? '')]))
    : {}
  const hasError = Object.values(parsed).some((p) => p.error)
  const close = () => {
    setDraft(null)
    setTried(false)
    actions.clearRefusal()
  }
  return (
    <SectionShell
      section="attributes"
      {...props}
      actions={actions}
      counter={`${keys.length} ${keys.length === 1 ? 'value' : 'values'}`}
      editing={draft !== null}
      editState={editable.length ? props.editState : { show: props.editState.show, enabled: false, reason: 'These values come from your product. Change them on the product page.' }}
      onEdit={() => setDraft(Object.fromEntries(editable.map((k) => [k, attributeText(attributes[k] as AttributeValue)])))}
      onCancel={close}
      onSave={() => {
        setTried(true)
        if (hasError) return
        const next: Record<string, AttributeValue> = { ...attributes }
        for (const k of touched) next[k] = parsed[k]!.value as AttributeValue
        actions.save(sectionPatch(canonical, { section: 'attributes', attributes: next }), close)
      }}
      editor={
        <div className="flex flex-col gap-2">
          {editable.map((k, i) => {
            const id = `${base}-${i}`
            const kind = attributeKind(attributes[k] as AttributeValue)
            const err = tried ? parsed[k]?.error : undefined
            const refused = actions.refusal?.path === `attributes.${k}`
            return (
              <div key={k} className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:items-start sm:gap-3">
                <label htmlFor={id} className="pt-2 text-small text-ink-2">
                  {attributeLabel(k)}
                </label>
                <div>
                  {kind === 'boolean' ? (
                    <select
                      id={id}
                      className="focus-ring h-9 w-full rounded-control border border-line bg-field px-2 text-body text-ink"
                      value={draft?.[k] ?? 'No'}
                      onChange={(e) => setDraft((d) => ({ ...(d ?? {}), [k]: e.target.value }))}
                    >
                      <option>Yes</option>
                      <option>No</option>
                    </select>
                  ) : (
                    <Input
                      id={id}
                      value={draft?.[k] ?? ''}
                      inputMode={kind === 'number' ? 'decimal' : undefined}
                      autoComplete="off"
                      aria-invalid={!!err || refused}
                      aria-describedby={fieldHintId(id)}
                      onChange={(e) => setDraft((d) => ({ ...(d ?? {}), [k]: e.target.value }))}
                      data-testid={`section-attributes-input-${k}`}
                    />
                  )}
                  <FieldError id={fieldHintId(id)}>{err}</FieldError>
                </div>
              </div>
            )
          })}
          {fromProduct.size ? <p className="text-caption text-ink-3">Values from your product are changed on the product page.</p> : null}
        </div>
      }
    >
      {keys.length ? (
        <dl className="m-0 grid gap-x-3 gap-y-1 text-small sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]" data-testid="section-attributes-value">
          {keys.map((k) => (
            <div key={k} className="contents">
              <dt className="text-ink-2">{attributeLabel(k)}</dt>
              <dd className="m-0 flex min-w-0 items-center gap-1.5 break-words text-ink">
                {attributeText(attributes[k] as AttributeValue)}
                {fromProduct.has(k) ? <span className="text-caption text-ink-3">· from your product</span> : null}
                {locked.has(`attributes.${k}`) ? <Icon name="lock" size={12} aria-label="Locked" /> : null}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-small text-ink-2">No attributes yet.</p>
      )}
    </SectionShell>
  )
}
