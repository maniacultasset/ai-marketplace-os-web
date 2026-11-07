/**
 * Inbox > a fact question (SI3: `missing_fact`, `conflicting_facts` on `facts.attributes.<key>`):
 * what the photos suggest, the seller's value now (for a conflict), and an input that matches the
 * question's AnswerSpec. Sends POST /tasks/{task_id}/answer with an Idempotency-Key; a 422 at
 * `value` lands under the input. The parent keeps the result on screen once the list refreshes.
 *
 * Inputs by kind: enum → choice chips, boolean → Yes/No chips, text → a field with its limit,
 * number → a number field with its range, money_inr → a ₹ field, percent_composition → a fabric
 * mix field, acknowledge → one button. multi_enum cannot be sent over HTTP yet: read only.
 */
import { Link } from '@tanstack/react-router'
import { useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { Banner, fieldHintId, Icon, LaField, SourceBadge } from '@/components/la'
import { UnavailableButton } from '@/components/la/unavailable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import type { Schema } from '@/api/types'
import { OP_ACTION, useCan } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { useAnswerTask, type AnswerBody } from './answer-api'
import {
  answerFailure,
  answerMode,
  answerText,
  checkAnswer,
  factKey,
  fold,
  isPhotoQuestion,
  parseAnswerSpec,
  taskSuggestions,
  type AnswerFailure,
  type AnswerSpec,
  type Suggestion,
} from './answer-spec'
import { factLabel } from './model'

type Task = Schema<'TaskOut'>

/** What happened to a question answered (or found closed) on this screen. */
export type AnswerOutcome =
  | { kind: 'answered'; task: Task; body: AnswerBody }
  | { kind: 'closed'; task: Task; message: string }

/** Chips shown before "Show all": the rest stay one click away. */
const CHIPS_SHOWN = 12

export function AnswerCard({ task, onOutcome }: { task: Task; onOutcome: (o: AnswerOutcome) => void }) {
  const can = useCan()
  const allowed = can(OP_ACTION['POST /tasks/{task_id}/answer'])
  const key = factKey(task)
  const spec = useMemo(() => parseAnswerSpec(task.expected_answer, key), [task.expected_answer, key])
  const mode = answerMode(spec)
  const suggestions = useMemo(() => taskSuggestions(task), [task])
  const mutation = useAnswerTask(task)
  const [draft, setDraft] = useState<string | boolean | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [failure, setFailure] = useState<AnswerFailure | null>(null)
  const [tries, setTries] = useState(0)
  const formRef = useRef<HTMLFormElement>(null)
  const id = useId()

  const send = async (body: AnswerBody) => {
    setFailure(null)
    try {
      const saved = await mutation.mutateAsync(body)
      onOutcome({ kind: 'answered', task: saved, body })
    } catch (err) {
      const f = answerFailure(err)
      if (f.kind === 'field') setFieldError(f.message)
      else if (f.kind === 'closed') onOutcome({ kind: 'closed', task, message: f.message })
      else setFailure(f)
    }
  }

  const submit = () => {
    setTries((n) => n + 1)
    const checked = checkAnswer(spec, draft)
    if (!checked.ok) {
      setFieldError(checked.error)
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('input:not(:disabled)')?.focus())
      return
    }
    setFieldError(null)
    void send({ value: checked.value })
  }

  const change = (v: string | boolean) => {
    setDraft(v)
    if (fieldError) setFieldError(null)
  }

  const photo = suggestions.filter((s) => s.from === 'photo')
  const yours = suggestions.filter((s) => s.from === 'you')
  const busy = mutation.isPending
  const label = key ? factLabel(key) : 'Answer'

  return (
    <section className="flex flex-col gap-4" aria-label="Your answer" data-testid="answer-card" data-answer-kind={spec.kind}>
      {photo.length || yours.length ? (
        <dl className="grid grid-cols-[minmax(96px,max-content)_minmax(0,1fr)] items-baseline gap-x-3 gap-y-2 text-small" data-testid="answer-context">
          {photo.length ? (
            <div className="contents">
              <dt className="text-ink-2">{photo.length > 1 ? 'Photos suggest' : 'Photo suggests'}</dt>
              <dd className="flex flex-wrap items-center gap-2 text-ink">
                {photo.map((s) => (
                  <span key={String(s.value)} className="font-semibold">
                    {answerText(s.label)}
                  </span>
                ))}
                <SourceBadge source={{ kind: 'photo' }} />
              </dd>
            </div>
          ) : null}
          {yours.length ? (
            <div className="contents">
              <dt className="text-ink-2">On the product now</dt>
              <dd className="flex flex-wrap items-center gap-2 text-ink">
                <span className="font-semibold">{answerText(yours[0]!.label)}</span>
                <SourceBadge source={{ kind: 'you' }} />
                <span className="text-caption text-ink-3">Stays in use until you answer.</span>
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {!allowed ? (
        <Banner tone="neutral" icon="lock">
          <span data-testid="answer-no-permission">Only people who can edit products can answer this. Ask an owner, admin or operator.</span>
        </Banner>
      ) : mode.mode === 'read-only' ? (
        <>
          {spec.kind === 'multi_enum' && spec.allowed.length ? (
            <ul className="flex flex-wrap gap-2" aria-label="Options">
              {spec.allowed.map((v) => (
                <li key={v} className="inline-flex min-h-8 items-center rounded-full border border-line bg-subtle px-3 text-small text-ink-2">
                  {answerText(v)}
                </li>
              ))}
            </ul>
          ) : null}
          <Banner tone="neutral" icon="info">
            <span data-testid="answer-read-only">{mode.reason}</span>
          </Banner>
          <TaskProductLink task={task} />
        </>
      ) : (
        <form
          ref={formRef}
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            if (mode.mode === 'acknowledge') void send({ skip: true })
            else submit()
          }}
        >
          {mode.mode === 'input' ? (
            <AnswerInput
              id={`${id}-answer`}
              spec={spec}
              label={label}
              suggestions={suggestions}
              draft={draft}
              onChange={change}
              error={fieldError}
              tries={tries}
              disabled={busy}
            />
          ) : null}
          {failure ? (
            <Banner tone="danger" role="alert" title="Not saved">
              {failure.message}
            </Banner>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Button type="submit" size="lg" className="max-sm:h-[52px] max-sm:w-full" disabled={busy} data-testid="answer-submit">
              {busy ? <Spinner data-icon="inline-start" aria-hidden /> : null}
              {busy ? 'Saving…' : mode.mode === 'acknowledge' ? 'Got it' : 'Save answer'}
            </Button>
            {mode.mode === 'input' ? (
              <Button type="button" variant="ghost" size="lg" disabled={busy} onClick={() => void send({ skip: true })} data-testid="answer-skip">
                Skip this question
              </Button>
            ) : null}
            <UnavailableButton reason="Assigning a question to a teammate is not available yet." variant="ghost" size="lg">
              Ask a teammate
            </UnavailableButton>
          </div>
          <p className="text-caption text-ink-3">
            {isPhotoQuestion(task)
              ? 'Your answer becomes the product’s value. A skip changes nothing.'
              : 'Your answer becomes the product’s value.'}
          </p>
        </form>
      )}
    </section>
  )
}

/* -------------------------------------------------------------------------------- Inputs */

function AnswerInput({
  id,
  spec,
  label,
  suggestions,
  draft,
  onChange,
  error,
  tries,
  disabled,
}: {
  id: string
  spec: AnswerSpec
  label: string
  suggestions: readonly Suggestion[]
  draft: string | boolean | null
  onChange: (v: string | boolean) => void
  error: string | null
  tries: number
  disabled: boolean
}) {
  const text = typeof draft === 'string' ? draft : ''
  switch (spec.kind) {
    case 'enum':
      return <EnumChips id={id} label={label} allowed={spec.allowed} suggestions={suggestions} value={typeof draft === 'string' ? draft : null} onChange={onChange} error={error} disabled={disabled} />
    case 'boolean':
      return (
        <Chips id={id} legend={label} error={error} disabled={disabled}>
          {[true, false].map((v) => (
            <Chip key={String(v)} name={id} checked={draft === v} onChange={() => onChange(v)} disabled={disabled} testId="answer-chip">
              {v ? 'Yes' : 'No'}
            </Chip>
          ))}
        </Chips>
      )
    case 'text': {
      const limit = Math.min(spec.maxLength ?? 2000, 2000)
      return (
        <LaField label={label} htmlFor={id} error={error ?? undefined} hint={`${text.length}/${limit} characters`} submitCount={tries}>
          <Input id={id} value={text} onChange={(e) => onChange(e.target.value)} maxLength={limit} autoComplete="off" disabled={disabled} aria-invalid={error ? true : undefined} aria-describedby={fieldHintId(id)} data-testid="answer-input" />
        </LaField>
      )
    }
    case 'number': {
      const range = spec.min !== null && spec.max !== null ? `From ${spec.min} to ${spec.max}` : spec.min !== null ? `${spec.min} or more` : spec.max !== null ? `${spec.max} or less` : null
      const hint = [spec.integer ? 'A whole number' : null, range ? range.toLocaleLowerCase('en') : null].filter(Boolean).join(', ')
      return (
        <LaField label={spec.unit ? `${label} (${spec.unit})` : label} htmlFor={id} error={error ?? undefined} hint={hint ? `${hint.charAt(0).toLocaleUpperCase('en')}${hint.slice(1)}.` : undefined} submitCount={tries}>
          <Input
            id={id}
            value={text}
            onChange={(e) => onChange(e.target.value)}
            inputMode={spec.integer ? 'numeric' : 'decimal'}
            autoComplete="off"
            maxLength={24}
            className="max-w-48 tabular-nums"
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={fieldHintId(id)}
            data-testid="answer-input"
          />
        </LaField>
      )
    }
    case 'money_inr':
      return (
        <LaField label={label} htmlFor={id} error={error ?? undefined} hint="In rupees, like 1299 or 1299.50." submitCount={tries}>
          <div className="relative max-w-56">
            <span aria-hidden className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-body text-ink-2">
              ₹
            </span>
            <Input id={id} value={text} onChange={(e) => onChange(e.target.value)} inputMode="decimal" autoComplete="off" placeholder="0" maxLength={24} className="pl-7 tabular-nums" disabled={disabled} aria-invalid={error ? true : undefined} aria-describedby={fieldHintId(id)} data-testid="answer-input" />
          </div>
        </LaField>
      )
    case 'percent_composition':
      return (
        <LaField label={label} htmlFor={id} error={error ?? undefined} hint="Each fibre with its percent, like 95% Cotton, 5% Elastane." submitCount={tries}>
          <Input id={id} value={text} onChange={(e) => onChange(e.target.value)} maxLength={2000} autoComplete="off" disabled={disabled} aria-invalid={error ? true : undefined} aria-describedby={fieldHintId(id)} data-testid="answer-input" />
        </LaField>
      )
    default:
      return null
  }
}

/** Suggested values first (marked), then the other allowed values; long lists fold after 12. */
function EnumChips({
  id,
  label,
  allowed,
  suggestions,
  value,
  onChange,
  error,
  disabled,
}: {
  id: string
  label: string
  allowed: readonly string[]
  suggestions: readonly Suggestion[]
  value: string | null
  onChange: (v: string) => void
  error: string | null
  disabled: boolean
}) {
  const [all, setAll] = useState(false)
  const options = useMemo(() => {
    const tag = new Map<string, Suggestion['from']>()
    for (const s of suggestions) if (typeof s.value === 'string' && !tag.has(fold(s.value))) tag.set(fold(s.value), s.from)
    const hit = (v: string) => tag.get(fold(v))
    const first = allowed.filter((v) => hit(v) === 'photo' || hit(v) === 'you')
    return [...first, ...allowed.filter((v) => !first.includes(v))].map((v) => ({ value: v, from: hit(v) }))
  }, [allowed, suggestions])
  const picked = value !== null ? options.findIndex((o) => o.value === value) : -1
  const limit = Math.max(CHIPS_SHOWN, picked + 1)
  const shown = all || options.length <= limit + 1 ? options : options.slice(0, limit)
  return (
    <Chips id={id} legend={label} error={error} disabled={disabled}>
      {shown.map((o) => (
        <Chip key={o.value} name={id} checked={value === o.value} onChange={() => onChange(o.value)} disabled={disabled} testId="answer-chip">
          {answerText(o.value)}
          {o.from === 'photo' ? <span className="text-caption font-normal text-ink-3">· photo</span> : o.from === 'you' ? <span className="text-caption font-normal text-ink-3">· yours now</span> : null}
        </Chip>
      ))}
      {shown.length < options.length ? (
        <Button type="button" variant="ghost" size="sm" className="self-center" onClick={() => setAll(true)} data-testid="answer-show-all">
          Show all {options.length}
          <Icon name="chev" size={14} />
        </Button>
      ) : null}
    </Chips>
  )
}

function Chips({ id, legend, error, disabled, children }: { id: string; legend: string; error: string | null; disabled: boolean; children: ReactNode }) {
  return (
    <fieldset className="min-w-0" disabled={disabled} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined}>
      <legend className="mb-1.5 text-small font-bold text-ink">{legend}</legend>
      <div className="flex flex-wrap gap-2">{children}</div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-caption text-danger" data-testid="answer-error">
          {error}
        </p>
      ) : null}
    </fieldset>
  )
}

function Chip({ name, checked, onChange, disabled, children, testId }: { name: string; checked: boolean; onChange: () => void; disabled: boolean; children: ReactNode; testId?: string }) {
  return (
    <label
      className={cn(
        'tactile inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-small font-semibold max-sm:min-h-[52px]',
        'has-[:focus-visible]:shadow-[var(--focus-ring)]',
        checked ? 'border-brand bg-brand-bg text-brand' : 'border-line-strong bg-surface text-ink shadow-raised-sm hover:border-edge-hover',
        disabled && 'cursor-not-allowed opacity-60',
      )}
      data-testid={testId}
      data-checked={checked || undefined}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} disabled={disabled} className="sr-only" />
      {checked ? <Icon name="check" size={14} /> : null}
      {children}
    </label>
  )
}

/* -------------------------------------------------------------------------------- Result */

/** After the answer: what was saved, and the one next step (regenerate on the product page). */
export function AnswerResult({ outcome, next }: { outcome: AnswerOutcome; next?: ReactNode }) {
  const { task } = outcome
  if (outcome.kind === 'closed')
    return (
      <div className="flex flex-col gap-3" data-testid="answer-result" data-result="closed">
        <Banner tone="attention" role="status" title="Already closed">
          {outcome.message}
        </Banner>
        <div className="flex flex-wrap gap-2">
          {next}
          <TaskProductLink task={task} />
        </div>
      </div>
    )
  const skipped = 'skip' in outcome.body
  const key = factKey(task)
  return (
    <div className="flex flex-col gap-3" data-testid="answer-result" data-result={skipped ? 'skipped' : 'answered'}>
      <Banner tone={skipped ? 'neutral' : 'success'} role="status" title={skipped ? 'Skipped' : 'Answer saved'}>
        {skipped ? (
          'Nothing changed on the product.'
        ) : (
          <>
            {key ? `${factLabel(key)} is now ` : 'Saved: '}
            <b data-testid="answer-saved-value">{answerText('value' in outcome.body ? outcome.body.value : '')}</b>. Regenerate the listing to use your answer.
          </>
        )}
      </Banner>
      <div className="flex flex-wrap gap-2">
        {next}
        <TaskProductLink task={task} primary={!skipped && !next} />
      </div>
    </div>
  )
}

function TaskProductLink({ task, primary }: { task: Pick<Task, 'product_id'>; primary?: boolean }) {
  if (!task.product_id) return null
  return (
    <Button asChild variant={primary ? 'primary' : 'secondary'} data-testid="task-open-product">
      <Link to="/products/$productId" params={{ productId: task.product_id }}>
        Open product
      </Link>
    </Button>
  )
}
