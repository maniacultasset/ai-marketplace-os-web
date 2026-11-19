/**
 * The hero theatre: the product doing the job, end to end, in one framed panel under the headline.
 * A step track runs across the top (photos in, read, written, checked, approved, live). Below it,
 * three columns follow one product: its photo is scanned and facts pop off it; the Amazon listing
 * writes itself and every rule is checked, one caught and fixed; then a person approves, it is sent
 * and goes live. On the t-shirt Amazon refuses a value after sending and Kuinn fixes and resends it
 * on its own: the founder's point that Kuinn does not stop at content.
 *
 * Plays only while on screen and the tab is visible; holds still while a pointer is over it or focus
 * is inside it (WCAG 2.2.2). Reduced motion (or no IntersectionObserver) shows one finished frame.
 * The story and timing live in hero-theatre-story.ts.
 */
import { BadgeCheck, Check, CircleAlert, RefreshCw, ScanSearch, Sparkles, Wand2, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { IconGlyph } from '@/components/la/icons'
import { MarketplaceTile } from '@/components/la/marketplace'
import { usePrefersReducedMotion } from '@/lib/use-media-query'
import { cn } from '@/lib/utils'
import { photoSrcSet } from './hero-story'
import {
  CROSSFADE_MS,
  frameAt,
  productMs,
  STAGES,
  STATUS_TEXT,
  STILL_INDEX,
  STILL_T,
  THEATRE,
  type TheatreFrame,
  type TheatreProduct,
} from './hero-theatre-story'

const TICK_MS = 40

/** Advances the story clock while the theatre may play. */
function useStoryClock(root: React.RefObject<HTMLElement | null>, still: boolean) {
  const [pos, setPos] = useState({ index: still ? STILL_INDEX : 0, t: still ? STILL_T : 0 })
  const [inView, setInView] = useState(false)
  const [held, setHeld] = useState(false)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const el = root.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setInView(!!e?.isIntersecting), { threshold: 0.25 })
    io.observe(el)
    const onVis = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onVis)
    return () => {
      io.disconnect()
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [root])

  const playing = !still && inView && visible && !held
  useEffect(() => {
    if (!playing) return
    const id = window.setInterval(() => {
      setPos((p) => {
        const len = productMs(THEATRE[p.index]!)
        const t = p.t + TICK_MS
        return t >= len ? { index: (p.index + 1) % THEATRE.length, t: 0 } : { index: p.index, t }
      })
    }, TICK_MS)
    return () => window.clearInterval(id)
  }, [playing])

  // Reduced motion (even switched on mid-run) always shows the still frame.
  return { pos: still ? { index: STILL_INDEX, t: STILL_T } : pos, hold: setHeld }
}

export function HeroTheatre() {
  const reduced = usePrefersReducedMotion()
  const still = reduced || typeof IntersectionObserver === 'undefined'
  const root = useRef<HTMLDivElement>(null)
  const { pos, hold } = useStoryClock(root, still)
  const p = THEATRE[pos.index]!
  const f = frameAt(p, pos.t)
  // The last moments of a product fade out, so the next one never pops in.
  const leaving = !still && pos.t > productMs(p) - CROSSFADE_MS

  return (
    <div
      ref={root}
      role="figure"
      aria-label="Kuinn taking a product from its photos to a live Amazon listing: facts read from the photo, the listing written and checked, one rule fixed, approved by a person, sent, and on one product a refused value fixed and resent automatically."
      data-testid="hero-theatre"
      data-product={p.product.id}
      data-phase={f.phase}
      onPointerEnter={(e) => e.pointerType === 'mouse' && hold(true)}
      onPointerLeave={() => hold(false)}
      onFocusCapture={() => hold(true)}
      onBlurCapture={() => hold(false)}
      className="edge-gradient relative overflow-hidden rounded-panel bg-surface shadow-[0_1px_2px_rgb(31_41_72/0.06),0_30px_80px_-24px_rgb(47_70_214/0.28)]"
    >
      <StepTrack stage={f.stage} />
      <div
        aria-hidden
        className={cn('grid transition-opacity ease-[var(--ease-out-calm)] lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1.25fr)_minmax(0,0.92fr)]', leaving ? 'opacity-0' : 'opacity-100')}
        style={{ transitionDuration: `${CROSSFADE_MS}ms` }}
      >
        <PhotoColumn p={p} f={f} key={`photo-${pos.index}`} />
        <ListingColumn p={p} f={f} key={`listing-${pos.index}`} />
        <OutcomeColumn p={p} f={f} key={`outcome-${pos.index}`} />
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------------------------- */

function StepTrack({ stage }: { stage: number }) {
  const n = STAGES.length
  return (
    <ol aria-hidden className="relative grid grid-cols-6 border-b border-line bg-sunken/70 px-3 py-4 sm:px-6">
      {/* The rail behind the nodes, filled up to the active one. */}
      <span className="absolute top-[30px] right-[calc(100%/12+12px)] left-[calc(100%/12+12px)] h-0.5 rounded-full bg-line sm:right-[calc((100%-48px)/12+24px)] sm:left-[calc((100%-48px)/12+24px)]">
        <span
          className="block h-full rounded-full bg-brand transition-[width] duration-700 ease-[var(--ease-out-calm)]"
          style={{ width: `${(Math.min(stage, n - 1) / (n - 1)) * 100}%` }}
        />
      </span>
      {STAGES.map((s, i) => {
        const done = i < stage
        const active = i === stage
        const finished = stage >= n && i === n - 1
        return (
          <li key={s.id} className="relative flex flex-col items-center gap-2">
            <span
              className={cn(
                'relative grid size-7 place-items-center rounded-full border-2 transition-colors duration-500',
                done && !finished && 'border-brand bg-brand text-white',
                finished && 'border-success bg-success text-white shadow-[0_0_0_5px_rgb(29_116_73/0.15)]',
                active && 'border-brand bg-surface text-brand',
                !done && !active && 'border-line-strong bg-surface text-ink-3',
              )}
            >
              {active ? <span className="theatre-ping absolute inset-[-5px] rounded-full border-2 border-brand/40" /> : null}
              {done ? <IconGlyph icon={Check} size={14} /> : <span className="font-mono text-[11px] font-bold tabular-nums">{i + 1}</span>}
            </span>
            <span className={cn('text-center text-[11px] leading-4 font-semibold sm:text-caption', finished ? 'text-success' : active ? 'text-ink' : done ? 'text-ink-2' : 'text-ink-3', !active && !finished && 'max-sm:hidden')}>
              {s.label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function ColumnLabel({ icon, children }: { icon: Parameters<typeof IconGlyph>[0]['icon']; children: ReactNode }) {
  return (
    <p className="mb-3 flex items-center gap-1.5 text-caption font-semibold tracking-[0.04em] text-ink-3 uppercase">
      <IconGlyph icon={icon} size={13} />
      {children}
    </p>
  )
}

/* -------------------------------------------------------------------------------------------- */

function PhotoColumn({ p, f }: { p: TheatreProduct; f: TheatreFrame }) {
  const photo = p.product.photo
  return (
    <div className="theatre-in border-line p-5 max-lg:border-b lg:border-r lg:p-6">
      <ColumnLabel icon={ScanSearch}>Your product</ColumnLabel>
      <div className="relative mx-auto max-w-[400px]">
        <div className="relative aspect-[3/4] w-[68%] overflow-hidden rounded-card border border-line bg-photo shadow-raised-md">
          <img
            src={photo.src}
            srcSet={photoSrcSet(photo)}
            sizes="(min-width: 1024px) 270px, 60vw"
            alt=""
            width={420}
            height={560}
            fetchPriority="high"
            decoding="async"
            draggable={false}
            className="size-full object-cover"
          />
          {f.scanning ? (
            <span key={`scan-${p.product.id}`} className="theatre-scan pointer-events-none absolute inset-x-0 top-0 h-1/3" />
          ) : null}
          <span className="absolute right-2.5 bottom-2.5 left-2.5 overflow-hidden rounded-pill bg-surface/90 px-2.5 py-1 text-[11px] font-semibold text-ellipsis whitespace-nowrap text-ink shadow-raised-sm backdrop-blur">
            {p.product.name}
          </span>
        </div>
        {/* Facts read off the photo, popping out over its right edge. */}
        <ul className="absolute top-[10%] right-0 flex w-[42%] flex-col gap-2.5">
          {p.read.map((r, i) => (
            <li
              key={r.label}
              className={cn(
                'flex items-center gap-2 rounded-tile border border-brand-line bg-surface/95 py-1.5 pr-2.5 pl-2 shadow-raised-md backdrop-blur transition-[opacity,transform] duration-500 ease-[var(--ease-out-calm)]',
                i < f.chips ? 'translate-x-0 opacity-100' : 'translate-x-3 opacity-0',
              )}
            >
              <span className="grid size-5 place-items-center rounded-md bg-brand-bg text-brand">
                <IconGlyph icon={Sparkles} size={11} />
              </span>
              <span className="text-[11.5px] leading-4">
                <span className="block text-ink-3">{r.label}</span>
                <span className="block font-bold text-ink">{r.value}</span>
              </span>
              <span className="ml-1 font-mono text-[10.5px] font-semibold text-brand tabular-nums">{r.confidence}%</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------------------------- */

function Title({ p, f }: { p: TheatreProduct; f: TheatreFrame }) {
  if (f.fixed) return <span className="text-ink">{p.final}</span>
  const shown = p.draft.slice(0, f.typed)
  const typing = f.typed > 0 && f.typed < p.draft.length
  if (p.strike && shown.startsWith(p.strike)) {
    const rest = shown.slice(p.strike.length)
    return (
      <>
        <mark className={cn('rounded px-0.5 text-ink', f.checks >= 2 ? 'bg-danger-bg text-danger line-through decoration-2' : 'bg-transparent')}>{p.strike}</mark>
        {rest}
        {typing ? <span className="caret-blink ml-px inline-block h-[1.05em] w-[2px] translate-y-[2px] bg-brand" /> : null}
      </>
    )
  }
  return (
    <>
      {shown}
      {typing || f.typed === 0 ? <span className="caret-blink ml-px inline-block h-[1.05em] w-[2px] translate-y-[2px] bg-brand" /> : null}
    </>
  )
}

function ListingColumn({ p, f }: { p: TheatreProduct; f: TheatreFrame }) {
  const written = f.typed >= p.draft.length || f.fixed
  return (
    <div className="theatre-in border-line p-5 max-lg:border-b lg:border-r lg:p-6" style={{ animationDelay: '80ms' }}>
      <ColumnLabel icon={Sparkles}>Written and checked by Kuinn</ColumnLabel>
      <div className="rounded-card border border-line bg-surface shadow-raised-sm">
        <div className="flex items-center gap-2 border-b border-line px-3.5 py-2.5">
          <MarketplaceTile id="amazon" size="xs" />
          <span className="text-small font-semibold text-ink">Amazon listing</span>
          <span className="ml-auto font-mono text-[11px] text-ink-3 tabular-nums">{f.fixed ? p.count.final : Math.round((Math.min(f.typed, p.draft.length) / p.draft.length) * p.count.draft)}/200</span>
        </div>
        <div className="space-y-3 px-3.5 py-3">
          <p className="relative min-h-[3.75rem] text-[14px] leading-5 font-semibold">
            <Title p={p} f={f} />
            {f.typed === 0 && !f.fixed ? (
              <span className="absolute inset-x-0 top-1 flex flex-col gap-2">
                <span className="h-3 w-[92%] animate-pulse rounded bg-subtle" />
                <span className="h-3 w-[64%] animate-pulse rounded bg-subtle" />
              </span>
            ) : null}
          </p>
          <ul className={cn('space-y-1 text-small text-ink-2 transition-opacity duration-500', written ? 'opacity-100' : 'opacity-0')}>
            {p.product.bullets.map((b) => (
              <li key={b} className="flex gap-2">
                <span className="mt-[7px] size-1 shrink-0 rounded-full bg-ink-3" />
                {b}
              </li>
            ))}
          </ul>
          <div className={cn('flex flex-wrap items-center gap-1.5 transition-opacity duration-500', written ? 'opacity-100' : 'opacity-0')}>
            <span className="mr-1 text-[15px] font-bold text-ink">{p.product.price}</span>
            <span className="mr-2 text-caption text-ink-3 line-through">{p.product.mrp}</span>
            {p.product.sizes.map((s) => (
              <span key={s} className="grid h-6 min-w-6 place-items-center rounded-md border border-line px-1 text-[10.5px] font-semibold text-ink-2">
                {s}
              </span>
            ))}
          </div>
        </div>
      </div>

      <ul className="mt-3 grid grid-cols-2 gap-1.5">
        {p.checks.map((c, i) => {
          const shown = i < f.checks
          const failing = c.flag && shown && !f.fixed
          return (
            <li
              key={c.text}
              className={cn(
                'flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[12px] leading-4 transition-[opacity,background-color,border-color] duration-300',
                !shown && 'border-line bg-sunken/50 opacity-40',
                shown && !failing && 'border-success-line/70 bg-success-tint',
                failing && 'border-danger-line bg-danger-bg/60',
              )}
            >
              <span
                className={cn(
                  'grid size-4 shrink-0 place-items-center rounded-full',
                  !shown && 'bg-line text-transparent',
                  shown && !failing && 'bg-success text-white',
                  failing && 'bg-danger text-white',
                )}
              >
                <IconGlyph icon={failing ? X : Check} size={10} />
              </span>
              <span className={cn('truncate', failing ? 'text-danger-ink' : 'text-ink')}>{c.text}</span>
            </li>
          )
        })}
      </ul>
      <div
        className={cn(
          'mt-2 flex items-center gap-2 rounded-lg border px-2.5 py-2 text-[12px] transition-[opacity,transform] duration-500 ease-[var(--ease-out-calm)]',
          p.fixBySelf ? 'border-success-line bg-success-tint' : 'border-brand-line bg-brand-bg/60',
          f.fixed ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0',
        )}
      >
        <IconGlyph icon={Wand2} size={14} className={p.fixBySelf ? 'text-success' : 'text-brand'} />
        <span className={cn('font-bold', p.fixBySelf ? 'text-success-ink' : 'text-brand-ink')}>{p.fixLabel}</span>
        <span className="truncate text-ink-2">{p.fixDetail}</span>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------------------------- */

function Event({ show, tone, icon, title, detail, spin, ghost = true }: { ghost?: boolean; show: boolean; tone: 'brand' | 'success' | 'danger' | 'ink'; icon: Parameters<typeof IconGlyph>[0]['icon']; title: string; detail?: string; spin?: boolean }) {
  const toneCls = {
    brand: 'bg-brand-bg text-brand',
    success: 'bg-success-bg text-success',
    danger: 'bg-danger-bg text-danger',
    ink: 'bg-sunken text-ink-2',
  }[tone]
  return (
    <li className={cn('relative flex gap-3 pb-3.5 transition-[opacity,filter] duration-500 ease-[var(--ease-out-calm)] last:pb-0', show ? 'opacity-100' : ghost ? 'opacity-30 grayscale' : 'opacity-0')}>
      <span className={cn('relative z-10 grid size-7 shrink-0 place-items-center rounded-full', toneCls)}>
        <IconGlyph icon={icon} size={14} className={spin ? 'animate-spin [animation-duration:1.4s]' : undefined} />
      </span>
      <span className="min-w-0 pt-0.5 text-[12.5px] leading-[1.35]">
        <span className="block font-semibold text-ink">{title}</span>
        {detail ? <span className="block text-ink-3">{detail}</span> : null}
      </span>
    </li>
  )
}

function OutcomeColumn({ p, f }: { p: TheatreProduct; f: TheatreFrame }) {
  const r = p.rejection
  const after = (ph: TheatreFrame['phase'][]) => ph.includes(f.phase)
  const sent = after(['send', 'rejected', 'diagnosed', 'resent', 'live'])
  const live = f.phase === 'live'
  return (
    <div className="theatre-in flex flex-col p-5 lg:p-6" style={{ animationDelay: '160ms' }}>
      <ColumnLabel icon={BadgeCheck}>Approved, sent, live</ColumnLabel>
      <div className="flex items-center gap-2.5 rounded-card border border-line bg-surface px-3 py-2.5 shadow-raised-sm">
        <MarketplaceTile id="amazon" size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block text-small font-semibold text-ink">Amazon.in</span>
          <span
            className={cn(
              'block truncate text-caption font-semibold transition-colors',
              live ? 'text-success' : f.status === 'rejected' ? 'text-danger' : f.status === 'fixing' || f.status === 'resent' ? 'text-brand' : 'text-ink-3',
            )}
            aria-live="off"
          >
            {STATUS_TEXT[f.status]}
          </span>
        </span>
        <span className={cn('size-2.5 rounded-full transition-colors', live ? 'bg-success shadow-[0_0_0_4px_rgb(29_116_73/0.15)]' : f.status === 'rejected' ? 'bg-danger' : 'bg-line-strong')} />
      </div>

      <ol className="relative mt-4 before:absolute before:top-2 before:bottom-2 before:left-[13px] before:w-px before:bg-line">
        <Event show={f.approved} tone="brand" icon={BadgeCheck} title="Approved by Meera" detail="A second person signs off" />
        <Event show={sent} tone="ink" icon={RefreshCw} title="Sent to Amazon" detail="Through Selling Partner API" />
        {r ? (
          <>
            <Event show={after(['rejected', 'diagnosed', 'resent', 'live'])} tone="danger" icon={CircleAlert} title={r.message} detail={r.code} ghost={false} />
            <Event show={after(['diagnosed', 'resent', 'live'])} tone="brand" icon={Wand2} title={r.diagnosis} detail={r.fix} spin={f.phase === 'diagnosed'} ghost={false} />
          </>
        ) : null}
        <Event show={live} tone="success" icon={Check} title="Live on Amazon" detail={r ? 'Fixed and resent with no one retyping it' : 'Buyable, with every change on record'} />
      </ol>

      <div className={cn('mt-auto flex items-center gap-2 rounded-lg border border-dashed border-line-strong px-3 py-2 pt-2 text-[12px] text-ink-3 transition-opacity', 'mt-4')}>
        <MarketplaceTile id="flipkart" size="xs" unavailable />
        Flipkart <span className="ml-auto font-semibold">Next</span>
      </div>
    </div>
  )
}
