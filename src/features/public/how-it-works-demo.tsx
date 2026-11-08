/**
 * "See how it works": the landing page's How it works section as one example listing travelling the
 * workflow (import, draft, check, fix, approve, publish to Amazon), drawn with the real kit. It is
 * labelled as an example and is never app data.
 *
 * Plays only while at least 40% of the moving card is on screen and the tab is visible, and loops
 * with a calm hold on Live. Pause and Replay sit in a toolbar above the step strip, so they are the
 * first stop for the keyboard and a phone reaches them before the motion. Pause freezes
 * everything, the caret included. The narration is announced
 * only after a person picks a step, pauses or replays, never on every autoplay beat. With reduced
 * motion (or no IntersectionObserver) nothing autoplays: it shows the finished state, each step can
 * be viewed on its own and changes are short dissolves. Motion is transform and opacity only.
 */
import { Pause, Play, RotateCcw } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react'
import { Icon, IconGlyph, IconTile } from '@/components/la/icons'
import { MarketplaceTile } from '@/components/la/marketplace'
import { SourceBadge } from '@/components/la/source-badge'
import { CHIP_TONE, StatusChip, TagChip, type ChipStatus } from '@/components/la/status-chip'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  advance,
  beatDelay,
  checksAt,
  DEMO,
  DRAFT,
  FINAL,
  FIX_BEATS,
  FIX_MIDDLE,
  FIX_TAIL,
  fixedText,
  LAST_BEAT,
  LIMIT,
  NARRATION,
  RAIL,
  SCENES,
  START,
  type CheckState,
  type Pos,
  type SceneId,
} from './how-it-works-script'
import { FINDING_LABEL, HERO_EXAMPLE, heroFindings } from './model'

/* ------------------------------------------------------------------------------------------------
 * Environment
 * --------------------------------------------------------------------------------------------- */

const REDUCE = '(prefers-reduced-motion: reduce)'
const mql = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(REDUCE) : null)

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    (cb) => {
      const m = mql()
      m?.addEventListener?.('change', cb)
      return () => m?.removeEventListener?.('change', cb)
    },
    () => mql()?.matches ?? false,
    () => false,
  )
}

/** Moves in with the spring; reduced motion keeps only the fade. */
const SPRING = 'transition-[opacity,transform] duration-[var(--dur-spring)] ease-[var(--ease-spring)] motion-reduce:transform-none'
/** Same, plus a short dissolve under reduced motion instead of a hard cut (index.css). */
const SPRING_FADE = cn(SPRING, 'motion-fade')
/** An element that arrives: `shown` false sits a little below and transparent. */
const arrive = (shown: boolean, from = 'translate-y-2') => cn(SPRING, shown ? 'translate-y-0 opacity-100' : cn(from, 'opacity-0'))
const delay = (ms: number): CSSProperties => ({ transitionDelay: `${ms}ms` })

/* ------------------------------------------------------------------------------------------------
 * Small drawings
 * --------------------------------------------------------------------------------------------- */

function Avatar({ name, tone }: { name: string; tone: 'brand' | 'neutral' }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex size-8 shrink-0 items-center justify-center rounded-full border font-display text-[13px] font-bold shadow-raised-sm',
        tone === 'brand' ? 'border-brand-line bg-brand-bg text-brand' : 'border-line bg-surface text-ink-2',
      )}
    >
      {name[0]}
    </span>
  )
}

function CheckGlyph({ state }: { state: CheckState }) {
  return (
    <span className="relative inline-grid size-5 shrink-0 place-items-center" aria-hidden>
      <span
        className={cn(
          'col-start-1 row-start-1 size-5 rounded-full border border-dashed border-line-strong',
          SPRING,
          state === 'pending' ? 'scale-100 opacity-100' : 'scale-75 opacity-0',
        )}
      />
      <span
        className={cn(
          'col-start-1 row-start-1 inline-grid size-5 place-items-center rounded-full border border-success-line bg-success-bg text-success',
          SPRING,
          state === 'pass' ? 'scale-100 opacity-100' : 'scale-50 opacity-0',
        )}
      >
        <Icon name="check" size={14} />
      </span>
      <span
        className={cn(
          'col-start-1 row-start-1 inline-grid size-5 place-items-center rounded-full border border-danger-line bg-danger-bg text-danger',
          SPRING,
          state === 'fail' ? 'scale-100 opacity-100' : 'scale-50 opacity-0',
        )}
      >
        <Icon name="x" size={14} />
      </span>
    </span>
  )
}

/** A field of the product card. `scan` lays a brand wash over it and sweeps a line across. */
function CardField({ label, value, filled, scan, d, className }: { label: string; value: ReactNode; filled: boolean; scan: boolean; d: number; className?: string }) {
  return (
    <div className={cn('relative min-w-0 overflow-hidden rounded-xs px-2.5 py-1.5', className)}>
      <span aria-hidden className={cn('absolute inset-0 rounded-xs bg-brand-bg transition-opacity duration-300', scan ? 'opacity-100' : 'opacity-0')} />
      <span
        aria-hidden
        className={cn(
          'absolute inset-x-2 bottom-0 h-[2px] origin-left rounded-full bg-brand motion-reduce:hidden',
          scan ? 'scale-x-100 opacity-100 transition-[transform,opacity] duration-[600ms] ease-[var(--ease-spring)]' : 'scale-x-0 opacity-0',
        )}
      />
      <p className="relative text-caption font-bold text-ink-2">{label}</p>
      <div className="relative mt-0.5 grid">
        <span aria-hidden className={cn('col-start-1 row-start-1 mt-1.5 h-2.5 w-24 rounded-full bg-subtle transition-opacity duration-300', filled ? 'opacity-0' : 'opacity-100')} />
        <span className={cn('col-start-1 row-start-1', arrive(filled, '-translate-y-3'))} style={delay(filled ? d : 0)}>
          {value}
        </span>
      </div>
    </div>
  )
}

/** The title with the marks the rules raised, the overflow past Flipkart's limit and the caret. */
function TitleText({
  head,
  tail,
  caret,
  markBanned,
  markOverflow,
  playing,
}: {
  head: string
  tail: string
  caret: 'head' | 'end' | null
  markBanned: boolean
  markOverflow: boolean
  /** The caret blinks only while the demo plays; paused, it holds still. */
  playing: boolean
}) {
  const caretEl = <span aria-hidden className={cn('mx-px inline-block h-[1.15em] w-[2px] translate-y-[0.2em] rounded-full bg-brand', caret && playing && 'caret-blink')} />
  const word = head.trimEnd()
  const space = head.slice(word.length)
  // Characters past the limit, counted on the text as it stands.
  const text = head + FIX_MIDDLE + tail
  const chars = [...text]
  const over = Math.max(0, chars.length - LIMIT)
  const tailChars = [...tail]
  const middleChars = [...FIX_MIDDLE]
  const overInTail = Math.min(over, tailChars.length)
  const overInMiddle = over - overInTail
  const markOver = 'rounded-xs text-danger-ink underline decoration-danger decoration-2 underline-offset-[3px] transition-colors duration-500'
  const plainMiddle = middleChars.slice(0, middleChars.length - overInMiddle).join('')
  const overMiddle = middleChars.slice(middleChars.length - overInMiddle).join('')
  const plainTail = tailChars.slice(0, tailChars.length - overInTail).join('')
  const overTail = tailChars.slice(tailChars.length - overInTail).join('')
  return (
    <>
      {caret === 'head' && !word ? caretEl : null}
      {word ? (
        <mark
          className={cn(
            'rounded-xs bg-transparent text-ink transition-colors duration-500',
            markBanned && 'bg-danger-bg text-danger-ink ring-2 ring-danger-bg',
          )}
        >
          {word}
        </mark>
      ) : null}
      {space}
      {caret === 'head' && word ? caretEl : null}
      {plainMiddle}
      {overMiddle ? <span className={cn(markOverflow && markOver)}>{overMiddle}</span> : null}
      {plainTail}
      {overTail ? <span className={cn(markOverflow && markOver)}>{overTail}</span> : null}
      {caret === 'end' ? caretEl : null}
    </>
  )
}

function CountChip({ len, judged }: { len: number; judged: boolean }) {
  if (!judged) return <TagChip tone="plain" className="tabular-nums">{len} characters</TagChip>
  const ok = len <= LIMIT
  return (
    <span
      className={cn(
        'inline-flex h-[22px] shrink-0 items-center gap-[5px] rounded-full border px-[9px] text-caption font-semibold whitespace-nowrap tabular-nums transition-colors duration-300',
        CHIP_TONE[ok ? 'success' : 'danger'],
      )}
    >
      <Icon name={ok ? 'check' : 'x'} size={14} />
      {len} / {LIMIT}
    </span>
  )
}

/* ------------------------------------------------------------------------------------------------
 * The stage: one listing card whose lower panel morphs per step
 * --------------------------------------------------------------------------------------------- */

function headerChip(scene: SceneId, beat: number): { status: ChipStatus; label: string } {
  switch (scene) {
    case 'import':
      return { status: 'draft', label: 'Imported' }
    case 'draft':
      return beat >= 4 ? { status: 'draft', label: 'Draft ready' } : { status: 'working', label: 'Drafting' }
    case 'check':
      return beat >= 6 ? { status: 'needs-you', label: 'Needs a fix' } : { status: 'working', label: 'Checking' }
    case 'fix':
      if (beat >= FIX_BEATS.allPass) return { status: 'ready', label: 'Ready for approval' }
      if (beat >= FIX_BEATS.recheck) return { status: 'working', label: 'Checking again' }
      return { status: 'working', label: 'Fixing' }
    case 'approve':
      return beat >= 3 ? { status: 'ready', label: 'Approved' } : { status: 'ready', label: 'Ready for approval' }
    case 'publish':
      if (beat >= 3) return { status: 'live', label: 'Live' }
      return { status: 'working', label: 'Waiting for Amazon' }
  }
}

/** One panel in the stack. All panels share a grid cell so the stage keeps its height from md up
 *  (see PanelStack for phones). No scale: a panel only rises and fades, so its text stays sharp
 *  while it moves. */
function Panel({ on, children, className }: { on: boolean; children: ReactNode; className?: string }) {
  return (
    <div
      inert={!on}
      data-panel-on={on || undefined}
      className={cn('col-start-1 row-start-1 min-w-0 self-start', SPRING_FADE, on ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0', className)}
    >
      {children}
    </div>
  )
}

function PanelTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-2.5 flex min-h-[22px] items-center justify-between gap-2">
      <p className="text-caption font-bold text-ink-2">{children}</p>
      {aside}
    </div>
  )
}

function Stage({ pos, playing }: { pos: Pos; playing: boolean }) {
  const scene = SCENES[pos.scene] ?? 'import'
  const b = pos.beat
  const at = (s: SceneId) => SCENES.indexOf(s)
  const past = (s: SceneId) => pos.scene > at(s)

  // Product card
  const filled = past('import') || b >= 2
  const scanField = scene === 'check' ? (b === 1 ? 'sku' : b === 2 ? 'price' : b >= 3 && b <= 5 ? 'title' : null) : null
  const t =
    scene === 'fix'
      ? fixedText(b)
      : past('fix')
        ? fixedText(FIX_BEATS.allPass)
        : { head: 'Best ', tail: FIX_TAIL, caret: null }
  const len = [...(t.head + FIX_MIDDLE + t.tail)].length
  const judged = past('check') || (scene === 'check' && b >= 4)
  const markOverflow = judged
  const markBanned = past('check') || (scene === 'check' && b >= 5)

  // Lower panel
  const checks = checksAt(scene, b)
  const findings = heroFindings()
  const showFindings = scene === 'fix' ? b < FIX_BEATS.recheck : scene === 'check' && b >= 6
  const drafted = past('draft') ? DRAFT.bullets.length + 1 : scene === 'draft' ? b : 0
  const allPass = scene === 'fix' && b >= FIX_BEATS.allPass
  const chip = headerChip(scene, b)

  return (
    <div className="min-w-0 overflow-hidden rounded-card border border-line bg-surface shadow-raised-md" aria-hidden data-testid="demo-stage">
      <div className="flex items-center gap-2 border-b border-line bg-sunken px-4 py-2.5">
        <span aria-hidden className="flex gap-1.5 max-sm:hidden">
          <span className="size-2 rounded-full bg-line-strong shadow-inset-sm" />
          <span className="size-2 rounded-full bg-line-strong shadow-inset-sm" />
          <span className="size-2 rounded-full bg-line-strong shadow-inset-sm" />
        </span>
        <span className="truncate text-caption text-ink-2 sm:ml-2">
          <span className="max-sm:hidden">Listing · </span>
          {HERO_EXAMPLE.product}
        </span>
        <TagChip tone="plain" className="ml-auto">
          Example
        </TagChip>
        <span key={chip.label} className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-300">
          <StatusChip status={chip.status}>{chip.label}</StatusChip>
        </span>
      </div>

      <div className="flex flex-col gap-4 p-4 md:p-5">
        {/* Product card */}
        <div className="rounded-xl border border-line bg-canvas p-2 shadow-inset-sm">
          {/* Under sm the marketplace icons move down to the length row, so the SKU keeps its full width. */}
          <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] items-start gap-1 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto]">
            <CardField label="SKU" filled={filled} scan={scanField === 'sku'} d={0} value={<code className="font-mono text-[12.5px] font-medium text-ink">{DEMO.sku}</code>} />
            <CardField label="Price" filled={filled} scan={scanField === 'price'} d={90} value={<span className="text-small font-semibold text-ink tabular-nums">{DEMO.price}</span>} />
            <div className="flex gap-1 px-2 pt-2 max-sm:hidden" aria-hidden>
              <MarketplaceTile id="amazon" size="sm" />
              <MarketplaceTile id="flipkart" size="sm" />
            </div>
          </div>
          <CardField
            label="Title"
            filled={filled}
            scan={scanField === 'title'}
            d={180}
            className="mt-1"
            value={
              <div className="grid">
                {/* Holds the height of the longest title so nothing below jumps while it shortens. */}
                <p aria-hidden className="invisible col-start-1 row-start-1 text-small leading-5">
                  {HERO_EXAMPLE.title}
                </p>
                <p className="col-start-1 row-start-1 text-small leading-5 text-ink">
                  <TitleText head={t.head} tail={t.tail} caret={t.caret} markBanned={markBanned} markOverflow={markOverflow} playing={playing} />
                </p>
              </div>
            }
          />
          <div className={cn('mt-1 flex flex-wrap items-center gap-2 px-2.5 pb-1', arrive(filled))} style={delay(filled ? 260 : 0)}>
            <CountChip len={len} judged={judged} />
            <span className="text-caption text-ink-2">{judged ? 'Flipkart’s limit for kurta sets' : 'Title length'}</span>
            <span className="ml-auto flex gap-1 sm:hidden" aria-hidden>
              <MarketplaceTile id="amazon" size="xs" />
              <MarketplaceTile id="flipkart" size="xs" />
            </span>
          </div>
        </div>

        {/* Morphing panel */}
        <PanelStack scene={scene}>
          <Panel on={scene === 'import'}>
            <PanelTitle aside={<SourceBadge source={{ kind: 'you', detail: 'CSV' }} />}>Imported from {DEMO.file}</PanelTitle>
            <div className="overflow-hidden rounded-tile border border-line bg-sunken font-mono text-[12px] leading-5">
              <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,2fr)_minmax(0,0.6fr)] gap-3 border-b border-line px-3 py-1.5 text-ink-2">
                <span>sku</span>
                <span>title</span>
                <span>price</span>
              </div>
              <div
                className={cn(
                  'grid grid-cols-[minmax(0,0.9fr)_minmax(0,2fr)_minmax(0,0.6fr)] gap-3 px-3 py-1.5 text-ink',
                  SPRING,
                  'transition-[opacity,transform,background-color]',
                  scene === 'import' && b === 1 && 'bg-brand-bg',
                  scene === 'import' && b >= 2 ? '-translate-y-4 opacity-0 motion-reduce:opacity-40' : 'translate-y-0 opacity-100',
                )}
              >
                <span className="truncate">{DEMO.sku}</span>
                <span className="truncate">{HERO_EXAMPLE.title}</span>
                <span className="truncate">1899</span>
              </div>
            </div>
            <div className={cn('mt-3 flex flex-col gap-2', arrive(scene === 'import' && b >= 3))}>
              <p className="flex items-center gap-2 text-small font-medium text-ink">
                <Icon name="check" size={14} className="text-success" />1 product created with 1 variant
              </p>
              <p className="flex items-center gap-2 text-small text-ink-2">
                <Icon name="spark" size={14} className="text-brand" />
                Next, the agent drafts the bullets and description
              </p>
            </div>
          </Panel>

          <Panel on={scene === 'draft'}>
            <PanelTitle aside={<SourceBadge source={{ kind: 'brand-profile' }} />}>Drafted in your brand’s voice</PanelTitle>
            <p className="text-caption font-bold text-ink-2">Bullets</p>
            <ul className="mt-1.5 flex flex-col gap-1.5">
              {DRAFT.bullets.map((line, i) => (
                <li key={line} className="grid text-small leading-5 text-ink">
                  <span aria-hidden className={cn('col-start-1 row-start-1 mt-1.5 h-2.5 rounded-full bg-subtle transition-opacity duration-300', i === 0 ? 'w-4/5' : i === 1 ? 'w-1/2' : 'w-2/3', drafted > i ? 'opacity-0' : 'opacity-100')} />
                  <span className={cn('col-start-1 row-start-1 flex gap-2', arrive(drafted > i, 'translate-y-1'), 'motion-fade')}>
                    <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-ink-3" />
                    {line}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-caption font-bold text-ink-2">Description</p>
            <div className="mt-1.5 grid text-small leading-5 text-ink-2">
              <span aria-hidden className={cn('col-start-1 row-start-1 mt-1.5 flex flex-col gap-2 transition-opacity duration-300', drafted > DRAFT.bullets.length ? 'opacity-0' : 'opacity-100')}>
                <span className="h-2.5 w-full rounded-full bg-subtle" />
                <span className="h-2.5 w-3/5 rounded-full bg-subtle" />
              </span>
              <p className={cn('col-start-1 row-start-1', arrive(drafted > DRAFT.bullets.length, 'translate-y-1'), 'motion-fade')}>{DRAFT.description}</p>
            </div>
          </Panel>

          <Panel on={scene === 'check' || scene === 'fix'}>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
              <div>
                <PanelTitle aside={<SourceBadge source={{ kind: 'rule' }} />}>{scene === 'fix' && b >= FIX_BEATS.recheck ? 'Checks, run again' : 'Checks'}</PanelTitle>
                <ul className="flex flex-col gap-1">
                  {checks.map((c) => (
                    <li key={c.label} className="flex items-center gap-2.5 rounded-lg px-1 py-1">
                      <CheckGlyph state={c.state} />
                      <span className="min-w-0 flex-1 truncate text-small text-ink">{c.label}</span>
                      <span
                        className={cn(
                          'shrink-0 text-caption tabular-nums transition-colors duration-300',
                          c.state === 'fail' ? 'font-semibold text-danger' : c.state === 'pass' ? 'text-ink-2' : 'text-ink-3',
                        )}
                      >
                        {c.state === 'pending' ? '' : c.detail}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="grid min-w-0">
                <div className={cn('col-start-1 row-start-1 min-w-0', SPRING_FADE, allPass ? 'opacity-0' : 'opacity-100')}>
                  <PanelTitle
                    aside={
                      scene === 'fix' && b < FIX_BEATS.recheck ? (
                        <span className="flex items-center gap-1.5 text-caption font-semibold text-brand">
                          <Icon name="spark" size={14} />
                          Kuinn is fixing
                        </span>
                      ) : null
                    }
                  >
                    Findings
                  </PanelTitle>
                  <ul className={cn('flex flex-col gap-2 transition-opacity duration-300', scene === 'fix' && 'opacity-45')}>
                    {findings.map((f, i) => (
                      <li
                        key={`${f.marketplace}:${f.code}`}
                        className={cn('flex gap-2 rounded-tile border border-line bg-sunken p-2.5', arrive(showFindings, '-translate-y-2'), 'motion-fade')}
                        style={delay(showFindings ? i * 130 : 0)}
                      >
                        <MarketplaceTile id={f.marketplace} size="xs" className="shadow-none" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-caption font-bold text-danger" title={f.code}>
                              {FINDING_LABEL[f.code]}
                            </span>
                            <SourceBadge source={{ kind: 'rule' }} className="ml-auto" />
                          </div>
                          <p className="mt-1 text-small text-ink">{f.message}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className={cn('col-start-1 row-start-1 self-start', arrive(allPass, 'translate-y-2'), 'motion-fade')}>
                  <PanelTitle aside={<TagChip tone="brand" className="gap-1"><Icon name="check" size={14} />Fixed for you</TagChip>}>Findings</PanelTitle>
                  <div className="flex items-start gap-3 rounded-tile border border-success-line bg-success-tint p-3.5">
                    <IconTile icon="check" tone="ok" size="sm" />
                    <div>
                      <p className="text-small font-semibold text-success-ink">All 5 checks pass on Amazon and Flipkart</p>
                      <p className="mt-1 text-caption text-ink-2">Both changes are marked, so your team can see what Kuinn changed. Next, someone other than {DEMO.editor} approves it.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Panel>

          <Panel on={scene === 'approve'}>
            <PanelTitle>Approval</PanelTitle>
            <ul className="flex flex-col gap-2">
              <li className="flex items-center gap-3 rounded-tile border border-line bg-sunken p-3">
                <Avatar name={DEMO.editor} tone="neutral" />
                <div className="min-w-0 flex-1">
                  <p className="text-small font-semibold text-ink">{DEMO.editor}</p>
                  <p className="text-caption text-ink-2">Started the draft</p>
                </div>
                <TagChip tone="plain">Cannot approve</TagChip>
              </li>
              <li className={cn('flex flex-wrap items-center gap-3 rounded-tile border border-line bg-surface p-3 shadow-raised-sm', arrive(scene === 'approve' && b >= 1, 'translate-x-4'))}>
                <Avatar name={DEMO.approver} tone="brand" />
                <div className="min-w-0 flex-1">
                  <p className="text-small font-semibold text-ink">{DEMO.approver}</p>
                  <p className="text-caption text-ink-2">Reviewed the fixes and the 5 checks</p>
                </div>
                <span className="grid">
                  <span
                    className={cn(
                      'col-start-1 row-start-1 inline-flex h-[30px] items-center justify-self-end rounded-md border border-brand bg-brand px-3 text-[13px] font-semibold text-white shadow-raised-brand',
                      'transition-[opacity,transform,box-shadow] duration-[var(--dur-press)] motion-reduce:transform-none',
                      scene === 'approve' && b === 2 && 'scale-[0.97] shadow-pressed-fill',
                      scene === 'approve' && b >= 3 ? 'opacity-0' : 'opacity-100',
                    )}
                  >
                    Approve
                  </span>
                  <span className={cn('col-start-1 row-start-1 justify-self-end self-center', arrive(scene === 'approve' && b >= 3, 'scale-90'))}>
                    <StatusChip status="ready">Approved by {DEMO.approver}</StatusChip>
                  </span>
                </span>
              </li>
            </ul>
            <p className={cn('mt-3 flex items-start gap-2 text-caption text-ink-2', arrive(scene === 'approve' && b >= 3))}>
              <Icon name="users" size={14} className="mt-px shrink-0 text-brand" />
              Whoever starts or edits a listing cannot approve it.
            </p>
          </Panel>

          <Panel on={scene === 'publish'}>
            <PanelTitle aside={<MarketplaceTile id="amazon" size="xs" className="shadow-none" />}>Publishing to Amazon</PanelTitle>
            <ol className="relative flex flex-col gap-3 pl-1">
              <span aria-hidden className="absolute top-3 bottom-3 left-[13px] w-px bg-line" />
              <li className="relative flex items-center gap-3">
                <CheckGlyph state="pass" />
                <span className="text-small text-ink">Approved by {DEMO.approver}</span>
              </li>
              <li className={cn('relative flex flex-wrap items-center gap-x-3 gap-y-1.5', arrive(scene === 'publish' && b >= 1))}>
                <CheckGlyph state={scene === 'publish' && b >= 2 ? 'pass' : 'pending'} />
                <span className="text-small text-ink">Sent to Amazon</span>
                <span className="grid">
                  <span className={cn('col-start-1 row-start-1', SPRING, scene === 'publish' && b >= 2 ? 'opacity-0' : 'opacity-100')}>
                    <StatusChip status="working">Waiting for confirmation</StatusChip>
                  </span>
                </span>
                <span
                  className={cn(
                    'relative h-1 w-full basis-full overflow-hidden rounded-full bg-subtle shadow-inset-sm transition-opacity duration-500 sm:ml-8 sm:basis-auto sm:flex-1',
                    scene === 'publish' && b >= 2 && 'opacity-0',
                  )}
                >
                  <span
                    className={cn(
                      'absolute inset-0 origin-left rounded-full bg-brand motion-reduce:transition-none',
                      scene === 'publish' && b === 1 ? 'scale-x-[0.85] transition-transform duration-[2000ms] ease-out' : scene === 'publish' && b >= 2 ? 'scale-x-100 transition-transform duration-300' : 'scale-x-0',
                    )}
                  />
                </span>
              </li>
              <li className={cn('relative flex items-center gap-3', arrive(scene === 'publish' && b >= 2))}>
                <CheckGlyph state="pass" />
                <span className="text-small font-semibold text-ink">Amazon confirmed the listing</span>
              </li>
            </ol>
            <div
              className={cn(
                'mt-4 flex flex-wrap items-center gap-3 rounded-tile border border-success-line bg-success-tint p-3.5',
                arrive(scene === 'publish' && b >= 3, 'translate-y-2'),
              )}
            >
              <StatusChip status="live">Live on Amazon</StatusChip>
              <span className="text-caption text-ink-2">Confirmed by Amazon.</span>
            </div>
          </Panel>
        </PanelStack>
      </div>
    </div>
  )
}

/**
 * The panels' shared cell. From md up it is as tall as the tallest panel, so the page never moves.
 * On a phone that left a short step (Import) sitting on a tall empty card, so under md the cell
 * takes the current panel's height and eases to the next one. Reduced motion jumps instead.
 */
function PanelStack({ scene, children }: { scene: SceneId; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number | null>(null)
  useLayoutEffect(() => {
    const el = box.current?.querySelector<HTMLElement>('[data-panel-on]')
    if (!el) return
    const measure = () => setHeight(el.offsetHeight)
    measure()
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    ro?.observe(el)
    return () => ro?.disconnect()
  }, [scene])
  return (
    <div
      ref={box}
      style={height === null ? undefined : ({ '--panel-h': `${height}px` } as CSSProperties)}
      className="grid max-md:h-(--panel-h) max-md:overflow-hidden max-md:transition-[height] max-md:duration-[var(--dur-spring)] max-md:ease-[var(--ease-spring)] motion-reduce:transition-none"
    >
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------------------------------------
 * The step rail: a segmented track whose thumb slides to the current step
 * --------------------------------------------------------------------------------------------- */

function Rail({ current, progress, onPick, playing }: { current: SceneId; progress: number; onPick: (s: SceneId) => void; playing: boolean }) {
  const list = useRef<HTMLOListElement>(null)
  const [thumb, setThumb] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [settled, setSettled] = useState(false)

  const measure = useCallback(() => {
    const el = list.current?.querySelector<HTMLElement>(`[data-rail="${current}"]`)
    if (!el) return
    setThumb({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight })
  }, [current])

  useLayoutEffect(measure, [measure])
  useEffect(() => {
    // Slide only after the first placement, so the thumb never flies in from the corner.
    const id = requestAnimationFrame(() => setSettled(true))
    window.addEventListener('resize', measure)
    // The cells reflow after the first measure (web fonts, the reveal, a scrollbar appearing), which
    // left the thumb hanging past the strip's edge: re-measure whenever the list or a cell resizes.
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => measure())
    if (ro && list.current) {
      ro.observe(list.current)
      for (const li of list.current.querySelectorAll('[data-rail]')) ro.observe(li)
    }
    void document.fonts?.ready.then(() => measure())
    return () => {
      cancelAnimationFrame(id)
      window.removeEventListener('resize', measure)
      ro?.disconnect()
    }
  }, [measure])

  return (
    <ol
      ref={list}
      aria-label="Workflow steps"
      className="relative grid grid-cols-3 auto-rows-fr gap-1 rounded-card border border-line bg-sunken p-1 shadow-inset-sm lg:grid-cols-6"
    >
      {thumb ? (
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute top-0 left-0 overflow-hidden rounded-lg border border-line bg-surface shadow-thumb',
            settled && 'transition-transform duration-[var(--dur-spring)] ease-[var(--ease-spring)] motion-reduce:transition-none',
          )}
          style={{ width: thumb.w, height: thumb.h, transform: `translate3d(${thumb.x}px, ${thumb.y}px, 0)` }}
        >
          {/* How far the example has got through this step. */}
          <span
            className={cn('absolute inset-x-3 bottom-1 h-[2px] origin-left rounded-full bg-brand', playing ? 'transition-transform duration-300 ease-linear' : 'transition-none')}
            style={{ transform: `scaleX(${progress})` }}
          />
        </span>
      ) : null}
      {RAIL.map((s) => {
        const on = s.id === current
        return (
          <li key={s.id} data-rail={s.id} className="min-w-0">
            <button
              type="button"
              aria-current={on ? 'step' : undefined}
              aria-label={`${s.title}${on ? ', current step' : ''}`}
              onClick={() => onPick(s.id)}
              data-testid={`demo-step-${s.id}`}
              className="focus-ring tactile press relative z-[1] flex h-full min-h-14 w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg px-2 py-2.5 text-center hover:bg-hover/60 aria-[current=step]:hover:bg-transparent lg:flex-row lg:justify-start lg:gap-2.5 lg:px-3 lg:text-left"
            >
              <IconTile icon={s.icon} tone={on ? 'brand' : 'neutral'} size="sm" flat={!on} className="transition-colors duration-300" />
              <span className={cn('text-[14px] leading-5 font-semibold transition-colors duration-300', on ? 'text-ink' : 'text-ink-2')}>{s.title}</span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

/* ------------------------------------------------------------------------------------------------
 * The demo
 * --------------------------------------------------------------------------------------------- */

export function HowItWorksDemo() {
  const reduced = usePrefersReducedMotion()
  const canObserve = typeof IntersectionObserver !== 'undefined'
  const autoplay = canObserve && !reduced
  const [pos, setPos] = useState<Pos>(() => (autoplay ? START : FINAL))
  const [wantsPlay, setWantsPlay] = useState(autoplay)
  // Autoplay narration stays silent for screen readers; once a person picks a step, pauses or
  // replays, each step they reach is announced.
  const [userActed, setUserActed] = useState(false)
  const [inView, setInView] = useState(!canObserve)
  const [pageVisible, setPageVisible] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden')
  const root = useRef<HTMLDivElement>(null)

  const playing = wantsPlay && inView && pageVisible && !reduced
  const scene = SCENES[pos.scene] ?? 'import'
  // Reduced motion (even switched on mid-run) shows each step finished; nothing advances.
  const shown: Pos = reduced ? { scene: pos.scene, beat: LAST_BEAT[scene] } : pos

  useEffect(() => {
    // Watch the moving card, not the whole demo: on a phone the step strip alone counted as "on
    // screen", so Import played below the fold and a visitor first saw Draft.
    const el = root.current?.querySelector('[data-testid="demo-stage"]')
    if (!el || !canObserve) return
    // 40% of the card on screen, or half the viewport filled by it (a short landscape phone).
    const io = new IntersectionObserver(
      ([e]) => setInView(!!e && e.isIntersecting && (e.intersectionRatio >= 0.4 || e.intersectionRect.height >= window.innerHeight * 0.5)),
      { threshold: Array.from({ length: 21 }, (_, i) => i / 20) },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [canObserve])

  useEffect(() => {
    const on = () => setPageVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [])

  useEffect(() => {
    if (!playing) return
    const id = window.setTimeout(() => setPos(advance), beatDelay(scene, pos.beat))
    return () => window.clearTimeout(id)
  }, [playing, pos, scene])

  const pick = (s: SceneId) => {
    const i = SCENES.indexOf(s)
    setUserActed(true)
    // Playing: run the step from its start. Paused or reduced motion: show it finished.
    setPos({ scene: i, beat: wantsPlay && !reduced ? 0 : LAST_BEAT[s] })
  }
  const togglePlay = () => {
    setUserActed(true)
    setWantsPlay((w) => !w)
  }
  const replay = () => {
    setUserActed(true)
    setPos(START)
    setWantsPlay(true)
  }

  const step = RAIL.find((r) => r.id === scene) ?? RAIL[0]!
  const stepNo = pos.scene + 1
  const progress = Math.min(1, shown.beat / LAST_BEAT[scene])

  return (
    <figure ref={root} aria-labelledby="demo-caption" className="flex min-w-0 flex-col gap-3 md:gap-4" data-testid="how-demo">
      {/* The controls come first, before the step strip and the moving card, so the keyboard and a
          phone reach Pause before the motion. */}
      <div className={cn('flex min-h-11 flex-wrap items-center gap-x-4 gap-y-2', !reduced && 'justify-between')}>
        <p className="text-caption font-semibold text-ink-2 tabular-nums" aria-hidden>
          Step {stepNo} of {SCENES.length}
          <span className="font-normal text-ink-3"> · Example listing</span>
        </p>
        {reduced ? (
          <p className="text-caption text-ink-2">Motion is off. Pick a step to see it.</p>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              className="min-h-11 lg:min-h-9"
              onClick={togglePlay}
              aria-label={wantsPlay ? 'Pause animation' : 'Play animation'}
              data-testid="demo-play"
            >
              <IconGlyph icon={wantsPlay ? Pause : Play} size={16} />
              {wantsPlay ? 'Pause' : 'Play'}
            </Button>
            <Button type="button" variant="ghost" className="min-h-11 lg:min-h-9" onClick={replay} aria-label="Replay animation" data-testid="demo-replay">
              <IconGlyph icon={RotateCcw} size={16} />
              Replay
            </Button>
          </div>
        )}
      </div>

      <Rail current={scene} progress={progress} onPick={pick} playing={playing} />

      <div className="mt-1 grid min-w-0 gap-4 md:gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Stage pos={shown} playing={playing} />

        <div className="flex min-w-0 flex-col gap-4 self-start rounded-card border border-line bg-surface p-5 shadow-raised-md md:p-6">
          <div key={scene} className="flex flex-col gap-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-[320ms]">
            <div className="flex items-center gap-3">
              <IconTile icon={step.icon} tone="brand" />
              <div>
                <p className="text-caption font-bold text-ink-2 tabular-nums">Step {stepNo} of {SCENES.length}</p>
                <h3 className="text-h2 text-ink">{step.title}</h3>
              </div>
            </div>
            <p className="text-[15px] leading-[1.55] text-ink-2">{step.body}</p>
          </div>
          <div className="border-t border-line pt-4">
            <p className="text-caption font-bold text-ink-2">In this example</p>
            <p
              aria-live={playing && !userActed ? 'off' : 'polite'}
              aria-atomic="true"
              data-testid="demo-narration"
              className="mt-1.5 text-[15px] leading-[1.55] text-ink"
            >
              {NARRATION[scene]}
            </p>
          </div>
        </div>
      </div>

      <figcaption id="demo-caption" className="max-w-[70ch] text-caption text-ink-2">
        An example listing, not real product data. Flipkart is shown so you can compare its rules with Amazon’s. Publishing to Flipkart is
        not switched on yet.
      </figcaption>
    </figure>
  )
}
