/**
 * "Tell Kuinn about your brand": a short guided questionnaire in a dialog, one question at a time,
 * every question skippable, ending on the read-back "How Kuinn will write for you" where any line
 * can be changed before saving. Saving is the caller's (BrandVoiceCard: PATCH /brand-profile, and
 * PATCH /tenants/me for the tone question, which is the brand's own tone field).
 *
 * The dialog is portaled, so on the Brand page it never sits inside the profile <form>: Enter in a
 * field here never saves the profile.
 */
import { useState, type KeyboardEvent } from 'react'
import { isApiError } from '@/api/errors'
import { Banner } from '@/components/la/banner'
import { Icon } from '@/components/la/icons'
import { ProgressBar } from '@/components/la/progress'
import { ReferenceId } from '@/components/states/reference-id'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  addToList,
  hasPick,
  LIST_CAP,
  PRICE_SEGMENTS,
  STEP_OF,
  TEXT_CAP,
  togglePick,
  TONE_PICKS,
  VOICE_STEPS,
  voiceProblems,
  voiceSummary,
  type ListKey,
  type TextKey,
  type VoiceDraft,
  type VoiceStepId,
} from './voice-model'

/** Shown on every step and on the summary: what the answers do, and what they never do. */
export const FACTS_WIN_COPY = 'Product facts always win. This only shapes the tone and what to bring forward.'

const QUESTIONS = VOICE_STEPS.length - 1

export function VoiceQuestionnaire({
  open,
  initial,
  startAt = 'about',
  saving,
  error,
  stale,
  onSave,
  onClose,
}: {
  open: boolean
  initial: VoiceDraft
  startAt?: VoiceStepId
  saving: boolean
  error: unknown
  /** Someone saved a newer version meanwhile: the answers here are kept, and Save sends them again. */
  stale: boolean
  onSave: (draft: VoiceDraft) => void
  onClose: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="sm:max-w-lg" data-testid="voice-dialog" showCloseButton={!saving}>
        {/* Radix unmounts the content when closed, so each opening starts from `initial`. */}
        <Steps initial={initial} startAt={startAt} saving={saving} error={error} stale={stale} onSave={onSave} onClose={onClose} />
      </DialogContent>
    </Dialog>
  )
}

function Steps({
  initial,
  startAt,
  saving,
  error,
  stale,
  onSave,
  onClose,
}: {
  initial: VoiceDraft
  startAt: VoiceStepId
  saving: boolean
  error: unknown
  stale: boolean
  onSave: (draft: VoiceDraft) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState(initial)
  const [index, setIndex] = useState(() => Math.max(0, VOICE_STEPS.findIndex((s) => s.id === startAt)))
  const step = VOICE_STEPS[index]!
  const summary = step.id === 'summary'
  const problems = voiceProblems(draft)
  const stepProblem = (Object.entries(problems) as [TextKey | ListKey, string][]).find(([k]) => STEP_OF[k] === step.id)
  const set = (next: Partial<VoiceDraft>) => setDraft((d) => ({ ...d, ...next }))
  const go = (to: number) => setIndex(Math.max(0, Math.min(VOICE_STEPS.length - 1, to)))
  const firstProblemStep = Object.keys(problems).length
    ? VOICE_STEPS.findIndex((s) => s.id === STEP_OF[Object.keys(problems)[0] as TextKey | ListKey])
    : -1

  return (
    <>
      <DialogHeader>
        <p className="text-caption font-semibold text-ink-3" data-testid="voice-progress">
          {summary ? 'Your answers' : `Question ${index + 1} of ${QUESTIONS}`}
        </p>
        <ProgressBar value={summary ? 1 : index / QUESTIONS} label="Questionnaire progress" />
        <DialogTitle className="pt-1">{step.title}</DialogTitle>
        <DialogDescription>{step.sub}</DialogDescription>
      </DialogHeader>

      <div className="flex min-h-40 flex-col gap-3" data-testid={`voice-step-${step.id}`}>
        {step.id === 'about' ? (
          <TextAnswer id="voice-description" field="description" label="About your brand" draft={draft} set={set} rows={3} placeholder="e.g. Hand-block printed cotton wear from Jaipur." />
        ) : step.id === 'audience' ? (
          <TextAnswer id="voice-audience" field="audience" label="Who buys it" draft={draft} set={set} rows={3} placeholder="e.g. Women 25 to 40 who want easy office wear." />
        ) : step.id === 'price' ? (
          <PriceAnswer value={draft.price_segment} onChange={(price_segment) => set({ price_segment })} />
        ) : step.id === 'tone' ? (
          <>
            <TonePicks tone={draft.tone} onChange={(tone) => set({ tone })} />
            <TextAnswer id="voice-tone" field="tone" label="Tone of voice" draft={draft} set={set} rows={3} placeholder="e.g. Warm and calm. Short sentences. No hype." />
          </>
        ) : step.id === 'different' ? (
          <>
            <TextAnswer id="voice-positioning" field="positioning" label="How you want to be seen" draft={draft} set={set} rows={2} placeholder="e.g. Everyday handloom, made to last." />
            <ListAnswer id="voice-differentiators" field="differentiators" label="What sets you apart" draft={draft} set={set} placeholder="e.g. Pre-washed cotton" />
          </>
        ) : step.id === 'words' ? (
          <>
            <ListAnswer id="voice-use" field="words_to_use" label="Words to use" draft={draft} set={set} placeholder="e.g. breathable" />
            <ListAnswer id="voice-avoid" field="words_to_avoid" label="Words to avoid" draft={draft} set={set} placeholder="e.g. cheap" />
          </>
        ) : step.id === 'claims' ? (
          <ListAnswer id="voice-claims" field="claim_limits" label="Claims you never make" draft={draft} set={set} placeholder="e.g. No organic claims" />
        ) : step.id === 'example' ? (
          <TextAnswer id="voice-example" field="example_copy" label="Copy you like" draft={draft} set={set} rows={5} placeholder="Paste a few lines from a listing or your website." />
        ) : (
          <Summary draft={draft} onChange={(s) => go(VOICE_STEPS.findIndex((x) => x.id === s))} />
        )}
        {stepProblem ? (
          <p role="alert" className="text-small font-semibold text-danger">
            {stepProblem[1]}
          </p>
        ) : null}
        {summary && stale ? (
          <Banner tone="attention" role="alert" title="Someone saved a newer version">
            Your answers are kept here. Save again to use them.
          </Banner>
        ) : null}
        {summary && error ? (
          <Banner tone="danger" role="alert" title="Couldn’t save your answers">
            {isApiError(error) && error.status === 422 ? 'One of the answers can’t be saved as it is. Check it and try again.' : 'Something went wrong. Try again.'}
            {isApiError(error) ? <ReferenceId id={error.correlationId} className="mt-1" /> : null}
          </Banner>
        ) : null}
        <p className="flex items-start gap-1.5 text-caption text-ink-3">
          <Icon name="info" size={14} className="mt-px shrink-0" />
          {FACTS_WIN_COPY}
        </p>
      </div>

      <DialogFooter className="flex-row items-center justify-between sm:justify-between">
        <div>
          {index > 0 ? (
            <Button type="button" variant="ghost" onClick={() => go(index - 1)} disabled={saving}>
              Back
            </Button>
          ) : (
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          {summary ? (
            <Button
              type="button"
              onClick={() => (firstProblemStep >= 0 ? go(firstProblemStep) : onSave(draft))}
              disabled={saving}
              data-testid="voice-save"
            >
              {saving ? <Spinner data-icon="inline-start" aria-hidden /> : null}
              {saving ? 'Saving…' : 'Save answers'}
            </Button>
          ) : (
            <>
              <Button type="button" variant="ghost" onClick={() => go(QUESTIONS)} data-testid="voice-to-summary">
                Skip to the end
              </Button>
              <Button type="button" onClick={() => go(index + 1)} disabled={!!stepProblem} data-testid="voice-next">
                {stepHasAnswer(step.id, draft) ? 'Next' : 'Skip'}
              </Button>
            </>
          )}
        </div>
      </DialogFooter>
    </>
  )
}

function stepHasAnswer(step: VoiceStepId, d: VoiceDraft): boolean {
  switch (step) {
    case 'about':
      return !!d.description.trim()
    case 'audience':
      return !!d.audience.trim()
    case 'price':
      return d.price_segment !== null
    case 'tone':
      return !!d.tone.trim()
    case 'different':
      return !!d.positioning.trim() || d.differentiators.length > 0
    case 'words':
      return d.words_to_use.length > 0 || d.words_to_avoid.length > 0
    case 'claims':
      return d.claim_limits.length > 0
    case 'example':
      return !!d.example_copy.trim()
    default:
      return true
  }
}

function TextAnswer({
  id,
  field,
  label,
  draft,
  set,
  rows,
  placeholder,
}: {
  id: string
  field: TextKey
  label: string
  draft: VoiceDraft
  set: (next: Partial<VoiceDraft>) => void
  rows: number
  placeholder: string
}) {
  const max = TEXT_CAP[field]
  const length = draft[field].trim().length
  return (
    <div className="space-y-1.5">
      <div className="flex items-end justify-between gap-3">
        <label htmlFor={id} className="text-small font-semibold text-ink">
          {label}
        </label>
        <span className={cn('text-caption tabular-nums', length > max ? 'text-danger' : 'text-ink-3')}>
          {length.toLocaleString('en-IN')} / {max.toLocaleString('en-IN')}
        </span>
      </div>
      <Textarea
        id={id}
        value={draft[field]}
        rows={rows}
        maxLength={max * 2}
        autoComplete="off"
        placeholder={placeholder}
        aria-invalid={length > max || undefined}
        onChange={(e) => set({ [field]: e.target.value } as Partial<VoiceDraft>)}
      />
    </div>
  )
}

function PriceAnswer({ value, onChange }: { value: VoiceDraft['price_segment']; onChange: (v: VoiceDraft['price_segment']) => void }) {
  return (
    <div role="radiogroup" aria-label="Price segment" className="grid grid-cols-2 gap-2">
      {PRICE_SEGMENTS.map((s) => {
        const on = s.value === value
        return (
          <button
            key={s.value}
            type="button"
            role="radio"
            aria-checked={on}
            // a second click clears it: the question stays skippable
            onClick={() => onChange(on ? null : s.value)}
            className={cn(
              'rounded-tile border px-3 py-2.5 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand',
              on ? 'border-brand bg-[var(--tile-brand-bg)]' : 'border-line bg-surface hover:bg-hover',
            )}
          >
            <span className="block text-small font-semibold text-ink">{s.label}</span>
            <span className="block text-caption text-ink-2">{s.hint}</span>
          </button>
        )
      })}
    </div>
  )
}

function TonePicks({ tone, onChange }: { tone: string; onChange: (tone: string) => void }) {
  return (
    <div role="group" aria-label="Tone quick picks" className="flex flex-wrap gap-1.5" data-testid="voice-tone-picks">
      {TONE_PICKS.map((p) => {
        const on = hasPick(tone, p)
        return (
          <button
            key={p}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(togglePick(tone, p))}
            className={cn(
              'rounded-full border px-3 py-1 text-small transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand',
              on ? 'border-brand bg-[var(--tile-brand-bg)] font-semibold text-ink' : 'border-line bg-surface text-ink-2 hover:bg-hover',
            )}
          >
            {p}
          </button>
        )
      })}
    </div>
  )
}

function ListAnswer({
  id,
  field,
  label,
  draft,
  set,
  placeholder,
}: {
  id: string
  field: ListKey
  label: string
  draft: VoiceDraft
  set: (next: Partial<VoiceDraft>) => void
  placeholder: string
}) {
  const [text, setText] = useState('')
  const items = draft[field]
  const cap = LIST_CAP[field]
  const full = items.length >= cap.items
  const tooLong = text.trim().length > cap.length
  const add = () => {
    if (!text.trim() || full || tooLong) return
    set({ [field]: addToList(items, text) } as Partial<VoiceDraft>)
    setText('')
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      add()
    }
  }
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-small font-semibold text-ink">
        {label}
      </label>
      <div className="flex gap-2">
        <Input
          id={id}
          value={text}
          maxLength={cap.length * 2}
          autoComplete="off"
          placeholder={full ? `Up to ${cap.items}` : placeholder}
          disabled={full}
          aria-invalid={tooLong || undefined}
          aria-describedby={`${id}-hint`}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
        />
        <Button type="button" variant="secondary" onClick={add} disabled={!text.trim() || full || tooLong} aria-label={`Add to ${label.toLowerCase()}`}>
          Add
        </Button>
      </div>
      <p id={`${id}-hint`} className={cn('text-caption', tooLong ? 'text-danger' : 'text-ink-3')}>
        {tooLong ? `Keep it to ${cap.length} characters.` : `Press Enter to add. ${items.length} of ${cap.items}.`}
      </p>
      {items.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label={label}>
          {items.map((item) => (
            <li key={item} className="inline-flex max-w-full items-center gap-1 rounded-full border border-line bg-subtle py-0.5 pr-1 pl-2.5 text-small text-ink">
              <span className="min-w-0 truncate">{item}</span>
              <button
                type="button"
                className="grid size-5 place-items-center rounded-full text-ink-3 hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
                aria-label={`Remove ${item}`}
                onClick={() => set({ [field]: items.filter((x) => x !== item) } as Partial<VoiceDraft>)}
              >
                <Icon name="x" size={12} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function Summary({ draft, onChange }: { draft: VoiceDraft; onChange: (step: VoiceStepId) => void }) {
  const lines = voiceSummary(draft)
  if (!lines.length)
    return (
      <p className="text-small text-ink-2" data-testid="voice-summary-empty">
        Nothing answered yet. Kuinn writes from your product facts and your tone. Go back to answer any question, or close this and do it later.
      </p>
    )
  return <VoiceSummaryList lines={lines} onChange={onChange} />
}

/** The read-back list, also shown on the Brand page and in setup once answers are saved. */
export function VoiceSummaryList({
  lines,
  onChange,
}: {
  lines: ReturnType<typeof voiceSummary>
  onChange?: (step: VoiceStepId) => void
}) {
  return (
    <dl className="divide-y divide-line rounded-tile border border-line" data-testid="voice-summary">
      {lines.map((l, i) => (
        <div key={`${l.step}-${i}`} className="flex items-start gap-3 px-3 py-2">
          <dt className="w-28 shrink-0 text-caption font-semibold text-ink-3">{l.label}</dt>
          <dd className="min-w-0 flex-1 text-small break-words whitespace-pre-line text-ink line-clamp-3">{l.text}</dd>
          {onChange ? (
            <Button type="button" variant="link" size="sm" className="shrink-0 text-caption" onClick={() => onChange(l.step)} aria-label={`Change ${l.label.toLowerCase()}`}>
              Change
            </Button>
          ) : null}
        </div>
      ))}
    </dl>
  )
}
