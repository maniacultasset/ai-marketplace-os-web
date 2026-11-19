/**
 * The solution (brief section 4): the heading and body, then the seven-step slider the brief asks
 * for ("every card is a slide, and the slides move"). One product, the maroon block print shirt, goes from
 * its photo to a live Amazon listing, one card per step.
 *
 * Interaction: a native horizontal scroll-snap rail, so touch and trackpads swipe as they expect;
 * a mouse can drag it; step tabs and arrows jump to a card. While the section is on screen the
 * slider advances on its own every DWELL_MS, with a progress bar in the active tab; it pauses on
 * hover, focus or any manual move, and never auto-advances with reduced motion.
 */
import { ArrowLeft, ArrowRight, BadgeCheck, Check, FileSpreadsheet, ImageIcon, ShieldCheck, Sparkles, Wand2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react'
import { IconGlyph } from '@/components/la/icons'
import { MarketplaceTile } from '@/components/la/marketplace'
import { StatusChip } from '@/components/la/status-chip'
import { usePrefersReducedMotion } from '@/lib/use-media-query'
import { cn } from '@/lib/utils'
import { SHIRT, SOLUTION, SOLUTION_STEPS, type SolutionStepId } from './landing-content'
import { Accent, SectionHeading, SECTION_Y, WRAP } from './landing-kit'

const DWELL_MS = 5200
const REDUCE = '(prefers-reduced-motion: reduce)'

export function SolutionSection() {
  const rail = useRef<HTMLDivElement>(null)
  const section = useRef<HTMLElement>(null)
  const [active, setActive] = useState(0)
  const [inView, setInView] = useState(false)
  const [paused, setPaused] = useState(false)
  const reduced = usePrefersReducedMotion()
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null)

  useEffect(() => {
    const el = section.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setInView(!!e?.isIntersecting), { threshold: 0.35 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const goTo = useCallback((i: number, smooth = true) => {
    const r = rail.current
    const card = r?.children[i] as HTMLElement | undefined
    if (!r || !card) return
    const first = r.firstElementChild as HTMLElement
    const max = r.scrollWidth - r.clientWidth
    const smoothOk = smooth && !(typeof window.matchMedia === 'function' && window.matchMedia(REDUCE).matches)
    r.scrollTo({ left: Math.min(card.offsetLeft - first.offsetLeft, max), behavior: smoothOk ? 'smooth' : 'auto' })
    setActive(i)
  }, [])

  // The card nearest the rail's start edge is the active one.
  const onScroll = () => {
    const r = rail.current
    if (!r) return
    const cards = [...r.children] as HTMLElement[]
    const start = r.scrollLeft
    let best = 0
    let bestD = Infinity
    cards.forEach((c, i) => {
      const d = Math.abs(c.offsetLeft - cards[0]!.offsetLeft - start)
      if (d < bestD) {
        bestD = d
        best = i
      }
    })
    // At the far end the last cards cannot reach the start edge: treat the end as the last card.
    if (start >= r.scrollWidth - r.clientWidth - 4 && active >= best) return
    if (best !== active) setActive(best)
  }

  const next = () => goTo((active + 1) % SOLUTION_STEPS.length)
  const prev = () => goTo((active - 1 + SOLUTION_STEPS.length) % SOLUTION_STEPS.length)
  const auto = inView && !paused && !reduced

  // Mouse drag; touch and pen keep native scrolling.
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || !rail.current) return
    drag.current = { x: e.clientX, left: rail.current.scrollLeft, moved: false }
    setPaused(true)
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || !rail.current) return
    const dx = e.clientX - d.x
    if (Math.abs(dx) > 4) d.moved = true
    rail.current.style.scrollSnapType = 'none'
    rail.current.scrollLeft = d.left - dx
  }
  const endDrag = () => {
    const r = rail.current
    if (!drag.current || !r) return
    drag.current = null
    r.style.scrollSnapType = ''
    onScroll()
  }

  return (
    <section ref={section} id="solution" aria-labelledby="solution-h" className="relative overflow-hidden">
      <div className={cn(WRAP, SECTION_Y)}>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <SectionHeading
            id="solution"
            eyebrow={SOLUTION.eyebrow}
            title={SOLUTION.title}
            lede={
              <>
                {SOLUTION.body}
                <span className="mt-4 block font-semibold text-ink">
                  <Accent>{SOLUTION.kicker}</Accent>
                </span>
              </>
            }
            titleClassName="max-w-[22ch]"
          />
          <div data-reveal className="flex items-center gap-3 max-lg:hidden">
            <span className="font-mono text-small text-ink-3 tabular-nums" aria-live="polite">
              {String(active + 1).padStart(2, '0')} / {String(SOLUTION_STEPS.length).padStart(2, '0')}
            </span>
            <RoundButton label="Previous step" onClick={() => (setPaused(true), prev())}>
              <IconGlyph icon={ArrowLeft} size={18} />
            </RoundButton>
            <RoundButton label="Next step" onClick={() => (setPaused(true), next())}>
              <IconGlyph icon={ArrowRight} size={18} />
            </RoundButton>
          </div>
        </div>

        {/* Step tabs: the active one carries the dwell bar while the slider plays. */}
        <div data-reveal role="tablist" aria-label="Steps" className="snap-rail mt-12 -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0 lg:flex-wrap lg:overflow-visible">
          {SOLUTION_STEPS.map((s, i) => {
            const on = i === active
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={on}
                aria-controls={`step-${s.id}`}
                onClick={() => (setPaused(true), goTo(i))}
                className={cn(
                  'tactile relative shrink-0 overflow-hidden rounded-pill border px-3.5 py-2 text-small font-semibold whitespace-nowrap',
                  on ? 'border-brand-line bg-brand-bg text-brand-ink' : 'border-line bg-surface text-ink-2 hover:text-ink',
                )}
              >
                <span className="mr-1.5 font-mono text-caption tabular-nums opacity-70">{String(i + 1).padStart(2, '0')}</span>
                {s.short}
                {on ? (
                  <span
                    aria-hidden
                    key={`${active}-${auto}`}
                    className="dwell-bar absolute inset-x-0 bottom-0 h-0.5 bg-brand"
                    data-running={auto || undefined}
                    style={{ '--dwell': `${DWELL_MS}ms` } as CSSProperties}
                    onAnimationEnd={next}
                  />
                ) : null}
              </button>
            )
          })}
        </div>
      </div>

      {/* The rail runs to the right edge of the screen, starting on the page's left edge. */}
      <div
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => (setPaused(false), endDrag())}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={() => setPaused(false)}
        className="-mt-12 pb-12 md:-mt-16 md:pb-16 lg:-mt-20"
      >
        <div
          ref={rail}
          onScroll={onScroll}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onClickCapture={(e) => {
            if (drag.current?.moved) e.preventDefault()
          }}
          className="snap-rail flex cursor-grab gap-5 overflow-x-auto scroll-px-[max(1rem,calc((100vw-1200px)/2+2rem))] px-[max(1rem,calc((100vw-1200px)/2+2rem))] pb-6 select-none [mask-image:linear-gradient(90deg,transparent,#000_4%,#000_96%,transparent)] active:cursor-grabbing md:gap-6"
          aria-label="How Kuinn turns one product into a live listing"
        >
          {SOLUTION_STEPS.map((s, i) => (
            <article
              key={s.id}
              id={`step-${s.id}`}
              role="tabpanel"
              aria-label={`${i + 1} of ${SOLUTION_STEPS.length}: ${s.label}`}
              data-active={i === active || undefined}
              className={cn(
                'group relative flex w-[min(84vw,340px)] shrink-0 flex-col rounded-stage border bg-surface p-5 transition-[transform,box-shadow,border-color] duration-500 ease-[var(--ease-out-calm)] md:w-[360px]',
                i === active ? 'border-brand-line shadow-raised-lg' : 'border-line shadow-card',
              )}
            >
              <header className="flex items-center gap-2.5">
                <span className={cn('grid size-7 place-items-center rounded-full font-mono text-caption font-bold tabular-nums', i === active ? 'bg-brand text-white' : 'bg-sunken text-ink-3')}>
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <h3 className="text-[16px] leading-5 font-bold text-ink">{s.label}</h3>
                  <p className="text-small text-ink-3">{s.caption}</p>
                </div>
              </header>
              <div className="mt-4 flex-1">
                <StepVisual id={s.id} active={i === active} />
              </div>
              {i < SOLUTION_STEPS.length - 1 ? (
                <span aria-hidden className="absolute top-1/2 -right-[19px] z-10 grid size-7 -translate-y-1/2 place-items-center rounded-full border border-line bg-surface text-brand shadow-raised-sm md:-right-[22px]">
                  <IconGlyph icon={ArrowRight} size={14} />
                </span>
              ) : null}
            </article>
          ))}
        </div>
        <div className={cn(WRAP, 'flex items-center justify-center gap-3 lg:hidden')}>
          <RoundButton label="Previous step" onClick={() => (setPaused(true), prev())}>
            <IconGlyph icon={ArrowLeft} size={18} />
          </RoundButton>
          <span className="font-mono text-small text-ink-3 tabular-nums">
            {String(active + 1).padStart(2, '0')} / {String(SOLUTION_STEPS.length).padStart(2, '0')}
          </span>
          <RoundButton label="Next step" onClick={() => (setPaused(true), next())}>
            <IconGlyph icon={ArrowRight} size={18} />
          </RoundButton>
        </div>
      </div>
    </section>
  )
}

function RoundButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="tactile press grid size-11 place-items-center rounded-full border border-line bg-surface text-ink shadow-raised-sm hover:border-edge-hover"
    >
      {children}
    </button>
  )
}

const titleLength = [...SHIRT.title].length

function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex items-center gap-2.5 rounded-tile border border-line bg-sunken/60 px-3 py-2.5 text-small text-ink', className)}>{children}</div>
}

function Tick() {
  return (
    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-success-bg text-success">
      <IconGlyph icon={Check} size={12} />
    </span>
  )
}

/** Each step's small product UI. Marketing illustration of the real screens, never live data. */
function StepVisual({ id, active }: { id: SolutionStepId; active: boolean }) {
  switch (id) {
    case 'input':
      return (
        <div className="flex flex-col gap-3">
          <div className="relative overflow-hidden rounded-tile border border-line bg-photo">
            <img src={SHIRT.photo} srcSet={`${SHIRT.photo} 420w, ${SHIRT.photo2x} 840w`} sizes="320px" alt={SHIRT.name} loading="lazy" decoding="async" draggable={false} className="aspect-[4/3] w-full object-cover object-[30%_24%]" />
            <span className="absolute top-2 left-2 inline-flex items-center gap-1.5 rounded-pill bg-surface/90 px-2 py-1 text-caption font-semibold text-ink shadow-raised-sm">
              <IconGlyph icon={ImageIcon} size={12} /> 4 photos
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {['30%_16%', '33%_38%', '28%_74%'].map((pos) => (
              <img key={pos} src={SHIRT.photo} alt="" loading="lazy" decoding="async" draggable={false} style={{ objectPosition: pos.replace('_', ' ') }} className="aspect-square w-full rounded-lg border border-line bg-photo object-cover" />
            ))}
          </div>
          <Row>
            <IconGlyph icon={FileSpreadsheet} size={16} className="text-success" />
            <span className="truncate">catalog.csv · row 14 · SKU BP-MRN-M</span>
          </Row>
        </div>
      )
    case 'agent':
      return (
        <div className="flex h-full flex-col gap-2 rounded-tile border border-brand-line/70 bg-brand-bg/40 p-3">
          <p className="flex items-center gap-2 text-small font-bold text-brand-ink">
            <IconGlyph icon={Sparkles} size={16} /> Kuinn is working
          </p>
          {['Understand the product', 'Classify the category', 'Extract attributes', 'Write in your brand’s voice', 'Validate marketplace rules'].map((t, i) => (
            <div key={t} className="flex items-center gap-2.5 rounded-lg bg-surface px-3 py-2 text-small text-ink shadow-raised-sm" style={{ transitionDelay: active ? `${i * 120}ms` : '0ms' }}>
              <Tick />
              {t}
            </div>
          ))}
        </div>
      )
    case 'attributes':
      return (
        <div className="grid grid-cols-2 gap-2">
          {SHIRT.attributes.map((a) => (
            <div key={a.label} className="rounded-tile border border-line bg-surface p-2.5 shadow-raised-sm">
              <p className="text-caption text-ink-3">{a.label}</p>
              <p className="text-small font-bold text-ink">{a.value}</p>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-sunken">
                <div className="h-full rounded-full bg-brand transition-[width] duration-700 ease-[var(--ease-out-calm)]" style={{ width: active ? `${a.confidence}%` : '12%' }} />
              </div>
              <p className="mt-1 font-mono text-[11px] text-ink-3 tabular-nums">{a.confidence}% sure</p>
            </div>
          ))}
          <p className="col-span-2 mt-1 text-caption text-ink-3">You confirm each one before it is used.</p>
        </div>
      )
    case 'listing':
      return (
        <div className="flex flex-col gap-3 text-small">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-caption font-semibold text-ink-3">Title</span>
              <span className="rounded-pill bg-success-bg px-2 py-0.5 font-mono text-[11px] font-semibold text-success tabular-nums">
                {titleLength}/200
              </span>
            </div>
            <p className="mt-1 rounded-tile border border-line bg-sunken/60 p-2.5 leading-5 text-ink">{SHIRT.title}</p>
          </div>
          <div>
            <span className="text-caption font-semibold text-ink-3">Bullet points</span>
            <ul className="mt-1 flex flex-col gap-1 text-ink-2">
              {SHIRT.bullets.map((b) => (
                <li key={b} className="flex gap-2">
                  <span className="mt-2 size-1 shrink-0 rounded-full bg-ink-3" />
                  {b}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SHIRT.keywords.map((k) => (
              <span key={k} className="rounded-pill border border-brand-line bg-brand-bg px-2 py-0.5 text-caption font-medium text-brand-ink">
                {k}
              </span>
            ))}
          </div>
        </div>
      )
    case 'rules':
      return (
        <div className="flex flex-col gap-2">
          {['Title within 200 characters', 'No banned words', 'Required fields filled', 'Size chart attached', 'Main image on white'].map((t) => (
            <Row key={t}>
              <Tick />
              {t}
            </Row>
          ))}
          <div className="mt-1 flex items-start gap-2.5 rounded-tile border border-success-line bg-success-tint p-3 text-small">
            <IconGlyph icon={Wand2} size={16} className="mt-0.5 text-success" />
            <span>
              <span className="block font-bold text-success-ink">Fixed for you</span>
              <span className="text-ink-2">Removed “Best” from the title</span>
            </span>
          </div>
        </div>
      )
    case 'approval':
      return (
        <div className="flex h-full flex-col gap-3">
          <div className="rounded-tile border border-line bg-surface p-3 shadow-raised-sm">
            <div className="flex items-center gap-2.5">
              <span className="grid size-8 place-items-center rounded-full bg-brand-bg font-bold text-brand">A</span>
              <span className="text-small">
                <span className="block font-semibold text-ink">Arjun edited the listing</span>
                <span className="text-ink-3">Catalog team</span>
              </span>
            </div>
            <div className="ml-4 h-4 border-l border-dashed border-line-strong" />
            <div className="flex items-center gap-2.5">
              <span className="grid size-8 place-items-center rounded-full bg-success-bg font-bold text-success">M</span>
              <span className="text-small">
                <span className="block font-semibold text-ink">Meera approved it</span>
                <span className="text-ink-3">Brand owner</span>
              </span>
              <IconGlyph icon={BadgeCheck} size={20} className="ml-auto text-success" />
            </div>
          </div>
          <div className="flex items-start gap-2.5 rounded-tile border border-brand-line/70 bg-brand-bg/50 p-3 text-small text-brand-ink">
            <IconGlyph icon={ShieldCheck} size={16} className="mt-0.5" />
            Whoever edits a listing cannot approve it. Nothing goes live without a person’s yes.
          </div>
        </div>
      )
    case 'live':
      return (
        <div className="flex flex-col gap-3">
          <div className="overflow-hidden rounded-tile border border-line bg-surface shadow-raised-sm">
            <div className="flex items-center justify-between border-b border-line px-3 py-2">
              <span className="flex items-center gap-2 text-small font-semibold text-ink">
                <MarketplaceTile id="amazon" size="xs" /> Amazon
              </span>
              <StatusChip status="live" />
            </div>
            <div className="flex gap-3 p-3">
              <img src={SHIRT.photo} alt="" loading="lazy" decoding="async" draggable={false} className="h-24 w-[72px] shrink-0 rounded-lg bg-photo object-cover" />
              <div className="min-w-0 text-small">
                <p className="line-clamp-2 font-semibold text-ink">{SHIRT.title}</p>
                <p className="mt-1.5">
                  <span className="text-[17px] font-bold text-ink">₹{SHIRT.price}</span>{' '}
                  <span className="text-caption text-ink-3 line-through">₹{SHIRT.mrp}</span>
                </p>
                <span className="mt-2 inline-block rounded-md bg-[#ffd814] px-2.5 py-1 text-caption font-semibold text-[#0f1111]">Add to cart</span>
              </div>
            </div>
          </div>
          <Row className="justify-between">
            <span className="flex items-center gap-2">
              <MarketplaceTile id="flipkart" size="xs" /> Flipkart
            </span>
            <span className="text-caption font-semibold text-ink-3">Next</span>
          </Row>
        </div>
      )
  }
}
