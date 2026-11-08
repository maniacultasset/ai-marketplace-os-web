/**
 * The landing hero's visual. Three real product photos, one after another, each head to toe in the
 * same 3:4 frame with nothing laid over it, sit on the left as the record card; the Amazon listing
 * Kuinn writes from each overlaps the photo's right edge on a fixed offset; the marketplace rail lines
 * up under both on the same column edges. Nothing inside is a control and nothing is app data.
 *
 * Each product spotlights different live features (hero-story.ts): brand voice, a banned word fixed
 * and a second person's approval; six size variants, a title trimmed to fit and Live on Amazon; a
 * colour read from the photo and confirmed, a size chart from the seller's sheet and every rule
 * checked. Per product: the photo crossfades in, one fact is confirmed from the photo, the listing is
 * drafted, the checks tick in order, the fix lands, then "Ready to approve" and its ending.
 *
 * Motion (transform and opacity only, hero-story.ts holds every time):
 * - Entrance, once: the photo card, the Amazon card and the rail rise in showing the first product's
 *   finished listing. The h1 never waits.
 * - Loop: products change with one soft crossfade of the photo and the listing's contents together;
 *   the cards never move, slide, scale or remount. Every row, chip, check and fix line has its room
 *   reserved up front, so text and chips only fade and rise 6px in place (spring, no overshoot,
 *   70ms apart). A spotlight (a soft tint) lights one thing at a time and settles before the next.
 * - It never pauses for hover or focus. It holds only while less than 40% of it is on screen or the
 *   tab is hidden (both save CPU), and picks up again from the same beat. No visible controls.
 * - Pointer parallax from lg with a fine pointer, at most 6px, 2D translate only.
 * - Reduced motion: one still frame (the first product, finished), no loop, no parallax.
 *
 * Layout never shifts and edges stay on whole pixels: the stage's column, the two card widths and the
 * photo frame's height are rounded down to 1px (CSS round()), so the stage, both cards and every row
 * keep the same box through the whole loop.
 */
import { domAnimation, LazyMotion, m, type MotionValue, useTransform } from 'motion/react'
import { useCallback, useEffect, useReducer, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { Icon } from '@/components/la/icons'
import { MarketplaceTile } from '@/components/la/marketplace'
import { SourceBadge } from '@/components/la/source-badge'
import { CHIP_TONE, StatusChip, TagChip } from '@/components/la/status-chip'
import { useMediaQuery, usePrefersReducedMotion } from '@/lib/use-media-query'
import { usePointerParallax } from '@/lib/use-pointer-parallax'
import { cn } from '@/lib/utils'
import { MarketplaceRail } from './marketplace-rail'
import { usePageVisible } from './use-loop-hold'
import {
  APPROVER,
  BEATS,
  beatDelay,
  CHECKS,
  CROSSFADE_MS,
  ENTER,
  ENTRANCE,
  FINAL,
  HERO_PHOTO,
  LAST,
  LIMIT,
  next,
  photoSrcSet,
  PRODUCTS,
  STATUS_LABEL,
  STORY,
  storyAt,
  TICK_STAGGER_MS,
  titleLength,
  type HeroProduct,
  type Position,
  type Status,
  type StoryState,
} from './hero-story'

/** --ease-out-calm, for motion's JS animations. */
const CALM = [0.22, 1, 0.36, 1] as const
/** Text and chips settle on a critically damped spring (no overshoot). */
const SETTLE = { type: 'spring', bounce: 0, duration: 0.5 } as const
const ENTRANCE_MS = 1800
const STAGGER = 0.07
const sec = (ms: number) => ms / 1000

/* ------------------------------------------------------------------------------------------------
 * The beat player
 * --------------------------------------------------------------------------------------------- */

interface Player extends Position {
  /** The product shown before this one, still under it while the new photo fades in. */
  prev: number
  /** Bumps each time a listing goes live, so the rail's live dot rings again. */
  ring: number
}

const startPlayer = (reduced: boolean): Player => ({ product: 0, beat: reduced ? LAST : ENTER, prev: PRODUCTS.length - 1, ring: 0 })

function advance(p: Player): Player {
  const to = next(p)
  const wentLive = storyAt(to.product, to.beat).status === 'live' && storyAt(p.product, p.beat).status !== 'live'
  return { ...to, prev: to.product === p.product ? p.prev : p.product, ring: wentLive ? p.ring + 1 : p.ring }
}

/** True while at least 40% of `ref` is on screen (or it fills half a short viewport). */
function useOnScreen(ref: RefObject<HTMLElement | null>): boolean {
  const canObserve = typeof IntersectionObserver !== 'undefined'
  const [on, setOn] = useState(!canObserve)
  useEffect(() => {
    const el = ref.current
    if (!el || !canObserve) return
    const io = new IntersectionObserver(
      ([e]) => setOn(!!e && e.isIntersecting && (e.intersectionRatio >= 0.4 || e.intersectionRect.height >= window.innerHeight * 0.5)),
      { threshold: [0, 0.2, 0.4, 0.6, 0.8, 1] },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [ref, canObserve])
  return on
}

/* ------------------------------------------------------------------------------------------------
 * Small pieces
 * --------------------------------------------------------------------------------------------- */

/**
 * States in one reserved cell: the cell is as big as the largest, so a swap never moves layout.
 * `cross` fades both at once (a swap in place); otherwise the outgoing layer fades out first and only
 * then does the next fade in, so two pills of different widths never show together. -1 shows none.
 */
function Layers({
  show,
  layers,
  duration = 0.32,
  cross,
  className,
  itemClassName,
}: {
  show: number
  layers: ReactNode[]
  duration?: number
  cross?: boolean
  className?: string
  /** Each layer's own box, for example a fixed-height flex row, so every state sits on one line. */
  itemClassName?: string
}) {
  return (
    <span className={cn('grid', className)}>
      {layers.map((layer, i) => {
        const on = i === show
        return (
          <m.span
            key={i}
            className={cn('col-start-1 row-start-1 min-w-0', itemClassName)}
            initial={false}
            animate={on ? { opacity: 1, y: 0, visibility: 'visible' } : { opacity: 0, transitionEnd: { visibility: 'hidden', y: 4 } }}
            transition={
              cross
                ? { opacity: { duration, ease: CALM }, y: SETTLE }
                : { opacity: { duration: duration / 2, delay: on ? duration / 2 : 0, ease: CALM }, y: { ...SETTLE, delay: on ? duration / 2 : 0 } }
            }
          >
            {layer}
          </m.span>
        )
      })}
    </span>
  )
}

/**
 * Text or chips that fade and rise 6px into their final place. Leaving, they only fade (their offset
 * resets once unseen), so nothing ever travels on the way out.
 */
function Rise({ on, delay = 0, className, children }: { on: boolean; delay?: number; className?: string; children: ReactNode }) {
  return (
    <m.span
      className={cn('block', className)}
      initial={false}
      animate={on ? { opacity: 1, y: 0 } : { opacity: 0, transitionEnd: { y: 6 } }}
      transition={on ? { opacity: { duration: 0.44, delay, ease: CALM }, y: { ...SETTLE, delay } } : { opacity: { duration: 0.28, ease: CALM } }}
    >
      {children}
    </m.span>
  )
}

/** A soft tint behind one thing while it is in the spotlight, then back to calm. */
function Spot({ on, className }: { on: boolean; className?: string }) {
  return (
    <m.span
      aria-hidden
      className={cn('pointer-events-none absolute -inset-x-2 -inset-y-1 -z-10 rounded-lg bg-brand-bg', className)}
      initial={false}
      animate={{ opacity: on ? 1 : 0 }}
      transition={{ duration: on ? 0.5 : 0.6, ease: CALM }}
    />
  )
}

/**
 * The written rows rest at a lower opacity while the checks and the fix hold the eye, so only a few
 * things read at once; they come back for "Ready to approve". Opacity only, in place.
 */
function Quiet({ on, className, children }: { on: boolean; className?: string; children: ReactNode }) {
  return (
    <m.div className={className} initial={false} animate={{ opacity: on ? 0.42 : 1 }} transition={{ duration: 0.6, ease: CALM }}>
      {children}
    </m.div>
  )
}

/** A skeleton bar, shown in a row before the listing is written. */
const Bar = ({ className }: { className?: string }) => <span className={cn('block h-2 rounded-full bg-subtle', className)} />

/** Rises into place with the hero entrance; reduced motion or a later mount shows it at once. */
function Enter({
  play,
  delay,
  from,
  duration = 0.56,
  className,
  children,
}: {
  play: boolean
  delay: number
  from: { opacity?: number; y?: number; scale?: number }
  duration?: number
  className?: string
  children: ReactNode
}) {
  return (
    <m.div
      className={className}
      initial={play ? { opacity: 0, ...from } : false}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration, delay: sec(delay), ease: CALM }}
    >
      {children}
    </m.div>
  )
}

/** The hero's copy lines (sub, buttons, trust line): rise 12px, 480ms, after the h1. */
export function HeroRise({ delay, className, children }: { delay: number; className?: string; children: ReactNode }) {
  const reduced = usePrefersReducedMotion()
  const [play] = useState(!reduced)
  return (
    <LazyMotion features={domAnimation}>
      <Enter play={play} delay={delay} from={{ y: 12 }} duration={0.48} className={className}>
        {children}
      </Enter>
    </LazyMotion>
  )
}

/* ------------------------------------------------------------------------------------------------
 * The record card: photo and facts
 * --------------------------------------------------------------------------------------------- */

/** The photo frame: 3:4, its height rounded down to a whole pixel from the card's own width. */
const FRAME: CSSProperties = { height: 'round(down, calc(100cqw * 4 / 3), 1px)' }

function PhotoCard({
  player,
  states,
  mounted,
  eager,
  confirmSpot,
  onLoaded,
}: {
  player: Player
  states: StoryState[]
  mounted: boolean
  eager: boolean
  confirmSpot: boolean
  /** Each photo reports once it has loaded; the loop never moves to a product before its photo. */
  onLoaded: (i: number) => void
}) {
  return (
    <div className="@container flex flex-col overflow-hidden rounded-card border border-line bg-surface shadow-raised-md">
      <div data-testid="hero-photo" className="relative overflow-hidden bg-photo" style={FRAME}>
        {PRODUCTS.map((p, i) => {
          // The first photo is always there; the others load once the stage has been seen.
          if (i > 0 && !mounted) return null
          const on = i === player.product
          const under = i === player.prev
          return (
            <m.img
              key={p.id}
              src={p.photo.src}
              srcSet={photoSrcSet(p.photo)}
              sizes={HERO_PHOTO.sizes}
              alt={i === 0 ? p.photo.alt : ''}
              width={HERO_PHOTO.width}
              height={HERO_PHOTO.height}
              fetchPriority={i === 0 && eager ? 'high' : i === 0 ? 'auto' : 'low'}
              decoding="async"
              draggable={false}
              onLoad={() => onLoaded(i)}
              // A photo already in the cache can finish before React attaches onLoad.
              ref={(el: HTMLImageElement | null) => {
                if (el?.complete && el.naturalWidth > 0) onLoaded(i)
              }}
              className="absolute inset-0 size-full object-cover"
              // The new photo fades in on top of the old one, which stays put underneath: no blank frame.
              style={{ zIndex: on ? 2 : under ? 1 : 0 }}
              initial={false}
              animate={{ opacity: on || under ? 1 : 0 }}
              transition={{ duration: on ? sec(CROSSFADE_MS) + 0.2 : 0, ease: CALM }}
            />
          )
        })}
      </div>
      <div className="grid border-t border-line p-4">
        {PRODUCTS.map((p, i) => (
          <m.div
            key={p.id}
            className="col-start-1 row-start-1 flex min-w-0 flex-col gap-2.5"
            initial={false}
            animate={{ opacity: i === player.product ? 1 : 0 }}
            transition={{ duration: sec(CROSSFADE_MS), ease: CALM }}
          >
            <Facts p={p} s={states[i]!} spot={i === player.product && confirmSpot} />
          </m.div>
        ))}
      </div>
    </div>
  )
}

function Facts({ p, s, spot }: { p: HeroProduct; s: StoryState; spot: boolean }) {
  return (
    <>
      {/* From md the Amazon card overlaps this card's right 12.5%, so nothing here reaches under it. */}
      <p className="truncate text-small font-semibold text-ink md:pr-[12.5cqw]">{p.name}</p>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2.5 gap-y-1.5 text-caption md:pr-[12.5cqw]">
        {p.facts.map((f) => (
          <div key={f.label} className="contents">
            <dt className="text-ink-2">{f.label}</dt>
            <dd className="truncate font-medium text-ink">{f.value}</dd>
          </div>
        ))}
        {/* The fact read from the photo: "From photo", then the seller confirms it. */}
        <dt className="text-ink-2">{p.photoFact.label}</dt>
        <dd className="relative isolate flex min-w-0 items-center gap-2 font-medium text-ink">
          <Spot on={spot} className="-inset-x-1.5 -inset-y-0.5 rounded-md" />
          <span className="truncate">{p.photoFact.value}</span>
          <Layers
            show={s.confirmed ? 1 : 0}
            cross
            duration={0.4}
            layers={[<SourceBadge key="photo" source={{ kind: 'photo' }} />, <SourceBadge key="ok" source={{ kind: 'confirmed' }} />]}
          />
        </dd>
      </dl>
    </>
  )
}

/* ------------------------------------------------------------------------------------------------
 * The Amazon listing
 * --------------------------------------------------------------------------------------------- */

/** Every status glyph sits in the same 14px box, centred, so no state shifts the word beside it. */
const glyphBox = (glyph: ReactNode) => <span className="grid size-3.5 place-items-center">{glyph}</span>
const spinner = glyphBox(
  <span className="block size-2 animate-spin rounded-full border-[1.5px] border-current border-r-transparent [animation-duration:1.2s] group-data-[paused]/stage:[animation-play-state:paused] motion-reduce:animate-none" />,
)
const avatar = glyphBox(
  <span aria-hidden className="grid size-3.5 place-items-center rounded-full bg-success text-[8px] leading-none font-bold text-surface">
    {APPROVER.initial}
  </span>,
)
// The ◔ of "Ready", drawn: a ring with its first quarter filled, centred like the other glyphs.
const readyGlyph = glyphBox(<span className="block size-2.5 rounded-full border-[1.5px] border-current bg-[conic-gradient(currentColor_0_25%,transparent_0)]" />)
const liveGlyph = glyphBox(<span className="block size-2 rounded-full bg-current" />)

const STATUSES: readonly Status[] = ['drafting', 'checking', 'ready', 'approved', 'sent', 'live']

function StatusPill({ status }: { status: Status }) {
  switch (status) {
    case 'drafting':
    case 'checking':
    case 'sent':
      // Its own working glyph, a slow spinner, so it never reads as Flipkart's ◐ Next.
      return (
        <StatusChip status="working" glyph={spinner}>
          {STATUS_LABEL[status]}
        </StatusChip>
      )
    case 'ready':
      return (
        <StatusChip status="ready" glyph={readyGlyph}>
          {STATUS_LABEL.ready}
        </StatusChip>
      )
    case 'approved':
      return (
        <StatusChip status="live" glyph={avatar} className="pl-1">
          {STATUS_LABEL.approved}
        </StatusChip>
      )
    case 'live':
      return (
        <StatusChip status="live" glyph={liveGlyph}>
          {STATUS_LABEL.live}
        </StatusChip>
      )
  }
}

/**
 * One product's title, two lines at most. A title longer than that shows whole phrases and an
 * ellipsis (`shownTitle`), never a cut mid-word. The draft title and the one that ships share one cell
 * and crossfade in place; "Best" is lit in the draft while it is flagged, by crossfading two copies of
 * the word (opacity only).
 */
function Title({ p, s, on }: { p: HeroProduct; s: StoryState; on: boolean }) {
  const draft = p.bannedWord ? (
    <>
      <span className="relative isolate inline-grid">
        <m.span
          aria-hidden
          className="absolute -inset-x-0.5 inset-y-0 -z-10 rounded-xs bg-danger-bg"
          initial={false}
          animate={{ opacity: s.finding ? 1 : 0 }}
          transition={{ duration: 0.4, ease: CALM }}
        />
        <span className="col-start-1 row-start-1">{p.bannedWord}</span>
        <m.span
          aria-hidden
          className="col-start-1 row-start-1 text-danger-ink"
          initial={false}
          animate={{ opacity: s.finding ? 1 : 0 }}
          transition={{ duration: 0.4, ease: CALM }}
        >
          {p.bannedWord}
        </m.span>
      </span>{' '}
      {p.title}
    </>
  ) : (
    (p.shownTitle ?? p.draftTitle)
  )
  const shipped = p.shownTitle ?? p.title
  const swaps = p.draftTitle !== p.title
  return (
    <span className="grid">
      <Rise on={on} className="col-start-1 row-start-1">
        {swaps ? (
          <span className="grid">
            <m.span
              className="col-start-1 row-start-1 line-clamp-2"
              initial={false}
              animate={{ opacity: s.fixed ? 0 : 1 }}
              transition={{ duration: 0.36, ease: CALM }}
            >
              {draft}
            </m.span>
            <m.span
              className="col-start-1 row-start-1 line-clamp-2"
              initial={false}
              animate={{ opacity: s.fixed ? 1 : 0 }}
              transition={{ duration: 0.44, delay: s.fixed ? 0.08 : 0, ease: CALM }}
            >
              {shipped}
            </m.span>
          </span>
        ) : (
          <span className="line-clamp-2">{shipped}</span>
        )}
      </Rise>
    </span>
  )
}

/**
 * The line under the title, one per product, in a reserved 18px row: the kurta set's Brand voice tag,
 * the t-shirt's title length against Amazon's limit (over, then within it once trimmed), and the
 * linen shirt's colour read from its photo.
 */
function TitleMeta({ p, s, on, delay }: { p: HeroProduct; s: StoryState; on: boolean; delay: number }) {
  const tag = 'h-[18px] px-1.5 text-[11px]'
  if (p.meta === 'voice') {
    return (
      <Rise on={on} delay={delay} className="flex h-[18px] items-center">
        <TagChip tone="brand" className={tag}>
          {STORY.voice}
        </TagChip>
      </Rise>
    )
  }
  if (p.meta === 'colour') {
    return (
      <Rise on={on} delay={delay} className="flex h-[18px] items-center">
        <TagChip tone="plain" className={cn(tag, 'gap-1')}>
          <Icon name="check" size={12} />
          {STORY.colour}
        </TagChip>
      </Rise>
    )
  }
  const draft = titleLength(p.draftTitle)
  const now = titleLength(p.title)
  const count = (n: number) => (
    <>
      {n}/{LIMIT} characters
    </>
  )
  return (
    <Rise on={on} delay={delay} className="h-[18px]">
      <Layers
        show={s.fixed ? 2 : s.finding ? 1 : 0}
        cross
        duration={0.4}
        itemClassName="flex h-[18px] items-center text-[12px] leading-none font-medium tabular-nums"
        layers={[
          <span key="n" className="text-ink-3">
            {count(draft)}
          </span>,
          <span key="over" className="text-danger-ink">
            {count(draft)}
          </span>,
          <span key="ok" className="text-success">
            {count(now)}
          </span>,
        ]}
      />
    </Rise>
  )
}

const ROW = {
  title: 'h-10',
  meta: 'h-[18px]',
  bullets: 'h-9',
  price: 'h-[22px]',
  sizes: 'h-6',
  attrs: 'h-[18px]',
} as const

function Listing({ player, states }: { player: Player; states: StoryState[] }) {
  const s = states[player.product]!
  const p = PRODUCTS[player.product]!
  // Each row stacks a skeleton and the three products' versions in one reserved cell.
  const row = (key: keyof typeof ROW, skeleton: ReactNode, version: (p: HeroProduct, s: StoryState, on: boolean, i: number) => ReactNode, i: number) => (
    <div className={cn('relative grid', ROW[key])}>
      <m.span
        aria-hidden
        className="col-start-1 row-start-1 flex flex-col justify-center gap-3"
        initial={false}
        animate={{ opacity: s.drafted ? 0 : 1 }}
        transition={{ duration: s.drafted ? 0.3 : sec(CROSSFADE_MS), delay: s.drafted ? STAGGER * i : 0, ease: CALM }}
      >
        {skeleton}
      </m.span>
      {PRODUCTS.map((q, j) => (
        <span key={q.id} className="col-start-1 row-start-1 min-w-0">
          {version(q, states[j]!, j === player.product && states[j]!.drafted, i)}
        </span>
      ))}
    </div>
  )

  const failing = CHECKS.findIndex((c) => c.id === p.failing)
  // The checks tick in order; the failing one waits for the fix.
  const tickDelay = (k: number) => (k === failing ? 0.12 : sec(TICK_STAGGER_MS) * CHECKS.slice(0, k).filter((c) => c.id !== p.failing).length)
  const outcome = (j: number) => (s.fixed ? 2 + 2 * j : s.finding ? 1 + 2 * j : 0)

  return (
    <div className="flex flex-col">
      {/* The header: the marketplace and the listing's one status. */}
      <div className="flex h-7 items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-small font-semibold text-ink">
          <MarketplaceTile id="amazon" size="sm" />
          Amazon
        </span>
        <span className="grid">
          {PRODUCTS.map((q, j) => (
            <m.span
              key={q.id}
              className="col-start-1 row-start-1 grid justify-items-end"
              initial={false}
              animate={{ opacity: j === player.product ? 1 : 0 }}
              transition={{ duration: sec(CROSSFADE_MS) / 2, delay: j === player.product ? sec(CROSSFADE_MS) / 2 : 0, ease: CALM }}
            >
              <Layers
                show={STATUSES.indexOf(states[j]!.status)}
                className="justify-items-end"
                itemClassName="flex h-7 items-center justify-end"
                layers={STATUSES.map((st) => (
                  <StatusPill key={st} status={st} />
                ))}
              />
            </m.span>
          ))}
        </span>
      </div>

      {/* The copy: title and bullets, lit softly when the brand's voice is in the spotlight. */}
      <div className="relative isolate mt-3.5 flex flex-col gap-1.5">
        <Spot on={p.spotlight === 'voice' && s.spot} className="-inset-y-1.5" />
        {row(
          'title',
          <>
            <Bar className="w-full" />
            <Bar className="w-3/5" />
          </>,
          (q, qs, on) => (
            <span className="block text-[14px] leading-5 font-semibold text-pretty text-ink">
              <Title p={q} s={qs} on={on} />
            </span>
          ),
          0,
        )}
        <Quiet on={s.quiet}>
          {row('meta', <Bar className="w-1/4" />, (q, qs, on, i) => <TitleMeta p={q} s={qs} on={on} delay={STAGGER * (i + 1)} />, 1)}
        </Quiet>
        <Quiet on={s.quiet}>
        {row(
          'bullets',
          <>
            <Bar className="w-11/12" />
            <Bar className="w-4/5" />
          </>,
          (q, _qs, on, i) => (
            <ul className="flex flex-col text-caption leading-[18px] text-ink-2">
              {q.bullets.map((b, k) => (
                <li key={b}>
                  <Rise
                    on={on}
                    delay={STAGGER * (i - 1 + k)}
                    className="relative truncate pl-3 before:absolute before:top-[7px] before:left-0.5 before:size-1 before:rounded-full before:bg-ink-3"
                  >
                    {b}
                  </Rise>
                </li>
              ))}
            </ul>
          ),
          2,
        )}
        </Quiet>
      </div>

      <Quiet on={s.quiet} className="mt-3 flex flex-col gap-2">
        {row(
          'price',
          <Bar className="w-1/3" />,
          (q, _qs, on, i) => (
            <Rise on={on} delay={STAGGER * i} className="flex h-[22px] items-baseline gap-2 tabular-nums">
              <span className="text-[15px] leading-[22px] font-semibold text-ink">{q.price}</span>
              <span className="text-caption text-ink-3">
                M.R.P. <s>{q.mrp}</s>
              </span>
              <span className="ml-auto text-caption text-ink-2">{q.sizes.length} variants</span>
            </Rise>
          ),
          3,
        )}
        <div className="relative isolate">
          <Spot on={p.spotlight === 'variants' && s.spot} className="-inset-y-1" />
          {row(
            'sizes',
            <span className="flex gap-1">
              {[0, 1, 2, 3, 4].map((k) => (
                <span key={k} className="h-6 w-7 rounded-md bg-subtle" />
              ))}
            </span>,
            (q, _qs, on, i) => (
              <span className="flex gap-1">
                {q.sizes.map((size, k) => (
                  // The variant strip: one chip per size, in order.
                  <Rise
                    key={size}
                    on={on}
                    delay={STAGGER * i + (q.spotlight === 'variants' ? STAGGER : 0.04) * k}
                    className="grid h-6 min-w-7 place-items-center rounded-md border border-line-strong bg-surface px-1.5 text-[11px] leading-none font-semibold text-ink-2"
                  >
                    {size}
                  </Rise>
                ))}
              </span>
            ),
            4,
          )}
        </div>
        {row(
          'attrs',
          <span className="grid grid-cols-3 gap-3">
            <Bar />
            <Bar />
            <Bar />
          </span>,
          (q, _qs, on, i) => (
            // The key attributes on one line: a muted label, then its value.
            // Spread across the row; a narrow card shrinks the longest value first, never a short one.
            <dl className="flex h-[18px] justify-between gap-3 text-caption leading-[18px]">
              {q.attributes.map((a, k) => (
                <Rise key={a.label} on={on} delay={STAGGER * (i + k)} className="flex min-w-0 gap-1.5">
                  <dt className="shrink-0 text-ink-3">{a.label}</dt>
                  <dd className="truncate font-medium text-ink">{a.value}</dd>
                </Rise>
              ))}
            </dl>
          ),
          5,
        )}
      </Quiet>

      <span aria-hidden className="mt-3.5 h-px bg-line" />

      {/* The checks, ticking in order; the failing one is flagged until the fix lands. */}
      <ul className="mt-3 flex flex-col gap-1">
        {CHECKS.map((c, k) => {
          const on = s.ticked.has(c.id)
          const flagged = c.id === p.failing && s.finding && !on
          return (
            <li key={c.id} className="flex h-[18px] items-center gap-2 text-caption text-ink-2">
              <span className="grid size-4 shrink-0 place-items-center">
                <m.span
                  className="col-start-1 row-start-1 size-3 rounded-full border border-line-strong"
                  initial={false}
                  animate={{ opacity: on || flagged ? 0 : 1 }}
                  transition={{ duration: 0.2, delay: on ? tickDelay(k) : 0 }}
                />
                <m.span
                  className={cn('col-start-1 row-start-1 text-[10px] leading-none font-bold', p.failing === 'required' ? 'text-attention' : 'text-danger')}
                  initial={false}
                  animate={{ opacity: flagged ? 1 : 0 }}
                  transition={{ duration: 0.3, ease: CALM }}
                >
                  {p.failing === 'required' ? '▲' : '✕'}
                </m.span>
                <m.span
                  className="col-start-1 row-start-1 text-success"
                  initial={false}
                  animate={on ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.6 }}
                  transition={{ duration: 0.36, delay: on ? tickDelay(k) : 0, ease: CALM }}
                >
                  <Icon name="check" size={14} />
                </m.span>
              </span>
              {c.text}
            </li>
          )
        })}
      </ul>

      {/* The fix line: empty, the finding, then the fix, swapped in place. */}
      <div className="mt-2.5 h-[42px]">
        <Layers
          show={outcome(player.product)}
          cross
          duration={0.44}
          className="items-start"
          layers={[
            <span key="none" />,
            ...PRODUCTS.flatMap((q) => [
              <StatusChip key={`${q.id}-finding`} status={q.failing === 'required' ? 'needs-you' : 'error'}>
                {q.finding}
              </StatusChip>,
              <span key={`${q.id}-fixed`} className="flex flex-col items-start gap-1">
                <TagChip className={cn('gap-1', CHIP_TONE[q.fixTone])}>
                  <Icon name="check" size={14} />
                  {q.fixTag}
                </TagChip>
                <span className="max-w-full truncate text-caption text-ink-2">{q.fixCaption}</span>
              </span>,
            ]),
          ]}
        />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------------------------------------
 * The stage
 * --------------------------------------------------------------------------------------------- */

/** A layer's pointer drift, `reach` px at most. */
function useDrift(pointer: { x: MotionValue<number>; y: MotionValue<number> }, reach: number) {
  const x = useTransform(pointer.x, (v) => v * reach)
  const y = useTransform(pointer.y, (v) => v * reach)
  return { x, y }
}

export function HeroStage({ hero }: { hero: RefObject<HTMLElement | null> }) {
  const reduced = usePrefersReducedMotion()
  // The entrance plays only for a first view with motion on; switching reduced motion on later
  // simply shows the still frame.
  const [enter] = useState(!reduced)
  const [live, step] = useReducer(advance, reduced, startPlayer)
  const [entering, setEntering] = useState(enter)
  const fig = useRef<HTMLElement>(null)
  const onScreen = useOnScreen(fig)
  const pageVisible = usePageVisible()
  const playing = onScreen && pageVisible && !reduced
  const player: Player = reduced ? startPlayer(true) : live

  // The other two photos load once the stage has been on screen, well before the first crossfade.
  const [seen, setSeen] = useState(false)
  // Latched during render (React's "adjust state on a prop change" pattern), never reset.
  if (onScreen && !reduced && !seen) setSeen(true)

  // Which photos have loaded. The loop never moves to a product whose photo is still loading, so a
  // slow connection holds the current product instead of showing the old photo under new facts.
  const [loaded, setLoaded] = useState<readonly boolean[]>(() => PRODUCTS.map(() => false))
  const onLoaded = useCallback((i: number) => setLoaded((l) => (l[i] ? l : l.map((v, k) => v || k === i))), [])
  const upcoming = next(player).product
  const waiting = upcoming !== player.product && !loaded[upcoming]

  useEffect(() => {
    if (!playing || waiting) return
    const id = window.setTimeout(step, beatDelay(player.beat))
    return () => window.clearTimeout(id)
  }, [playing, waiting, player.beat, player.product])

  useEffect(() => {
    if (!entering) return
    const id = window.setTimeout(() => setEntering(false), ENTRANCE_MS)
    return () => window.clearTimeout(id)
  }, [entering])

  // Each product's state: the one playing, the one before it held finished while it fades out, and
  // the third already reset (unseen) to its first beat.
  const states = PRODUCTS.map((_, i) =>
    reduced ? (i === 0 ? FINAL : storyAt(i, 0)) : i === player.product ? storyAt(i, player.beat) : i === player.prev ? storyAt(i, LAST) : storyAt(i, 0),
  )
  const at = player.beat >= 0 ? BEATS[player.beat]!.id : 'end3'

  // Pointer parallax from lg (fine pointer only); it rests at 0 otherwise.
  const lg = useMediaQuery('(min-width: 1024px)')
  // From md the stage sits beside or just under the copy, above the fold, so its first photo is the
  // likely LCP and loads first; on phones it is further down and loads at normal priority.
  const md = useMediaQuery('(min-width: 768px)')
  const pointer = usePointerParallax(hero, lg && !reduced)
  const photoLayer = useDrift(pointer, 3)
  const amazonLayer = useDrift(pointer, 6)
  const will = entering ? 'transform' : 'auto'
  const rise = enter && player.beat === ENTER

  return (
    <LazyMotion features={domAnimation}>
      <figure ref={fig} aria-label={STORY.label} data-testid="hero-example" className="@container/tray flex min-w-0 flex-col gap-4 xl:gap-5">
        <p className="sr-only">{STORY.summary}</p>

        <div
          aria-hidden
          data-testid="hero-stage"
          data-product={PRODUCTS[player.product]!.id}
          data-beat={reduced ? 'final' : player.beat}
          data-paused={playing ? undefined : ''}
          className="group/stage relative flex flex-col"
        >
          {/* The record: full width on phones, the left 48% from md. Its photo sets the stage's height. */}
          <m.div style={{ ...photoLayer, willChange: will }} className="relative z-0 md:w-[round(down,48%,1px)]">
            <Enter play={rise} delay={ENTRANCE.record} from={{ y: 16 }}>
              <PhotoCard player={player} states={states} mounted={seen} eager={md} confirmSpot={at === 'confirm'} onLoaded={onLoaded} />
            </Enter>
          </m.div>

          {/* The Amazon listing: stacked on the same edges on phones; from md in front, on a fixed offset
              over the photo's right edge, ending above the photo's facts. */}
          <m.div
            style={{ ...amazonLayer, willChange: will }}
            className="relative z-20 mt-3 md:absolute md:top-8 md:right-0 md:mt-0 md:w-[round(down,58%,1px)] xl:top-10"
          >
            <Enter play={rise} delay={ENTRANCE.amazon} from={{ y: 24 }} duration={0.64}>
              <div data-testid="hero-amazon" className="rounded-card border border-line bg-surface p-4 shadow-raised-lg">
                <Listing player={player} states={states} />
              </div>
            </Enter>
          </m.div>
        </div>

        <MarketplaceRail className="relative z-20 shrink-0" enter={enter} ring={reduced ? 0 : player.ring} ringDelay={300} />
      </figure>
    </LazyMotion>
  )
}
