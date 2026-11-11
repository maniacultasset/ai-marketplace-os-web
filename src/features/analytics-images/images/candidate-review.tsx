import { useEffect, useRef, useState } from 'react'
import { describeError, isApiError } from '@/api/errors'
import type { Schema } from '@/api/types'
import { Icon } from '@/components/la/icons'
import { UnavailableButton } from '@/components/la/unavailable'
import { ReferenceId } from '@/components/states/reference-id'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useAcceptCandidate, useCreateCandidate, useRejectCandidate } from './candidates-api'
import type { CandidateSession } from './candidate-session'
import {
  ACTION_LABEL,
  AI_HINT,
  AI_LIMIT_COPY,
  AI_OFF_COPY,
  APPLIED_COPY,
  appliedFrom,
  CACHE_HIT_COPY,
  candidateErrorCopy,
  canStart,
  FAILURE_COPY,
  FREE_HINT,
  fixState,
  isAiOff,
  isCacheHit,
  openCandidates,
  RESULT_LABEL,
  RETRYABLE,
  WORKING_LABEL,
  type Candidate,
  type CandidateKind,
} from './candidates-model'

/**
 * The fixes for one source (a main image, or the size chart when `sourceId` is null): the buttons,
 * then each open candidate's review. `kinds` are the buttons the product read offers.
 */
export function CandidateBlock({
  productId,
  sourceId,
  kinds,
  candidates,
  listPending,
  session,
  canAct,
  aiLimit,
  onPreviewError,
  hasSizeChartImage = false,
  imageUrlOf,
}: {
  productId: string
  sourceId: string | null
  kinds: readonly CandidateKind[]
  candidates: readonly Candidate[] | undefined
  /** The candidate list is on its first read: hold the place, never flash the buttons. */
  listPending: boolean
  session: CandidateSession
  /** product:import (owner, operator). Others see results, never the buttons. */
  canAct: boolean
  aiLimit: boolean
  /** A preview URL expired (signed for 10 minutes): read the list again. */
  onPreviewError: () => void
  /** The product already has a size chart image, so a new one replaces it. */
  hasSizeChartImage?: boolean
  /** A product image's view URL, when the product read has it (to show an applied result). */
  imageUrlOf?: (imageId: string) => string | null | undefined
}) {
  const create = useCreateCandidate(productId)
  const [createError, setCreateError] = useState<{ kind: CandidateKind; error: unknown } | null>(null)
  // The API said the result already took this place: which kind, and its image.
  const [answered, setAnswered] = useState<{ kind: CandidateKind; imageId: string | null } | null>(null)
  // One call per click: React disables the button a render later than a fast double click.
  const creating = useRef(false)
  const open = openCandidates(candidates, sourceId, session.hidden)
  const busy = open.some((c) => c.status === 'queued')
  // A used photo is never the main again: the list knows before the product read catches up.
  const used = appliedFrom(candidates, sourceId)
  const applied = answered ?? (used ? { kind: used.kind, imageId: used.accepted_image_id ?? null } : null)
  // A photo that was replaced offers no fix; a size chart keeps its button (its chart may change).
  const replaced = applied !== null && applied.kind !== 'size_chart'
  const shown = canAct && !replaced ? kinds : []

  if (listPending && (shown.length || open.length))
    return (
      <div className="flex gap-2 px-5 pb-3" role="status" aria-busy="true" aria-label="Loading image fixes">
        {shown.map((k) => (
          <Skeleton key={k} className="h-8 w-40 rounded-control" />
        ))}
      </div>
    )
  if (!shown.length && !open.length && !applied) return null

  const make = (kind: CandidateKind) => {
    if (creating.current) return
    creating.current = true
    setCreateError(null)
    setAnswered(null)
    create.mutate(
      { kind, sourceImageId: sourceId },
      {
        onSuccess: (a) => {
          if (isCacheHit(a)) session.markCacheHit(a.candidate_id)
          // A cached failure answers again: show its reason even if it was closed.
          if (a.status === 'failed') session.unhide(a.candidate_id)
          if (a.status === 'accepted') {
            setAnswered({ kind, imageId: a.accepted_image_id ?? null })
            if (a.accepted_image_id) session.markApplied(a.accepted_image_id, kind)
          }
        },
        onError: (error) => {
          if (isAiOff(error, kind)) session.setAiOff()
          else setCreateError({ kind, error })
        },
        onSettled: () => {
          creating.current = false
        },
      },
    )
  }

  return (
    <div className="flex flex-col gap-3 px-5 pb-4" data-testid="candidate-block" data-source={sourceId ?? 'size_chart'}>
      {shown.length ? (
        <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
          {shown.map((kind) => {
            const ai = kind === 'white_background'
            const blocked = ai ? (session.aiOff ? AI_OFF_COPY : aiLimit ? AI_LIMIT_COPY : null) : null
            const state = fixState(kind, {
              open,
              applied: false,
              starting: create.isPending ? (create.variables?.kind ?? null) : null,
              blocked: blocked !== null,
            })
            return (
              <div key={kind} className="flex flex-col gap-1">
                {blocked ? (
                  <UnavailableButton variant="secondary" size="sm" reason={blocked} data-testid={`make-${kind}`}>
                    <Icon name={ai ? 'spark' : 'image'} size={16} />
                    {ACTION_LABEL[kind]}
                  </UnavailableButton>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    // One open result per kind at a time: Use or Discard it before making another.
                    disabled={!canStart(state)}
                    onClick={() => make(kind)}
                    data-testid={`make-${kind}`}
                    data-state={state}
                  >
                    <Icon name={ai ? 'spark' : 'image'} size={16} />
                    {state === 'starting' ? 'Starting…' : ACTION_LABEL[kind]}
                  </Button>
                )}
                <span className={cn('text-caption', blocked ? 'text-attention-ink' : 'text-ink-3')} data-testid={`hint-${kind}`}>
                  {blocked ?? (ai ? AI_HINT : FREE_HINT)}
                </span>
              </div>
            )
          })}
        </div>
      ) : null}

      {applied ? <AppliedNote kind={applied.kind} src={applied.imageId ? imageUrlOf?.(applied.imageId) : null} /> : null}

      {createError ? (
        <div role="alert" className="flex flex-col gap-0.5 text-small text-danger-ink" data-testid="candidate-create-error">
          <span>{candidateErrorCopy(createError.error, createError.kind, 'create') ?? describeError(createError.error)}</span>
          {isApiError(createError.error) && createError.error.correlationId ? <ReferenceId id={createError.error.correlationId} /> : null}
        </div>
      ) : null}

      {open.map((c) => (
        <CandidateReview
          key={c.id}
          productId={productId}
          candidate={c}
          cacheHit={session.cacheHits.has(c.id)}
          canDecide={canAct}
          onHide={() => session.hide(c.id)}
          onAccepted={session.markAccepted}
          onRetry={canAct && !busy && !create.isPending ? () => make(c.kind) : undefined}
          onPreviewError={onPreviewError}
          replaces={hasSizeChartImage}
        />
      ))}
    </div>
  )
}

/** The result already took this place: say so, with the image when the product read has it. */
export function AppliedNote({ kind, src }: { kind: CandidateKind; src?: string | null }) {
  return (
    <div role="status" className="flex items-center gap-3 text-small text-ink-2" data-testid="candidate-applied" data-kind={kind}>
      {src ? (
        <img src={src} alt={RESULT_LABEL[kind]} className="size-12 shrink-0 rounded-md border border-line bg-subtle object-contain" />
      ) : (
        <Icon name="check" size={16} className="shrink-0 text-success" />
      )}
      <span>{APPLIED_COPY[kind]}</span>
    </div>
  )
}

/** Queued for longer than this: say so plainly (no worker means it stays queued). */
const WAITING_AFTER_MS = 15_000

function useWaiting(c: Candidate) {
  const queued = c.status === 'queued'
  const [waiting, setWaiting] = useState(false)
  useEffect(() => {
    if (!queued) return
    const t = setTimeout(() => setWaiting(true), Math.max(0, WAITING_AFTER_MS - (Date.now() - Date.parse(c.created_at))))
    return () => {
      clearTimeout(t)
      setWaiting(false)
    }
  }, [queued, c.created_at])
  return queued && waiting
}

/** One candidate: progress while queued, side by side with Use / Discard when ready, plain words when failed. */
export function CandidateReview({
  productId,
  candidate: c,
  cacheHit,
  canDecide,
  onHide,
  onRetry,
  onPreviewError,
  onAccepted,
  replaces = false,
}: {
  productId: string
  /** A size chart result replaces the product's current size chart image. */
  replaces?: boolean
  candidate: Candidate
  cacheHit: boolean
  canDecide: boolean
  onHide: () => void
  onRetry?: () => void
  onPreviewError: () => void
  /** The new image and its check job, so the card can follow it. */
  onAccepted?: (a: Schema<'ImageAccepted'>) => void
}) {
  const accept = useAcceptCandidate(productId)
  const reject = useRejectCandidate(productId)
  const waiting = useWaiting(c)
  const deciding = accept.isPending || reject.isPending
  const once = useRef(false)
  const settle = {
    onSettled: () => {
      once.current = false
    },
  }
  const use = () => {
    if (once.current) return
    once.current = true
    accept.mutate(c.id, { ...settle, onSuccess: (a) => onAccepted?.(a) })
  }
  const discard = () => {
    if (once.current) return
    once.current = true
    reject.mutate(c.id, settle)
  }
  const error = accept.error ?? reject.error
  const errorOp = accept.error ? 'accept' : 'discard'
  const twoUp = c.kind !== 'size_chart'

  if (c.status === 'failed') {
    const reason = c.failure_reason ?? 'model_failed'
    return (
      <div
        className="flex flex-wrap items-center justify-between gap-2 rounded-tile border border-attention-line bg-attention-bg px-3 py-2"
        role="status"
        data-testid="candidate-review"
        data-status="failed"
        data-reason={reason}
      >
        <p className="flex items-center gap-2 text-small text-attention-ink">
          <Icon name="alert" size={16} />
          <span>
            <b className="font-semibold">{ACTION_LABEL[c.kind]}:</b> {FAILURE_COPY[reason]}
          </span>
        </p>
        <div className="flex gap-1">
          {onRetry && RETRYABLE.has(reason) ? (
            <Button variant="ghost" size="sm" onClick={onRetry} data-testid="candidate-retry">
              <Icon name="refresh" size={16} />
              Try again
            </Button>
          ) : null}
          <Button variant="ghost" size="icon-sm" aria-label="Close this message" onClick={onHide} data-testid="candidate-hide">
            <Icon name="x" size={16} />
          </Button>
        </div>
      </div>
    )
  }

  const queued = c.status === 'queued'
  return (
    <section
      className="flex flex-col gap-3 rounded-tile border border-line bg-sunken p-3"
      aria-label={`${RESULT_LABEL[c.kind]} for review`}
      aria-busy={queued || undefined}
      data-testid="candidate-review"
      data-status={c.status}
    >
      <div className={cn('grid gap-3', twoUp ? 'grid-cols-2' : 'grid-cols-1 sm:max-w-[50%]')}>
        {twoUp ? (
          <Preview label="Original" src={c.source_preview_url} loading={queued} onError={onPreviewError} />
        ) : null}
        <Preview label={RESULT_LABEL[c.kind]} src={c.preview_url} loading={queued} onError={onPreviewError} ai={c.kind === 'white_background'} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-small text-ink-2" role="status">
          {queued ? (
            <>
              <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-brand motion-safe:animate-pulse" />
              {waiting ? 'Waiting for a worker…' : WORKING_LABEL[c.kind]}
            </>
          ) : (
            <>
              <Icon name="check" size={16} className="text-success" />
              {cacheHit ? `Ready. ${CACHE_HIT_COPY}` : c.kind === 'size_chart' ? (replaces ? 'Ready. Replaces the current size chart image.' : 'Ready. Becomes your size chart image.') : 'Ready. Your original stays as an extra image.'}
            </>
          )}
        </p>
        {!queued && canDecide ? (
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" disabled={deciding} onClick={discard} data-testid="candidate-discard">
              {reject.isPending ? 'Discarding…' : 'Discard'}
            </Button>
            <Button size="sm" disabled={deciding} onClick={use} data-testid="candidate-use">
              {accept.isPending ? 'Saving…' : 'Use this image'}
            </Button>
          </div>
        ) : null}
      </div>
      {error ? (
        <div role="alert" className="flex flex-col gap-0.5 text-small text-danger-ink" data-testid="candidate-decide-error">
          <span>{candidateErrorCopy(error, c.kind, errorOp) ?? describeError(error)}</span>
          {isApiError(error) && error.correlationId ? <ReferenceId id={error.correlationId} /> : null}
        </div>
      ) : null}
    </section>
  )
}

/** One square, same size for both sides, on a neutral ground so the white background reads. */
function Preview({
  label,
  src,
  loading,
  ai = false,
  onError,
}: {
  label: string
  src: string | null | undefined
  loading: boolean
  /** The AI made it: the agent mark beside the label. */
  ai?: boolean
  onError: () => void
}) {
  const [loaded, setLoaded] = useState(false)
  return (
    <figure className="flex min-w-0 flex-col gap-1.5">
      <div className="relative aspect-square w-full overflow-hidden rounded-md border border-line bg-subtle">
        {loading || !src ? (
          <Skeleton className="absolute inset-0 rounded-none" />
        ) : (
          <img
            src={src}
            alt={label}
            onLoad={() => setLoaded(true)}
            onError={onError}
            className={cn(
              'size-full object-contain transition-opacity duration-200 motion-reduce:transition-none',
              loaded ? 'opacity-100' : 'opacity-0',
            )}
          />
        )}
      </div>
      <figcaption className="flex items-center gap-1.5 text-caption text-ink-3">
        {ai ? <Icon name="spark" size={14} /> : null}
        {label}
      </figcaption>
    </figure>
  )
}

/** Badges on a product image row: where it came from, and an original kept after a fix. */
export function OriginBadges({ label, kept }: { label: string | null; kept: boolean }) {
  if (!label && !kept) return null
  return (
    <>
      {label ? (
        <Badge variant={label === RESULT_LABEL.white_background ? 'brand' : 'muted'} data-testid="origin-badge">
          {label === RESULT_LABEL.white_background ? <Icon name="spark" size={14} /> : null}
          {label}
        </Badge>
      ) : null}
      {kept ? (
        <Badge variant="muted" data-testid="kept-badge" title="The photo a fix was made from. It stays as an extra image.">
          Original, kept
        </Badge>
      ) : null}
    </>
  )
}
