/**
 * '/': the landing page, in the order of the Kuinn Landing Page Implementation Brief (Nov 2026) and
 * the founder's voice note: hero with three numbers, the problem, the trusted-by band, the solution
 * slider, one workflow for every marketplace (moved up, as asked), why Kuinn, the product demo, who
 * it is for, capabilities, FAQ and the final call to action. The hero's two actions come back between
 * sections, each time with the difference that matters most: Kuinn does not stop at content, it gets
 * the listing live and fixes the errors on the way.
 *
 * Copy lives in landing-content.ts; the brand theme in src/brand/theme.ts and src/styles/landing.css.
 * Honesty rules stay: every number is counted from the product, every marketplace shows its real
 * stage, and nothing is named as a customer without being one.
 *
 * Motion: the h1 never waits; the hero lines follow it (60, 130, 200ms) and the hero stage plays its
 * own entrance and loop (hero-stage.tsx). Below the hero every section uses the one reveal pattern
 * (use-reveal.ts). Reduced motion shows everything at once and stops every loop.
 */
import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useEffect, useRef, type CSSProperties, type MouseEvent } from 'react'
import { PublicLayout } from '@/components/app/public-layout'
import { SITE_SECTIONS } from '@/components/app/site-sections'
import { CountUp } from '@/components/la/count-up'
import { IconGlyph } from '@/components/la/icons'
import { marketplaceInfo, MarketplaceTile } from '@/components/la/marketplace'
import { Button } from '@/components/ui/button'
import { useSession } from '@/lib/auth'
import { scrollToSection } from '@/lib/scroll-to-section'
import { useReveal } from '@/lib/use-reveal'
import { cn } from '@/lib/utils'
import { FinalCta } from './final-cta'
import { HeroRise } from './hero-rise'
import { PRODUCTS } from './hero-story'
import { HeroTheatre } from './hero-theatre'
import { AudienceSection } from './landing-audience'
import { CapabilitiesSection } from './landing-capabilities'
import { HERO, HERO_STATS } from './landing-content'
import { CtaStrip } from './landing-cta-strip'
import { DemoSection } from './landing-demo'
import { FaqSection } from './landing-faq'
import { WRAP } from './landing-kit'
import { ProblemSection } from './landing-problem'
import { SolutionSection } from './landing-solution'
import { TrustedBand } from './landing-trusted'
import { WhySection } from './landing-why'
import { WorkflowSection } from './landing-workflow'
import { useDocumentTitle } from './use-document-title'

/** Marks the header link for the section in the middle band of the viewport as current. */
function useSectionSpy() {
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const sections = SITE_SECTIONS.map((s) => document.getElementById(s.id)).filter((el): el is HTMLElement => el !== null)
    const mark = (id: string | null) => {
      for (const a of document.querySelectorAll<HTMLAnchorElement>('a[data-section-link]')) {
        if (a.dataset.sectionLink === id) a.setAttribute('aria-current', 'true')
        else a.removeAttribute('aria-current')
      }
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) mark(e.target.id)
          else if (document.querySelector(`a[data-section-link="${e.target.id}"][aria-current]`)) mark(null)
        }
      },
      { rootMargin: '-40% 0px -55% 0px' },
    )
    for (const el of sections) io.observe(el)
    return () => {
      io.disconnect()
      mark(null)
    }
  }, [])
}

/** An in-page link that glides to its section (see scroll-to-section.ts). */
const glideTo = (id: string) => (e: MouseEvent<HTMLAnchorElement>) => {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
  e.preventDefault()
  scrollToSection(id)
}

/**
 * The products-to-marketplace chip set inside the headline (after Cosmos): the hero's three real
 * product photos flowing into Amazon. Decorative; the h1 reads as plain text.
 */
function HeadlineChip() {
  return (
    <span
      aria-hidden
      className="headline-chip relative mx-[0.1em] inline-flex h-[0.7em] -translate-y-[0.06em] items-center gap-[0.12em] rounded-full border border-line bg-surface py-[0.06em] pr-[0.08em] pl-[0.08em] align-middle shadow-raised-md"
    >
      <span className="flex">
        {PRODUCTS.map((p, i) => (
          <img
            key={p.id}
            src={`/landing/slip-${p.file}-96.webp`}
            alt=""
            width={48}
            height={64}
            decoding="async"
            style={{ '--i': i } as CSSProperties}
            className={cn('chip-photo size-[0.54em] rounded-full border-[0.03em] border-surface bg-photo object-cover object-top', i > 0 && '-ml-[0.17em]')}
          />
        ))}
      </span>
      <IconGlyph icon={ArrowRight} size={18} className="size-[0.24em] text-ink-3" />
      <span className="relative">
        <img src={marketplaceInfo('amazon').logo} alt="" width={64} height={64} decoding="async" className="size-[0.54em] rounded-full border border-line bg-surface p-[0.06em]" />
        <span className="chip-live absolute -top-[0.02em] -right-[0.02em] size-[0.14em] rounded-full border-[0.025em] border-surface bg-success" />
      </span>
    </span>
  )
}

function Hero() {
  const signedIn = useSession().status === 'authenticated'
  const [lead, accent] = splitAccent(HERO.title, 'end to end.')
  const [before, after] = splitAccent(lead, 'marketplace listing operations, ')
  return (
    <section aria-labelledby="hero-h" className="paper relative overflow-hidden bg-canvas">
      <div className={cn(WRAP, 'relative pt-6 md:pt-10')}>
        {/* Masthead: one hairline, two quiet labels, like the top of a printed page. */}
        <div className="flex items-center justify-between gap-4 border-b border-ink/15 pb-3 text-[11.5px] font-semibold tracking-[0.14em] text-ink-2 uppercase">
          <span>{HERO.eyebrow}</span>
          <a href="#marketplaces" onClick={glideTo('marketplaces')} className="hit-area flex items-center gap-2 hover:text-ink max-sm:hidden">
            <span className="size-1.5 rounded-full bg-success" />
            Live on Amazon.in · Flipkart next
          </a>
        </div>

        <div className="grid xl:grid-cols-12 xl:gap-10">
        <div className="xl:col-span-9">
        <h1
          id="hero-h"
          className="pt-12 font-display text-[clamp(2.75rem,6vw+0.2rem,6.4rem)] leading-[0.94] font-medium tracking-[-0.048em] text-balance text-ink md:pt-14 lg:pt-16"
        >
          {before}
          <HeadlineChip />
          {after}
          <span className="text-brand">{accent}</span>
        </h1>

        <HeroRise delay={60}>
          <p className="mt-8 max-w-[56ch] text-[17px] leading-[1.6] text-ink-2 md:mt-10 md:text-[18.5px]">{HERO.body}</p>
        </HeroRise>
        <HeroRise delay={130} className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg" className="h-12 rounded-full px-6 text-[15px] shadow-none">
            <Link to={signedIn ? '/home' : '/signup'} data-testid="landing-cta">
              {signedIn ? 'Open dashboard' : 'Request access'}
              <IconGlyph icon={ArrowRight} size={16} />
            </Link>
          </Button>
          <Button asChild size="lg" variant="ghost" className="h-12 rounded-full border border-ink/20 px-6 text-[15px] text-ink hover:border-ink/40 hover:bg-transparent">
            <a href="#how" onClick={glideTo('how')}>
              See how it works
            </a>
          </Button>
        </HeroRise>
        </div>

        {/* The cover figure (xl and up): one product photo set into the page like a magazine inset. */}
        <figure aria-hidden className="cover-figure mt-16 self-end max-xl:hidden xl:col-span-3">
          <div className="relative overflow-hidden rounded-[18px] border border-line bg-photo shadow-[0_24px_60px_-24px_rgb(27_34_56/0.35)]">
            <img src="/landing/tee-420.webp" srcSet="/landing/tee-420.webp 1x, /landing/tee-840.webp 2x" alt="" width={420} height={560} decoding="async" className="aspect-[3/4] w-full object-cover" />
            <span className="absolute inset-x-2.5 bottom-2.5 flex items-center gap-2 rounded-xl bg-surface/95 px-2.5 py-2 shadow-raised-sm backdrop-blur">
              <MarketplaceTile id="amazon" size="xs" />
              <span className="min-w-0 flex-1 text-[11px] leading-[1.3]">
                <span className="block font-semibold text-ink">Oversized cotton tee</span>
                <span className="block font-semibold text-success">Live · 6 sizes</span>
              </span>
            </span>
          </div>
          <figcaption className="mt-3 text-[11.5px] leading-[1.45] text-ink-3">
            <span className="font-mono text-ink-2">Fig. 01</span> Photographed once. Read, written, checked and live on Amazon, end to end.
          </figcaption>
        </figure>
        </div>

        {/* Ledger: the brief's three numbers and today's marketplaces, on hairlines (after Ramp's strip). */}
        <HeroRise delay={200}>
          <p className="sr-only">{HERO.live}</p>
          <dl className="mt-14 grid grid-cols-2 border-y border-ink/15 md:mt-20 lg:grid-cols-4">
            {HERO_STATS.map((s, i) => (
              <div key={s.label} className={cn('flex flex-col py-5 pr-4 md:py-6', i > 0 && 'lg:border-l lg:border-ink/15 lg:pl-6', i === 1 && 'max-lg:border-l max-lg:border-ink/15 max-lg:pl-4', i === 2 && 'max-lg:border-t max-lg:border-ink/15')}>
                <dt className="order-2 mt-2 max-w-[24ch] text-[13px] leading-[1.4] text-ink-2">{s.label}</dt>
                <dd className="order-1 font-display text-[clamp(2rem,1.6vw+1.2rem,2.75rem)] leading-none font-medium tracking-[-0.04em] text-ink tabular-nums">
                  <CountUp value={s.value} duration={1300} />
                </dd>
              </div>
            ))}
            <div className="flex flex-col justify-center gap-2.5 py-5 pl-4 max-lg:border-t max-lg:border-l max-lg:border-ink/15 md:py-6 lg:border-l lg:border-ink/15 lg:pl-6">
              {(['amazon', 'flipkart'] as const).map((id) => (
                <span key={id} className="flex items-center gap-2.5 text-[13px] text-ink-2">
                  <MarketplaceTile id={id} size="xs" unavailable={id !== 'amazon'} />
                  <span className="font-semibold text-ink">{marketplaceInfo(id).name}</span>
                  <span className={cn('ml-auto text-[12px] font-semibold', id === 'amazon' ? 'text-success' : 'text-ink-3')}>{id === 'amazon' ? 'Live' : 'Next'}</span>
                </span>
              ))}
            </div>
          </dl>
        </HeroRise>
      </div>

      <div className={cn(WRAP, 'relative mt-12 pb-20 md:mt-16 md:pb-28')}>
        <HeroRise delay={280}>
          <HeroTheatre />
        </HeroRise>
        <p className="mt-5 text-center text-small text-ink-3">
          <span className="font-semibold text-ink-2">{HERO.live}</span> Myntra, AJIO, Meesho and Nykaa Fashion are on the roadmap.
        </p>
      </div>
    </section>
  )
}

/** Splits a headline at its accent phrase (kept at the end, so it can carry the underline). */
function splitAccent(text: string, accent: string): [string, string] {
  const at = text.lastIndexOf(accent)
  return at < 0 ? [text, ''] : [text.slice(0, at), accent]
}

export function Landing() {
  useDocumentTitle(null)
  const scope = useRef<HTMLDivElement>(null)
  useReveal(scope)
  useSectionSpy()
  return (
    <PublicLayout inPage>
      <div ref={scope}>
        <Hero />
        <ProblemSection />
        <TrustedBand />
        <SolutionSection />
        <CtaStrip line="afterSolution" />
        <WorkflowSection />
        <WhySection />
        <CtaStrip line="afterWhy" night />
        <DemoSection />
        <AudienceSection />
        <CapabilitiesSection />
        <CtaStrip line="afterCapabilities" className="bg-surface" />
        <FaqSection />
        <FinalCta />
      </div>
    </PublicLayout>
  )
}
