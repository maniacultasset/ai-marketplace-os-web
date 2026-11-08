/**
 * The landing hero's visual, "the display well": a recessed matte tray in the hero's light field.
 * Inside it one kurta set record turns into an Amazon listing that is ready to approve. A Flipkart
 * card waits behind it as a dashed ghost, and the marketplace rail below lights up in three levels
 * (live, next, roadmap). It is an example, labelled as one, never app data, and nothing inside is a
 * control except Pause/Play.
 *
 * Motion (transform and opacity only, hero-story.ts holds every time):
 * - Entrance, once: the tray settles in, the record card, chips, Amazon card, ghost and rail follow,
 *   the Amazon chip turns "Ready to approve" and the live dot rings once. The h1 never waits.
 * - Loop: a 10.8s cycle that starts 1.6s after the entrance. It runs only while 40% of the tray is
 *   on screen and the tab is visible. Pause/Play is the first stop in the figure for the keyboard.
 * - Parallax: scroll from md, pointer from lg with a fine pointer; 2D translate only.
 * - Reduced motion: the finished state at once, no loop, no parallax, no ring, no toggle.
 *
 * Layout never shifts: from md the stage has a fixed height and every card is placed inside it;
 * everything that changes is stacked in a reserved box and only fades or moves.
 */
import { Pause, Play } from 'lucide-react'
import { domAnimation, LazyMotion, m, useMotionValue, useScroll, useTransform, type MotionValue } from 'motion/react'
import { useEffect, useReducer, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import studioPhoto from '@/assets/landing/kurta-set-studio.svg'
import whitePhoto from '@/assets/landing/kurta-set-white.svg'
import { Icon, IconGlyph } from '@/components/la/icons'
import { MarketplaceTile } from '@/components/la/marketplace'
import { SourceBadge } from '@/components/la/source-badge'
import { StatusChip, TagChip } from '@/components/la/status-chip'
import { Button } from '@/components/ui/button'
import { useMediaQuery, usePrefersReducedMotion } from '@/lib/use-media-query'
import { usePointerParallax } from '@/lib/use-pointer-parallax'
import { cn } from '@/lib/utils'
import { MarketplaceRail, NEXT_LOGO } from './marketplace-rail'
import { BEATS, beatDelay, ENTER, ENTRANCE, FINAL, LAST, nextBeat, STORY, storyAt, type StoryState } from './hero-story'

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

const startPlayer = (reduced: boolean): Player => (reduced ? { beat: LAST, cycle: 0, trip: 0, ring: 0 } : { beat: ENTER, cycle: 0, trip: 1, ring: 0 })

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

function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden')
  useEffect(() => {
    const on = () => setVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [])
  return visible
}

/* ------------------------------------------------------------------------------------------------
 * Parallax layers
 * --------------------------------------------------------------------------------------------- */

interface Layer {
  x: MotionValue<number>
  y: MotionValue<number>
}

/** One layer's drift: `reach` px with the pointer, `lift` px over the hero's scroll (gated from md). */
function useLayer(pointer: Layer, scroll: MotionValue<number>, gate: MotionValue<number>, reach: number, lift: number): Layer {
  const x = useTransform(pointer.x, (v) => v * reach)
  const y = useTransform([pointer.y, scroll, gate], ([py, s, g]: number[]) => py! * reach + s! * lift * g!)
  return { x, y }
}

/* ------------------------------------------------------------------------------------------------
 * Small pieces
 * --------------------------------------------------------------------------------------------- */

/** Two states in one reserved cell: the cell is as big as the larger, so a swap never moves layout. */
function Swap({ on, off, to, duration = 0.24, className }: { on: boolean; off: ReactNode; to: ReactNode; duration?: number; className?: string }) {
  return (
    <span className={cn('grid', className)}>
      <m.span className="col-start-1 row-start-1" initial={false} animate={{ opacity: on ? 0 : 1 }} transition={{ duration, ease: CALM }}>
        {off}
      </m.span>
      <m.span className="col-start-1 row-start-1" initial={false} animate={{ opacity: on ? 1 : 0 }} transition={{ duration, ease: CALM }}>
        {to}
      </m.span>
    </span>
  )
}

/** Rises into place with the hero entrance; reduced motion or a later mount shows it at once. */
function Enter({
  play,
  delay,
  from,
  duration = 0.56,
  willChange,
  className,
  children,
}: {
  play: boolean
  delay: number
  from: { opacity?: number; y?: number; scale?: number }
  duration?: number
  willChange?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <m.div
      className={className}
      initial={play ? { opacity: 0, ...from } : false}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration, delay: sec(delay), ease: CALM }}
      style={willChange ? { willChange: 'transform, opacity' } : undefined}
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

function RecordCard({ s }: { s: StoryState }) {
  return (
    // The Amazon card overlaps the bottom 24px on phones and the right 24px from md, so the
    // content keeps clear of it.
    <div className="rounded-card border border-line bg-surface p-4 pb-10 shadow-raised-md md:p-5 md:pr-10">
      <div className="flex gap-3 md:flex-col">
        {/* The photo: the studio shot, then the cleaned white-background main image over it. */}
        <span className="relative size-18 shrink-0 overflow-hidden rounded-tile border border-line bg-photo-white md:aspect-square md:size-auto md:w-full">
          <img src={studioPhoto} alt="" width={240} height={240} decoding="async" draggable={false} className="absolute inset-0 size-full object-cover" />
          <m.img
            src={whitePhoto}
            alt=""
            width={240}
            height={240}
            decoding="async"
            draggable={false}
            className="absolute inset-0 size-full object-cover"
            initial={false}
            animate={{ opacity: s.white ? 1 : 0 }}
            transition={{ duration: 0.6, ease: CALM }}
          />
        </span>
        <div className="flex min-w-0 flex-col items-start gap-1">
          <p className="text-caption text-ink-2">{STORY.recordLabel}</p>
          <p className="text-small font-semibold text-pretty text-ink">{STORY.product}</p>
          <m.span initial={false} animate={{ opacity: s.photoTag ? 1 : 0 }} transition={{ duration: 0.32, ease: CALM }} className="mt-1">
            <TagChip tone="tag" className="gap-1">
              <Icon name="image" size={14} />
              {STORY.photoTag}
            </TagChip>
          </m.span>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-4 gap-y-1.5 text-small">
        {STORY.facts.map((f) => (
          <div key={f.label} className="contents">
            <dt className="text-ink-2">{f.label}</dt>
            <dd className="font-medium text-ink">{f.value}</dd>
          </div>
        ))}
        <dt className="text-ink-2">{STORY.photoFact.label}</dt>
        <dd className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-medium text-ink">
          {STORY.photoFact.value}
          <Swap on={s.confirmed} duration={0.3} off={<SourceBadge source={{ kind: 'photo' }} />} to={<SourceBadge source={{ kind: 'confirmed' }} />} />
        </dd>
      </dl>
    </div>
  )
}

function Title({ s }: { s: StoryState }) {
  return (
    <p className="grid text-small leading-5 font-semibold text-pretty text-ink">
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
        transition={{ opacity: { duration: 0.24, ease: CALM }, x: SPRING }}
      >
        {STORY.title}
      </m.span>
    </p>
  )
}

function AmazonCard({ s }: { s: StoryState }) {
  return (
    <div data-testid="hero-amazon" className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-raised-lg md:p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-small font-semibold text-ink">
          <MarketplaceTile id="amazon" size="sm" />
          Amazon
        </span>
        <Swap
          on={s.ready}
          className="justify-items-end"
          off={<StatusChip status="working">{STORY.checking}</StatusChip>}
          to={<StatusChip status="ready">{STORY.ready}</StatusChip>}
        />
      </div>
      <Title s={s} />
      <p className="text-small text-ink-2">{STORY.bullet}</p>
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
      <m.div
        className="flex flex-col items-start gap-1.5 border-t border-line pt-3"
        initial={false}
        animate={s.fixed ? { opacity: 1, y: 0 } : { opacity: 0, y: 4 }}
        transition={{ duration: 0.32, ease: CALM }}
      >
        <TagChip tone="brand" className="gap-1">
          <Icon name="check" size={14} />
          {STORY.fixed}
        </TagChip>
        <p className="text-caption text-ink-2">{STORY.fixedCaption}</p>
      </m.div>
    </div>
  )
}

function FlipkartGhost() {
  return (
    <div className="relative h-full">
      {/* The fill and dashed edge are softened, never the words. */}
      <span aria-hidden className="absolute inset-0 rounded-card border border-dashed border-line-strong bg-surface opacity-70" />
      <div className="relative flex h-full items-end justify-end gap-2 px-4 pt-8 pb-3 md:flex-col md:items-start md:justify-end md:gap-2 md:p-4">
        <span className="flex items-center gap-2 text-small font-semibold text-ink">
          <MarketplaceTile id="flipkart" size="sm" className={NEXT_LOGO} />
          Flipkart
          <StatusChip status="paused" glyph="◐">
            Next
          </StatusChip>
        </span>
        <p data-testid="hero-ghost-line" className="text-caption text-ink-2 max-md:hidden">{STORY.ghost}</p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------------------------------------
 * The stage
 * --------------------------------------------------------------------------------------------- */

export function HeroStage({ hero }: { hero: RefObject<HTMLElement | null> }) {
  const reduced = usePrefersReducedMotion()
  // The entrance plays only for a first view with motion on; switching reduced motion on later
  // simply shows the finished listing.
  const [enter] = useState(!reduced)
  const [player, step] = useReducer(advance, reduced, startPlayer)
  const [wantsPlay, setWantsPlay] = useState(true)
  const [entering, setEntering] = useState(enter)
  const tray = useRef<HTMLDivElement>(null)
  const onScreen = useOnScreen(tray)
  const pageVisible = usePageVisible()
  const playing = wantsPlay && onScreen && pageVisible && !reduced
  const s = reduced ? FINAL : storyAt(player.beat)

  useEffect(() => {
    if (!playing) return
    const id = window.setTimeout(step, beatDelay(player.beat, player.cycle))
    return () => window.clearTimeout(id)
  }, [playing, player.beat, player.cycle])

  useEffect(() => {
    if (!entering) return
    const id = window.setTimeout(() => setEntering(false), ENTRANCE_MS)
    return () => window.clearTimeout(id)
  }, [entering])

  // Parallax: scroll from md, pointer from lg (fine pointer only). Both rest at 0 otherwise.
  const md = useMediaQuery('(min-width: 768px)')
  const lg = useMediaQuery('(min-width: 1024px)')
  const pointer = usePointerParallax(hero, lg)
  const { scrollYProgress } = useScroll({ target: hero, offset: ['start start', 'end start'] })
  const gate = useMotionValue(0)
  useEffect(() => gate.set(md && !reduced ? 1 : 0), [md, reduced, gate])
  const recordLayer = useLayer(pointer, scrollYProgress, gate, 4, -14)
  const ghostLayer = useLayer(pointer, scrollYProgress, gate, 6, -20)
  const chipLayer = useLayer(pointer, scrollYProgress, gate, 8, -21)
  const amazonLayer = useLayer(pointer, scrollYProgress, gate, 10, -28)
  const will = entering ? 'transform' : 'auto'

  // The entrance's chips leave 380, 450 and 520ms in; the loop's leave 70ms apart.
  const firstTrip = enter && player.trip === 1
  const chipTiming = (i: number): CSSProperties =>
    ({
      '--chip-delay': `${firstTrip ? ENTRANCE.chips[i] : i * 70}ms`,
      '--chip-dur': `${firstTrip ? 520 : 600}ms`,
    }) as CSSProperties

  return (
    <LazyMotion features={domAnimation}>
      <figure aria-labelledby="hero-stage-cap" data-testid="hero-example" className="min-w-0">
        <Enter
          play={enter}
          delay={ENTRANCE.tray}
          from={{ scale: 0.985 }}
          duration={0.6}
          willChange={entering}
          className="rounded-stage border border-line bg-canvas p-5 shadow-inset-md contrast-more:border-line-strong md:p-6 xl:p-8"
        >
          <div ref={tray} className="@container/tray">
            {/* Pause comes first, before anything that moves, for the keyboard and a phone. */}
            <div className="flex min-h-11 items-center justify-between gap-3">
              <TagChip tone="plain">Example</TagChip>
              {reduced ? null : (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setWantsPlay((w) => !w)}
                  aria-label={wantsPlay ? 'Pause animation' : 'Play animation'}
                  data-testid="hero-play"
                  className="size-11 px-0 md:h-9 md:w-auto md:px-3"
                >
                  <IconGlyph icon={wantsPlay ? Pause : Play} size={16} />
                  <span className="max-md:hidden">{wantsPlay ? 'Pause' : 'Play'}</span>
                </Button>
              )}
            </div>
            <p className="sr-only">{STORY.summary}</p>

            <div
              aria-hidden
              data-testid="hero-stage"
              data-beat={reduced ? 'final' : player.beat}
              className="@container relative mt-3 flex flex-col md:mt-4 md:block md:h-[468px] lg:h-[496px] xl:h-[480px]"
            >
              {/* Record card: full width on phones, the left 46% from md. */}
              <m.div style={{ ...recordLayer, willChange: will }} className="relative z-0 md:absolute md:top-0 md:left-0 md:w-[46%]">
                <Enter play={enter} delay={ENTRANCE.record} from={{ y: 16 }}>
                  <RecordCard s={s} />
                </Enter>
              </m.div>

              {/* Flipkart ghost: behind the Amazon card, offset 16/16 and a touch smaller. */}
              <m.div
                style={{ ...ghostLayer, willChange: will }}
                className="relative z-10 order-3 -mt-5 ml-12 md:absolute md:top-14 md:right-0 md:bottom-0 md:m-0 md:w-[calc(54%+24px)]"
              >
                <Enter
                  play={enter}
                  delay={ENTRANCE.ghost}
                  from={{ y: 8 }}
                  className="h-full md:origin-top-left md:translate-x-4 md:translate-y-4 md:scale-[0.96]"
                >
                  <FlipkartGhost />
                </Enter>
              </m.div>

              {/* Field chips, carried from the record into the Amazon listing. */}
              <m.div
                style={{ ...chipLayer, willChange: will }}
                className="pointer-events-none relative z-30 order-1 h-0 [--chip-dx:0px] [--chip-dy:44px] md:absolute md:top-[132px] md:left-[24%] md:[--chip-dx:24cqw] md:[--chip-dy:0px]"
              >
                {reduced || player.trip === 0 ? null : (
                  <div className="absolute -top-9 left-1/2 flex -translate-x-1/2 gap-2 md:top-0 md:left-0 md:translate-x-0 md:flex-col md:items-start">
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
              </m.div>

              {/* Amazon card: in front, overlapping the record card. */}
              <m.div
                style={{ ...amazonLayer, willChange: will }}
                className="relative z-20 order-2 -mt-6 ml-6 md:absolute md:top-14 md:right-0 md:m-0 md:w-[calc(54%+24px)]"
              >
                <Enter play={enter} delay={ENTRANCE.amazon} from={{ y: 24 }} duration={0.6}>
                  <AmazonCard s={s} />
                </Enter>
              </m.div>
            </div>

            <MarketplaceRail
              className="relative z-20 mt-5 md:mt-6"
              enter={enter}
              ring={reduced ? 0 : player.ring}
              ringDelay={player.ring === 1 ? 120 : 0}
            />
          </div>
        </Enter>
        <figcaption id="hero-stage-cap" className="mt-3 text-caption text-ink-2">
          {STORY.caption}
        </figcaption>
      </figure>
    </LazyMotion>
  )
}
