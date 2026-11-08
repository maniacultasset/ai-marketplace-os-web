/**
 * The landing hero's visual. A real product photo of one kurta set sits on the left as the record
 * card; the Amazon listing Kuinn writes from it overlaps the photo on a fixed offset; the marketplace
 * rail lines up under both on the same column edges. Nothing inside is a control and nothing is app
 * data.
 *
 * Motion (transform and opacity only, hero-story.ts holds every time):
 * - Entrance, once: the photo card, the Amazon card and the rail rise in showing the finished
 *   listing, and the live dot rings once. The h1 never waits.
 * - Loop: a 10.8s cycle that starts 1.6s after the entrance. The photo crossfades to its
 *   white-background version, the facts are confirmed, the field chips travel, the checks tick,
 *   "Best" is flagged and removed, "Fixed for you", then "Ready to approve". The restart is one soft
 *   crossfade of the listing's contents; the cards never move or remount.
 * - It pauses by itself (WCAG 2.2.2) while the pointer is over it, while focus is inside it (the
 *   figure is focusable for that), while it is less than 40% on screen and while the tab is hidden,
 *   and picks up again from the same beat. There are no visible play controls.
 * - Pointer parallax from lg with a fine pointer, at most 6px, 2D translate only.
 * - Reduced motion: the finished state at once, no loop, no parallax, no ring.
 *
 * Layout never shifts: from md the stage has a fixed minimum height and every card is placed inside
 * it. Whatever changes is stacked in a reserved cell and only fades or moves.
 */
import { domAnimation, LazyMotion, m, type MotionValue, useTransform } from 'motion/react'
import { useEffect, useReducer, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { Icon } from '@/components/la/icons'
import { MarketplaceTile } from '@/components/la/marketplace'
import { SourceBadge } from '@/components/la/source-badge'
import { StatusChip, TagChip } from '@/components/la/status-chip'
import { useMediaQuery, usePrefersReducedMotion } from '@/lib/use-media-query'
import { usePointerParallax } from '@/lib/use-pointer-parallax'
import { cn } from '@/lib/utils'
import { MarketplaceRail } from './marketplace-rail'
import { useHold, usePageVisible } from './use-loop-hold'
import { BEATS, beatDelay, ENTER, ENTRANCE, FINAL, HERO_PHOTO, LAST, nextBeat, RESET_DIP_MS, STORY, storyAt, type StoryState } from './hero-story'

/** --ease-out-calm, for motion's JS animations. */
const CALM = [0.22, 1, 0.36, 1] as const
/** --ease-spring as a critically damped spring (no overshoot). */
const SPRING = { type: 'spring', bounce: 0, duration: 0.48 } as const
const ENTRANCE_MS = 1800
const sec = (ms: number) => ms / 1000

/* ------------------------------------------------------------------------------------------------
 * The beat player
 * --------------------------------------------------------------------------------------------- */

interface Player {
  beat: number
  /** Loops completed; the first hold on the finished listing is the shorter one after the entrance. */
  cycle: number
  /** Bumps each time the field chips travel, so they remount and play again. */
  trip: number
  /** Bumps each time the listing turns ready, so the live dot rings again. */
  ring: number
}

// The field chips travel only inside the loop, never in the entrance (which shows the finished listing).
const startPlayer = (reduced: boolean): Player => ({ beat: reduced ? LAST : ENTER, cycle: 0, trip: 0, ring: 0 })

function advance(p: Player): Player {
  const beat = nextBeat(p.beat)
  return {
    beat,
    cycle: p.beat === LAST ? p.cycle + 1 : p.cycle,
    trip: BEATS[beat]?.id === 'chips' ? p.trip + 1 : p.trip,
    ring: beat === LAST ? p.ring + 1 : p.ring,
  }
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
 * The outgoing layer fades out first and is then hidden; only then does the next fade in, so two
 * chips of different widths never show together. `show` picks the layer; -1 shows none.
 */
function Layers({ show, layers, duration = 0.24, className }: { show: number; layers: ReactNode[]; duration?: number; className?: string }) {
  return (
    <span className={cn('grid', className)}>
      {layers.map((layer, i) => {
        const on = i === show
        return (
          <m.span
            key={i}
            className="col-start-1 row-start-1"
            initial={false}
            animate={on ? { opacity: 1, visibility: 'visible' } : { opacity: 0, transitionEnd: { visibility: 'hidden' } }}
            transition={{ duration: duration / 2, delay: on ? duration / 2 : 0, ease: CALM }}
          >
            {layer}
          </m.span>
        )
      })}
    </span>
  )
}

const Swap = ({ on, off, to, duration, className }: { on: boolean; off: ReactNode; to: ReactNode; duration?: number; className?: string }) => (
  <Layers show={on ? 1 : 0} layers={[off, to]} duration={duration} className={className} />
)

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
 * Cards
 * --------------------------------------------------------------------------------------------- */

/** "White background · You approve": the cleaned photo is a proposal, never a done deal. One quiet pill. */
function PhotoTag({ s, className }: { s: StoryState; className?: string }) {
  return (
    <m.span
      initial={false}
      animate={{ opacity: s.photoTag ? 1 : 0, y: s.photoTag ? 0 : 4 }}
      transition={{ duration: 0.4, ease: CALM }}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 text-caption font-semibold whitespace-nowrap text-ink shadow-raised-sm',
        className,
      )}
    >
      <Icon name="image" size={14} className="text-ink-2" />
      {STORY.photoTag}
      <span aria-hidden className="text-ink-3">
        ·
      </span>
      <span className="font-medium text-ink-2">{STORY.photoApproval}</span>
    </m.span>
  )
}

/** The record: the real product photo (studio shot, then the white-background main image) and its facts. */
function PhotoCard({ s }: { s: StoryState }) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-card border border-line bg-surface shadow-raised-md">
      {/* Phones: a 4:3 crop on the garment. From md the photo fills whatever the card leaves above the facts. */}
      <div className="relative aspect-[4/3] shrink-0 overflow-hidden bg-photo-white md:aspect-auto md:min-h-0 md:flex-1">
        <img
          src={HERO_PHOTO.white}
          alt={STORY.photoAlt}
          width={HERO_PHOTO.width}
          height={HERO_PHOTO.height}
          fetchPriority="high"
          decoding="async"
          draggable={false}
          className="absolute inset-0 size-full object-cover object-[50%_28%] md:object-top"
        />
        <m.img
          src={HERO_PHOTO.studio}
          alt=""
          width={HERO_PHOTO.width}
          height={HERO_PHOTO.height}
          decoding="async"
          draggable={false}
          className="absolute inset-0 size-full object-cover object-[50%_28%] md:object-top"
          initial={false}
          animate={{ opacity: s.white ? 0 : 1 }}
          transition={{ duration: 0.9, ease: CALM }}
        />
        <PhotoTag s={s} className="absolute bottom-3 left-3" />
      </div>
      <div className="flex flex-col gap-2.5 border-t border-line p-4 max-md:pb-10">
        <p className="truncate text-small font-semibold text-ink">{STORY.product}</p>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 text-caption">
          {STORY.facts.map((f) => (
            <div key={f.label} className="contents">
              <dt className="text-ink-2">{f.label}</dt>
              <dd className="font-medium text-ink">{f.value}</dd>
            </div>
          ))}
          <dt className="text-ink-2">{STORY.photoFact.label}</dt>
          <dd className="col-span-3 flex min-w-0 items-center gap-2 font-medium text-ink">
            <span className="truncate">{STORY.photoFact.value}</span>
            <Swap on={s.confirmed} duration={0.36} off={<SourceBadge source={{ kind: 'photo' }} />} to={<SourceBadge source={{ kind: 'confirmed' }} />} />
          </dd>
        </dl>
      </div>
    </div>
  )
}

function Title({ s }: { s: StoryState }) {
  return (
    // Clipped, so the closing-up title never shows past the card while it slides in.
    <p className="-mx-0.5 grid overflow-hidden px-0.5 text-small leading-5 font-semibold text-pretty text-ink">
      <m.span className="col-start-1 row-start-1" initial={false} animate={{ opacity: s.struck ? 0 : 1 }} transition={{ duration: 0.24, ease: CALM }}>
        <span className="relative isolate inline-block">
          <m.span
            className="absolute -inset-x-0.5 inset-y-0 -z-10 origin-left rounded-xs bg-danger-bg"
            initial={false}
            animate={{ scaleX: s.marked ? 1 : 0 }}
            transition={{ duration: s.marked ? 0.5 : 0.2, ease: CALM }}
          />
          <span className={cn('transition-colors duration-300', s.marked && 'text-danger-ink')}>{STORY.bannedWord}</span>
        </span>{' '}
        {STORY.title}
      </m.span>
      <m.span
        className="col-start-1 row-start-1"
        initial={false}
        animate={s.struck ? { opacity: 1, x: '0em' } : { opacity: 0, x: '2.6em' }}
        // It slides only on the way in; on the way out it fades, then resets its offset unseen.
        transition={{ opacity: { duration: 0.24, ease: CALM }, x: s.struck ? SPRING : { duration: 0, delay: 0.24 } }}
      >
        {STORY.title}
      </m.span>
    </p>
  )
}

function AmazonCard({ s, dim }: { s: StoryState; dim: boolean }) {
  // The cell under the checks: empty, then the finding, then the fix. Its room is always reserved.
  const outcome = s.fixed ? 2 : s.marked ? 1 : 0
  return (
    <div data-testid="hero-amazon" className="rounded-card border border-line bg-surface p-4 shadow-raised-lg md:p-5">
      {/* The loop's restart: only the contents crossfade; the card itself never moves. */}
      <m.div
        className="flex flex-col gap-3"
        initial={false}
        animate={{ opacity: dim ? 0 : 1 }}
        transition={{ duration: sec(RESET_DIP_MS / 2), ease: CALM }}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-small font-semibold text-ink">
            <MarketplaceTile id="amazon" size="sm" />
            Amazon
          </span>
          <Swap
            on={s.ready}
            className="justify-items-end"
            off={
              // Its own working glyph, a slow spinner, so it never reads as Flipkart's ◐ Next.
              <StatusChip
                status="working"
                glyph={
                  <span className="inline-block size-2 animate-spin rounded-full border-[1.5px] border-current border-r-transparent [animation-duration:1.2s] group-data-[paused]/stage:[animation-play-state:paused] motion-reduce:animate-none" />
                }
              >
                {STORY.checking}
              </StatusChip>
            }
            to={<StatusChip status="ready">{STORY.ready}</StatusChip>}
          />
        </div>
        <Title s={s} />
        <p className="text-caption text-ink-2">{STORY.bullet}</p>
        <ul className="flex flex-col gap-1.5">
          {STORY.checks.map((c, i) => {
            const on = s.ticked.has(c.id)
            return (
              <li key={c.id} className="flex items-center gap-2 text-caption text-ink-2">
                <span className="grid size-4 shrink-0 place-items-center">
                  <m.span
                    className="col-start-1 row-start-1 size-3 rounded-full border border-line-strong"
                    initial={false}
                    animate={{ opacity: on ? 0 : 1 }}
                    transition={{ duration: 0.2 }}
                  />
                  <m.span
                    className="col-start-1 row-start-1 text-success"
                    initial={false}
                    animate={on ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.6 }}
                    transition={{ duration: 0.32, delay: on && i === 2 ? 0.14 : 0, ease: CALM }}
                  >
                    <Icon name="check" size={14} />
                  </m.span>
                </span>
                {c.text}
              </li>
            )
          })}
        </ul>
        <div className="relative pt-3">
          {/* The hairline shows with the finding, so the card never ends on an empty rule. */}
          <m.span
            aria-hidden
            className="absolute inset-x-0 top-0 h-px bg-line"
            initial={false}
            animate={{ opacity: outcome ? 1 : 0 }}
            transition={{ duration: 0.3, ease: CALM }}
          />
          <Layers
            show={outcome}
            duration={0.4}
            className="items-start"
            layers={[
              <span key="none" />,
              <span key="finding" className="flex flex-col items-start gap-1.5">
                <StatusChip status="error">{STORY.finding}</StatusChip>
                <span className="text-caption text-ink-2">{STORY.findingCaption}</span>
              </span>,
              <span key="fixed" className="flex flex-col items-start gap-1.5">
                <TagChip tone="brand" className="gap-1">
                  <Icon name="check" size={14} />
                  {STORY.fixed}
                </TagChip>
                <span className="text-caption text-ink-2">{STORY.fixedCaption}</span>
              </span>,
            ]}
          />
        </div>
      </m.div>
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
  // simply shows the finished listing.
  const [enter] = useState(!reduced)
  const [player, step] = useReducer(advance, reduced, startPlayer)
  const [entering, setEntering] = useState(enter)
  const fig = useRef<HTMLElement>(null)
  const onScreen = useOnScreen(fig)
  const pageVisible = usePageVisible()
  const { held, handlers } = useHold()
  const playing = !held && onScreen && pageVisible && !reduced
  const s = reduced ? FINAL : storyAt(player.beat)

  // The restart: the listing's contents fade out over the last half of RESET_DIP_MS, the loop
  // starts again unseen, and they fade back in. A pause mid-fade brings them straight back.
  const [dim, setDim] = useState(false)
  useEffect(() => {
    if (!playing) return
    const delay = beatDelay(player.beat, player.cycle)
    const ids = [window.setTimeout(step, delay)]
    if (player.beat === LAST) ids.push(window.setTimeout(() => setDim(true), delay - RESET_DIP_MS / 2))
    return () => {
      ids.forEach((id) => window.clearTimeout(id))
      setDim(false)
    }
  }, [playing, player.beat, player.cycle])

  useEffect(() => {
    if (!entering) return
    const id = window.setTimeout(() => setEntering(false), ENTRANCE_MS)
    return () => window.clearTimeout(id)
  }, [entering])

  // Pointer parallax from lg (fine pointer only); it rests at 0 otherwise.
  const lg = useMediaQuery('(min-width: 1024px)')
  const pointer = usePointerParallax(hero, lg)
  const photoLayer = useDrift(pointer, 3)
  const amazonLayer = useDrift(pointer, 6)
  const will = entering ? 'transform' : 'auto'

  // The field chips leave 70ms apart.
  const chipTiming = (i: number): CSSProperties => ({ '--chip-delay': `${i * 70}ms` }) as CSSProperties
  const rise = enter && player.cycle === 0

  return (
    <LazyMotion features={domAnimation}>
      {/* Focusable, so a keyboard user can hold the loop still the same way a pointer does. */}
      <figure
        ref={fig}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focus holds the loop (WCAG 2.2.2)
        tabIndex={0}
        aria-label={STORY.label}
        data-testid="hero-example"
        className="@container/tray flex h-full min-w-0 flex-col gap-4 rounded-card outline-offset-4 xl:gap-5"
        {...handlers}
      >
        <p className="sr-only">{STORY.summary}</p>

        <div
          aria-hidden
          data-testid="hero-stage"
          data-beat={reduced ? 'final' : player.beat}
          data-paused={playing ? undefined : ''}
          className="group/stage relative flex flex-col md:block md:h-[460px] lg:h-auto lg:min-h-[420px] lg:flex-1 xl:min-h-[460px] 2xl:min-h-[500px]"
        >
          {/* The record: full width on phones, the left 56% from md, top to bottom. */}
          <m.div style={{ ...photoLayer, willChange: will }} className="relative z-0 md:absolute md:inset-y-0 md:left-0 md:w-[56%]">
            <Enter play={rise} delay={ENTRANCE.record} from={{ y: 16 }} className="h-full">
              <PhotoCard s={s} />
            </Enter>
          </m.div>

          {/* Field chips, carried from the record into the Amazon listing. */}
          <div className="pointer-events-none relative z-30 h-0 [--chip-dx:0px] [--chip-dy:40px] md:absolute md:top-[40%] md:left-[30%] md:[--chip-dx:26cqw] md:[--chip-dy:0px]">
            {reduced || player.trip === 0 ? null : (
              <div className="absolute -top-10 left-1/2 flex -translate-x-1/2 gap-2 md:top-0 md:left-0 md:translate-x-0 md:flex-col md:items-start">
                {STORY.chips.map((c, i) => (
                  <span
                    key={`${player.trip}-${c}`}
                    className="hero-chip inline-flex h-7 items-center rounded-full border border-line bg-surface px-3 text-caption font-semibold text-ink-2 shadow-raised-sm"
                    style={chipTiming(i)}
                  >
                    {c}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* The Amazon listing: in front, 24px into the photo on phones, 48px down and 8% over it from md. */}
          <m.div
            style={{ ...amazonLayer, willChange: will }}
            className="relative z-20 -mt-6 ml-6 md:absolute md:top-12 md:right-0 md:m-0 md:w-[52%]"
          >
            <Enter play={rise} delay={ENTRANCE.amazon} from={{ y: 24 }} duration={0.64}>
              <AmazonCard s={s} dim={dim} />
            </Enter>
          </m.div>
        </div>

        <MarketplaceRail className="relative z-20 shrink-0" enter={enter} ring={reduced ? 0 : player.ring} ringDelay={player.ring === 1 ? 120 : 0} />
      </figure>
    </LazyMotion>
  )
}
