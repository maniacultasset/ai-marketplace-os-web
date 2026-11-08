/**
 * '/' signed out. Structure from the "Aisle" landing (hero with a validation finding, the pain, what
 * Kuinn does, the trust rules, one workflow, catalogs, marketplaces, pricing, one call to action),
 * styled with the Listing Agent hi-fi tokens and kit. No testimonials, logos of customers or
 * invented numbers. Every claim is a shipped feature; each marketplace's stage (live, coming soon,
 * roadmap) is the honest one from MARKET_STATUS. "Three" failed fixes is the backend's
 * `llm_max_correction_attempts`.
 *
 * Motion: the h1 never waits; the hero lines follow it 60ms apart and every other block rises in
 * once when it scrolls into view (use-reveal.ts). Reduced motion shows everything at once.
 */
import { Link } from '@tanstack/react-router'
import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react'
import { PublicLayout } from '@/components/app/public-layout'
import { SITE_SECTIONS } from '@/components/app/site-sections'
import { CONCEPT_ICON } from '@/components/la/concept-icons'
import { Icon, IconTile, type IconSource } from '@/components/la/icons'
import { MarketplaceTile } from '@/components/la/marketplace'
import { StatusChip } from '@/components/la/status-chip'
import { Button } from '@/components/ui/button'
import { useReveal } from '@/lib/use-reveal'
import { scrollToSection } from '@/lib/scroll-to-section'
import { cn } from '@/lib/utils'
import { Benefits } from './benefits'
import { HeroFinding } from './hero-finding'
import { HowItWorksDemo } from './how-it-works-demo'
import { MarketplaceStrip, MUTED_LOGO } from './marketplace-strip'
import { COMPANY } from './company'
import { MARKET_STATUS, STAGE_CHIP } from './model'
import { useDocumentTitle } from './use-document-title'

/** Not a sequence, so no numbers: each pain gets its own icon tile. */
const PAINS: readonly { icon: IconSource; title: string; body: string }[] = [
  {
    icon: CONCEPT_ICON.rulebook,
    title: 'A rulebook per marketplace',
    body: 'Each one has its own categories, required fields and limits. Your team keeps them all in their heads.',
  },
  {
    icon: CONCEPT_ICON.variants,
    title: 'One shirt, twelve rows',
    body: 'Four sizes in three colours make twelve SKUs. Each needs its own price and stock.',
  },
  {
    icon: CONCEPT_ICON.fit,
    title: 'Banned words slip through',
    body: 'Words like “best” hide easily in a long title, and each marketplace keeps its own list.',
  },
  {
    icon: CONCEPT_ICON.lateRejection,
    title: 'Fixes happen after the fact',
    body: 'You change one value, resubmit and wait to hear back.',
  },
]

/** The rules the agent works inside. Each one is enforced by the backend, not by the model. */
const TRUST: readonly { icon: IconSource; text: string }[] = [
  { icon: CONCEPT_ICON.approval, text: 'Every listing is approved by a person before it is sent.' },
  { icon: 'users', text: 'Whoever starts or edits a listing cannot approve it.' },
  { icon: CONCEPT_ICON.rules, text: 'Character limits, banned words and required fields cannot be overridden.' },
  { icon: CONCEPT_ICON.retry, text: 'After three failed fixes, the agent stops and shows you why.' },
  { icon: 'lock', text: 'Kuinn never asks for your marketplace password. Access tokens are encrypted and never reach the agent.' },
]

/** What changes at catalog scale. The demo above already walks the steps, so this never repeats them. */
const CATALOG_POINTS: readonly { title: string; body: string; icon: IconSource }[] = [
  { title: 'One CSV for the whole catalog', icon: CONCEPT_ICON.columns, body: 'Your columns become products and variants. Every product is then drafted in the background.' },
  { title: 'A report for every row', icon: CONCEPT_ICON.rules, body: 'Each row is checked for each marketplace, and every error sits beside its field.' },
  { title: 'Rerun only what failed', icon: CONCEPT_ICON.retry, body: 'Fix the rows with errors and run just those again. The rest keep moving.' },
]

const PRICING_INCLUDES = [
  'Listings drafted in your brand’s voice',
  'Rule checks on every field',
  'White-background main images',
  'CSV import for the whole catalog',
  'A full history of every draft and approval',
]

/** One page width for every block: 1200px, a little wider on very large screens. */
const WRAP = 'mx-auto w-full max-w-[1200px] px-4 sm:px-6 md:px-8 2xl:max-w-[1320px]'
const H2 = 'max-w-[24ch] font-display text-[clamp(1.875rem,2.2vw+1.1rem,3rem)] leading-[1.06] font-bold tracking-[-0.03em] text-ink'

function Section({ id, title, lede, children, className }: { id?: string; title: ReactNode; lede?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-h` : undefined} className={className}>
      <div className={cn(WRAP, 'py-20 md:py-28')}>
        <h2 data-reveal id={id ? `${id}-h` : undefined} className={H2}>
          {title}
        </h2>
        {lede ? (
          <p data-reveal className="mt-4 max-w-[62ch] text-[17px] leading-[1.6] text-ink-2 md:text-[18px]">
            {lede}
          </p>
        ) : null}
        <div className="mt-10 md:mt-14">{children}</div>
      </div>
    </section>
  )
}

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

export function Landing() {
  useDocumentTitle(null)
  const scope = useRef<HTMLDivElement>(null)
  useReveal(scope)
  useSectionSpy()
  return (
    <PublicLayout inPage>
      <div ref={scope}>
        {/* Hero */}
        <section aria-labelledby="hero-h" className="bg-canvas">
          <div
            className={cn(
              WRAP,
              'grid grid-cols-1 items-center gap-12 pt-12 pb-20 md:pt-20 md:pb-28 lg:grid-cols-[minmax(0,1.04fr)_minmax(0,0.96fr)] lg:gap-14 xl:gap-20',
            )}
          >
            <div className="min-w-0">
              <p className="text-small font-semibold text-brand">AI listing agent for Indian fashion brands</p>
              <h1
                id="hero-h"
                className="mt-4 max-w-[18ch] font-display text-[clamp(2.4rem,2.2vw+2.05rem,4.25rem)] leading-[1.02] font-bold tracking-[-0.03em] text-balance text-ink"
              >
                {/* One sentence per line, so a mid-width screen never strands a word ("voice.") on its own. */}
                <span className="block">Listings in your brand’s voice.</span> <span className="block">Checked before they go live.</span>
              </h1>
              <p data-reveal data-reveal-delay="60" className="mt-6 max-w-[48ch] text-[17px] leading-[1.6] text-ink-2 md:text-[18px]">
                Kuinn drafts the title, bullets and description for every product from your photos and product details. Each field is checked
                against the marketplace’s rules before your team sees it.
              </p>
              <div data-reveal data-reveal-delay="120" className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button asChild size="lg" className="w-full sm:w-auto">
                  <Link to="/signup" data-testid="landing-cta">
                    Request access
                  </Link>
                </Button>
                <Button asChild size="lg" variant="secondary" className="w-full sm:w-auto">
                  <a href="#how" onClick={glideTo('how')}>
                    See how it works
                  </a>
                </Button>
              </div>
              <p data-reveal data-reveal-delay="180" className="mt-7 flex items-start gap-2.5 text-[15px] leading-[1.5] font-semibold text-ink">
                <IconTile icon="shield" tone="ok" size="sm" className="mt-[calc((1lh-28px)/2)]" />
                Nothing goes to a marketplace until someone on your team approves it.
              </p>
              <div data-reveal data-reveal-delay="240" className="mt-8 max-w-[560px] border-t border-line pt-6">
                <MarketplaceStrip />
              </div>
            </div>
            <div data-reveal="pop" data-reveal-delay="120" className="min-w-0">
              <HeroFinding />
            </div>
          </div>
        </section>

        {/* The pain */}
        <Section
          className="bg-surface"
          title="Your team rewrites the same kurta set for every marketplace."
          lede={
            <>
              A title that fits Amazon’s 200 characters breaks Flipkart’s 150. A single “best” can get it rejected on both. The rejection names
              the field and leaves the fix to you.
            </>
          }
        >
          <ul className="grid border-t border-line md:grid-cols-2 md:gap-x-12">
            {PAINS.map((p) => (
              <li key={p.title} data-reveal className="grid grid-cols-[36px_minmax(0,1fr)] gap-x-4 border-b border-line py-7 md:py-8">
                <IconTile icon={p.icon} tone="neutral" size="md" className="mt-[calc((1lh-36px)/2)] leading-[22px]" />
                <div className="min-w-0">
                  <h3 className="text-h3 text-ink">{p.title}</h3>
                  <p className="mt-2 max-w-[52ch] text-[15px] leading-[1.6] text-ink-2">{p.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </Section>

        {/* What Kuinn does: live features only */}
        <Section id="benefits" title="What Kuinn does for your team" lede="Add a product once. Kuinn prepares the listing and your team signs off.">
          <Benefits />
        </Section>

        {/* Trust: fixed rules judge, a person approves */}
        <Section
          className="bg-surface"
          title="Fixed rules judge every draft. Your team approves it."
          lede="Checks run as code against each marketplace’s rules. A model never grades its own draft, and every listing waits for a person."
        >
          <ul className="grid gap-px overflow-hidden rounded-card border border-line bg-line shadow-raised-md md:grid-cols-2">
            {TRUST.map((t, i) => (
              <li
                key={t.text}
                data-reveal
                className={cn('flex items-start gap-4 bg-surface p-5 md:p-6', i === TRUST.length - 1 && 'md:col-span-2')}
              >
                <IconTile icon={t.icon} tone="brand" size="md" />
                <p className="max-w-[56ch] self-center text-[15px] leading-[1.55] font-medium text-ink">{t.text}</p>
              </li>
            ))}
          </ul>
        </Section>

        {/* How it works */}
        <Section id="how" title="From a CSV row to a live listing" lede="Follow one kurta set through the steps your whole catalog takes.">
          <div data-reveal>
            <HowItWorksDemo />
          </div>
        </Section>

        {/* Catalogs */}
        <Section
          id="catalogs"
          className="bg-surface"
          title="Your whole catalog takes the same path as one kurta set."
          lede="Upload the CSV you already keep. Each row moves through the same steps on its own."
        >
          <ul className="grid gap-px overflow-hidden rounded-card border border-line bg-line shadow-raised-md md:grid-cols-3">
            {CATALOG_POINTS.map((s) => (
              <li key={s.title} data-reveal className="flex flex-col gap-2 bg-surface p-5 md:p-6 lg:p-7">
                <IconTile icon={s.icon} tone="brand" size="md" className="mb-2" />
                <h3 className="text-h3 text-ink">{s.title}</h3>
                <p className="max-w-[44ch] text-[15px] leading-[1.55] text-ink-2">{s.body}</p>
              </li>
            ))}
          </ul>
        </Section>

        {/* Marketplaces */}
        <Section
          id="marketplaces"
          title="Live on Amazon. Flipkart is next."
          lede="Your products sit in one catalog inside Kuinn. Each new marketplace connects to that same catalog."
        >
          <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {MARKET_STATUS.map((m) => {
              const chip = STAGE_CHIP[m.stage]
              const live = m.stage === 'live'
              return (
                <li
                  key={m.name}
                  data-testid={`market-${m.stage}`}
                  data-reveal
                  className={cn(
                    'flex min-w-0 flex-col gap-3 rounded-card border p-5 md:p-6',
                    m.stage === 'roadmap' ? 'border-dashed border-line-strong bg-transparent md:col-span-2 lg:col-span-1' : 'border-line bg-surface shadow-raised-md',
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="flex gap-1.5">
                      {m.ids.map((id) => (
                        <MarketplaceTile key={id} id={id} unavailable={!live} className={cn(!live && MUTED_LOGO)} />
                      ))}
                    </span>
                    <StatusChip status={chip.status} glyph={chip.glyph}>
                      {chip.label}
                    </StatusChip>
                  </div>
                  <h3 className="text-h3 text-ink">{m.name}</h3>
                  <p className="max-w-[52ch] text-[15px] leading-[1.55] text-ink-2">{m.body}</p>
                </li>
              )
            })}
          </ul>
        </Section>

        {/* Pricing and contact: Amazon's developer website rules ask for pricing (or "quote based") and a direct contact. */}
        <Section
          id="pricing"
          className="bg-surface"
          title="Priced for your catalog"
          lede="Your quote depends on how many products you list and where you sell. Requesting access is free."
        >
          <div data-reveal className="grid overflow-hidden rounded-card border border-line bg-surface shadow-raised-md lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <div className="flex flex-col gap-6 p-6 sm:p-8 lg:p-10">
              <div className="flex items-center gap-3">
                <IconTile icon={CONCEPT_ICON.pricing} tone="brand" size="md" />
                <h3 className="font-display text-[clamp(1.5rem,1.2vw+1.1rem,2rem)] leading-[1.1] font-bold tracking-[-0.02em] text-ink">
                  Included for every brand
                </h3>
              </div>
              <ul className="flex flex-col gap-3 text-[15px] leading-[1.5] text-ink">
                {PRICING_INCLUDES.map((t) => (
                  <li key={t} className="flex items-start gap-2.5 text-pretty">
                    <Icon name="check" size={16} className="mt-[calc((1lh-16px)/2)] shrink-0 text-success" />
                    {t}
                  </li>
                ))}
              </ul>
              <div className="mt-auto flex flex-col gap-3 pt-2 sm:flex-row">
                <Button asChild size="lg" className="w-full sm:w-auto">
                  <a href={`mailto:${COMPANY.email}?subject=${encodeURIComponent('Kuinn pricing')}`}>Ask for a quote</a>
                </Button>
                <Button asChild size="lg" variant="secondary" className="w-full sm:w-auto">
                  <Link to="/signup">Request access</Link>
                </Button>
              </div>
            </div>
            <div id="contact" className="flex flex-col justify-center gap-6 border-t border-line bg-sunken p-6 sm:p-8 lg:border-t-0 lg:border-l lg:p-10">
              <div>
                <h3 className="text-h3 text-ink">Talk to us</h3>
                <p className="mt-1.5 text-small text-ink-2">Questions about Kuinn, your data or your account.</p>
              </div>
              <ul className="grid gap-5 text-[15px] sm:grid-cols-2 lg:grid-cols-1">
                {[
                  { icon: 'mail' as const, label: 'Email', value: COMPANY.email, href: `mailto:${COMPANY.email}` },
                  { icon: 'phone' as const, label: 'Phone', value: COMPANY.phone, href: COMPANY.phoneHref },
                ].map((c) => (
                  <li key={c.label} className="flex items-start gap-3">
                    <IconTile icon={c.icon} tone="neutral" size="sm" />
                    <div className="min-w-0">
                      <p className="text-caption font-semibold text-ink-3">{c.label}</p>
                      <a href={c.href} className="hit-area font-semibold break-words text-ink underline-offset-4 hover:text-brand hover:underline">
                        {c.value}
                      </a>
                    </div>
                  </li>
                ))}
                <li className="flex items-start gap-3">
                  <IconTile icon="pin" tone="neutral" size="sm" />
                  <div className="min-w-0">
                    <p className="text-caption font-semibold text-ink-3">Registered office</p>
                    <div className="text-ink">
                      <span className="block font-semibold whitespace-nowrap">{COMPANY.legalName}</span>
                      {COMPANY.addressLines.map((line) => (
                        <span key={line} className="block text-pretty text-ink-2">
                          {line}
                        </span>
                      ))}
                    </div>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </Section>

        {/* Final call to action */}
        <section aria-labelledby="cta-h">
          <div className={cn(WRAP, 'py-20 md:py-28')}>
            <div
              data-reveal
              className="flex flex-col gap-8 rounded-card border border-brand-line bg-brand-bg p-6 shadow-raised-md sm:p-8 md:p-12 lg:flex-row lg:items-center lg:justify-between"
            >
              <div className="flex max-w-[58ch] flex-col items-start gap-4">
                <IconTile icon="users" tone="brand" size="lg" />
                <div>
                  <h2 id="cta-h" className={H2}>
                    List your next collection on Amazon, in your own voice.
                  </h2>
                  <p className="mt-4 text-[17px] leading-[1.55] text-ink">
                    Set up your products once. When Flipkart and the next marketplaces go live, they connect to that same catalog.
                  </p>
                  <p className="mt-2 text-[15px] leading-[1.55] text-ink-2">
                    Our team reviews every request. Share your brand and work email to get started.
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row lg:shrink-0">
                <Button asChild size="lg" className="w-full sm:w-auto">
                  <Link to="/signup">Request access</Link>
                </Button>
                <Button asChild size="lg" variant="secondary" className="w-full sm:w-auto">
                  <Link to="/signup/status">Check a request</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </PublicLayout>
  )
}
