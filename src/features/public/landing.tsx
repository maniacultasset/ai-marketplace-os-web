/**
 * '/' signed out. Structure from the "Aisle" landing (hero with a validation finding, four
 * problems, one workflow, AI proposes / rules decide, bulk band, supported marketplaces, one call
 * to action), styled with the Listing Agent hi-fi tokens and kit. No testimonials, no invented
 * numbers; marketplace status is the honest one from the handover.
 */
import { Link } from '@tanstack/react-router'
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { PublicLayout } from '@/components/app/public-layout'
import { CONCEPT_ICON } from '@/components/la/concept-icons'
import { Icon, IconTile, type IconSource } from '@/components/la/icons'
import { MarketplaceTile } from '@/components/la/marketplace'
import { StatusChip, TagChip } from '@/components/la/status-chip'
import { Button } from '@/components/ui/button'
import { useReveal } from '@/lib/use-reveal'
import { cn } from '@/lib/utils'
import { HeroFinding } from './hero-finding'
import { HowItWorksDemo } from './how-it-works-demo'
import { COMPANY } from './company'
import { MARKET_STATUS, STAGE_CHIP } from './model'
import { useDocumentTitle } from './use-document-title'

const PROBLEMS: readonly { icon: IconSource; title: string; body: string; cost: string }[] = [
  {
    icon: CONCEPT_ICON.rulebook,
    title: 'Every marketplace has its own rulebook',
    body: 'Amazon and Flipkart use different category trees, required attributes and limits. For a kurta set the title can run to 200 characters on Amazon and 150 on Flipkart.',
    cost: 'Your team keeps two rulebooks in their heads and still guesses at the edges.',
  },
  {
    icon: CONCEPT_ICON.fit,
    title: 'One title rarely fits both',
    body: 'A title that passes on Amazon can be too long for Flipkart. A word like “best” is a promotional claim that both refuse.',
    cost: 'So the same product gets written twice, by hand, from the same facts.',
  },
  {
    icon: CONCEPT_ICON.variants,
    title: 'Variants multiply the rows',
    body: 'A shirt in four sizes and three colours is twelve SKUs, and each one needs its own price, stock and measurements.',
    cost: 'A modest catalog turns into a sheet far longer than anyone planned for.',
  },
  {
    icon: CONCEPT_ICON.lateRejection,
    title: 'Rejections arrive late and explain little',
    body: 'The marketplace error names a field, not the fix. You change one value, resubmit and wait again.',
    cost: 'One listing, several round trips, and the hours vanish between them.',
  },
]

/** The drafting agent is not built yet (analysis §gaps 1: only a deterministic stub), so this is its brief. */
const AGENT_DOES = [
  'Draft the title, bullets, description and keywords',
  'Propose attributes that match the category’s template',
  'Write with the tone, glossary and banned terms in your brand profile',
  'Fix only the fields a rule flagged, using the rule’s message as its instruction',
]

const AGENT_NEVER = [
  'Decides whether its own draft ships',
  'Overrides a character limit, a banned term or a required attribute',
  'Sends anything to a marketplace without a person’s approval on record',
  'Retries forever. After three correction attempts it stops and shows you why',
  'Sees your marketplace passwords or access tokens',
]

/** A real sequence, so the steps keep their numbers; the icons match the workflow strip above. */
const BULK: readonly { title: string; body: string; icon: IconSource; inDevelopment?: true }[] = [
  { title: 'Upload', icon: 'upload', body: 'Your catalog as a CSV file.' },
  { title: 'Map', icon: CONCEPT_ICON.columns, body: 'Columns become products and variants.' },
  { title: 'Generate', icon: CONCEPT_ICON.agent, body: 'Drafts for every product in the background, once the agent is ready.', inDevelopment: true },
  { title: 'Validate', icon: CONCEPT_ICON.rules, body: 'Field-level results per row and per marketplace.' },
  { title: 'Review', icon: CONCEPT_ICON.review, body: 'Approve row by row with the error beside the field.' },
  { title: 'Retry', icon: CONCEPT_ICON.retry, body: 'Rerun only the rows that failed. The rest stay as they are.' },
]

function Section({ id, title, lede, children, className }: { id?: string; title: ReactNode; lede?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-h` : undefined} className={cn('max-md:scroll-mt-12', className)}>
      <div className="mx-auto max-w-[1200px] px-4 py-20 md:px-8 md:py-28">
        <h2
          data-reveal
          id={id ? `${id}-h` : undefined}
          className="max-w-[26ch] font-display text-[clamp(1.875rem,3.4vw,2.75rem)] leading-[1.05] font-bold tracking-[-0.03em] text-ink"
        >
          {title}
        </h2>
        {lede ? <p data-reveal style={d(1)} className="mt-4 max-w-[60ch] text-[18px] leading-[1.6] text-ink-2">{lede}</p> : null}
        <div className="mt-10 md:mt-14">{children}</div>
      </div>
    </section>
  )
}

/** Stagger delay for the n-th sibling inside a reveal. */
const d = (n: number, step = 70): CSSProperties => ({ '--d': `${n * step}ms` }) as CSSProperties

const navLink = 'tactile press rounded-control px-2 py-2 hover:bg-hover hover:text-ink aria-[current=true]:bg-hover aria-[current=true]:text-ink'
const navLinkCompact = cn(navLink, 'inline-flex h-10 shrink-0 items-center px-3')

const SECTIONS = [
  { id: 'how', label: 'How it works' },
  { id: 'bulk', label: 'Bulk' },
  { id: 'marketplaces', label: 'Marketplaces' },
  { id: 'pricing', label: 'Pricing' },
] as const

/** Marks the in-page link for the section in the middle band of the viewport as current. */
function useSectionSpy() {
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const sections = SECTIONS.map((s) => document.getElementById(s.id)).filter((el): el is HTMLElement => el !== null)
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

export function Landing() {
  useDocumentTitle(null)
  const scope = useRef<HTMLDivElement>(null)
  useReveal(scope)
  useSectionSpy()
  return (
    <PublicLayout
      links={SECTIONS.map((s) => (
        <a key={s.id} href={`#${s.id}`} data-section-link={s.id} className={navLink}>
          {s.label}
        </a>
      ))}
      compactLinks={SECTIONS.map((s) => (
        <a key={s.id} href={`#${s.id}`} data-section-link={s.id} className={navLinkCompact}>
          {s.label}
        </a>
      ))}
    >
      <div ref={scope}>
        {/* Hero */}
        <section aria-labelledby="hero-h" className="bg-canvas">
          <div className="mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-12 px-4 pt-14 pb-16 md:px-8 md:pt-20 md:pb-24 lg:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)] lg:gap-16">
            <div>
              <h1
                id="hero-h"
                className="max-w-[16ch] font-display text-[clamp(2.4rem,5vw,3.75rem)] leading-[1.02] font-bold tracking-[-0.028em] text-ink"
              >
                Two marketplaces. Two rulebooks. One catalog.
              </h1>
              <p data-reveal style={d(1, 90)} className="mt-6 max-w-[46ch] text-[18px] leading-[1.55] text-ink-2">
                Kuinn checks every field of your Amazon and Flipkart listings against each marketplace’s rules and waits
                for someone on your team to approve before anything is sent. Drafting in your brand’s voice is in development.
              </p>
              <div data-reveal style={d(2, 90)} className="mt-8 flex flex-wrap items-center gap-3 sm:gap-4">
                <Button asChild size="lg">
                  <Link to="/signup" data-testid="landing-cta">
                    Request access
                  </Link>
                </Button>
                <Button asChild size="lg" variant="secondary">
                  <a href="#how">See how it works</a>
                </Button>
              </div>
              <ul
                data-reveal
                style={d(3, 90)}
                className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-small font-medium text-ink-2"
                aria-label="At a glance"
              >
                {['Every request reviewed by a person', 'Amazon and Flipkart', 'Nothing is sent without approval'].map((t) => (
                  <li key={t} className="flex items-center gap-1.5">
                    <Icon name="check" size={14} className="text-success" aria-hidden />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div data-reveal="pop" style={d(2, 90)} className="min-w-0">
              <HeroFinding />
            </div>
          </div>
        </section>

        {/* Four problems */}
        <Section
          title="Listing a catalog by hand costs more than anyone measures"
          lede="Four things that eat operator time on every SKU."
          className="bg-surface"
        >
          {/* Not a sequence, so no numbers: each problem gets its own icon tile. */}
          <ul className="divide-y divide-line border-y border-line">
            {PROBLEMS.map((p, i) => (
              <li
                key={p.title}
                data-reveal
                style={d(i)}
                className="grid grid-cols-[36px_minmax(0,1fr)] gap-x-4 gap-y-3 py-8 lg:grid-cols-[36px_minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-x-8"
              >
                <IconTile icon={p.icon} tone="neutral" size="md" className="mt-[calc((1lh-36px)/2)] leading-[22px]" />
                <div className="min-w-0">
                  <h3 className="text-h3 text-ink">{p.title}</h3>
                  <p className="mt-2 text-[15px] leading-[1.55] text-ink-2">{p.body}</p>
                </div>
                <p className="col-start-2 border-l border-line pl-5 text-[15px] leading-[1.55] font-medium text-ink max-sm:border-t max-sm:border-l-0 max-sm:pt-3 max-sm:pl-0 lg:col-start-3">
                  {p.cost}
                </p>
              </li>
            ))}
          </ul>
        </Section>

        {/* Workflow */}
        <Section id="how" title="One workflow, from spreadsheet to listing" lede="The same steps run for one product or a whole catalog. Here is one example listing, from a CSV row to Live.">
          <div data-reveal="pop">
            <HowItWorksDemo />
          </div>
        </Section>

        {/* AI proposes, rules decide */}
        <Section
          title={<>AI proposes.<br /> The rules engine decides.</>}
          lede="Writing is a job for a model. Checking is not. Your seller account depends on keeping those two jobs apart, so they are never done by the same thing. The drafting agent is still in development; the rules and the approval step it will answer to come first."
          className="bg-surface"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div data-reveal className="rounded-card border border-line bg-surface p-6 shadow-raised-md md:p-7">
              <div className="flex items-center gap-3">
                <IconTile icon="spark" tone="brand" />
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                  <h3 className="text-h3 text-ink">What the agent will do</h3>
                  <TagChip tone="plain" className="whitespace-nowrap sm:ml-auto">
                    In development
                  </TagChip>
                </div>
              </div>
              <ul className="mt-4 flex flex-col gap-3">
                {AGENT_DOES.map((t) => (
                  <li key={t} className="flex gap-3 text-[15px] leading-[1.5] text-ink">
                    <Icon name="check" size={16} className="mt-[calc((1lh-16px)/2)] text-success" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div data-reveal style={d(1, 110)} className="rounded-card border border-line bg-surface p-6 shadow-raised-md md:p-7">
              <div className="flex items-center gap-3">
                <IconTile icon="shield" tone="brand" />
                <h3 className="text-h3 text-ink">What the agent never does</h3>
              </div>
              <ul className="mt-4 flex flex-col gap-3">
                {AGENT_NEVER.map((t) => (
                  <li key={t} className="flex gap-3 text-[15px] leading-[1.5] text-ink">
                    <Icon name="x" size={16} className="mt-[calc((1lh-16px)/2)] text-danger" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Section>

        {/* Bulk */}
        <Section
          id="bulk"
          title="A whole catalog runs the same way as one product"
          lede="Upload your catalog as a CSV. Every row is checked on its own and keeps its own error report, so a bad row never holds up the good ones and a retry never makes you rebuild context."
        >
          <ol className="grid gap-px overflow-hidden rounded-card border border-line bg-line shadow-raised-md sm:grid-cols-2 lg:grid-cols-6">
            {BULK.map((s, i) => (
              <li key={s.title} data-reveal style={d(i, 90)} className="flex flex-col gap-1.5 bg-surface p-5">
                <div className="mb-1.5 flex items-center gap-2.5">
                  <IconTile icon={s.icon} tone={s.icon === CONCEPT_ICON.agent ? 'brand' : 'neutral'} size="sm" />
                  <span className="text-caption text-ink-3 tabular-nums">
                    <span className="sr-only">Step </span>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                </div>
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <h3 className="text-h3 text-ink">{s.title}</h3>
                  {s.inDevelopment ? <TagChip tone="plain" className="whitespace-nowrap">In development</TagChip> : null}
                </div>
                <p className="text-small text-ink-2">{s.body}</p>
              </li>
            ))}
          </ol>
        </Section>

        {/* Marketplaces */}
        <Section
          id="marketplaces"
          title="Supported marketplaces"
          lede="Two marketplaces built properly behind one set of rules and one approval step. Here is where each one stands today."
          className="bg-surface"
        >
          <ul className="grid gap-4 md:grid-cols-3">
            {MARKET_STATUS.map((m, i) => {
              const chip = STAGE_CHIP[m.stage]
              return (
                <li
                  key={m.name}
                  data-testid={`market-${m.stage}`}
                  data-reveal
                  style={d(i, 90)}
                  className={cn(
                    'flex flex-col gap-3 rounded-card border p-5',
                    m.stage === 'later' ? 'border-dashed border-line-strong bg-transparent' : 'border-line bg-surface shadow-raised-md',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex -space-x-1.5">
                      {m.ids.map((id) => (
                        <MarketplaceTile key={id} id={id} className="ring-2 ring-surface" />
                      ))}
                    </span>
                    <StatusChip status={chip.status}>{chip.label}</StatusChip>
                  </div>
                  <h3 className="text-h3 text-ink">{m.name}</h3>
                  <p className="text-small text-ink-2">{m.body}</p>
                </li>
              )
            })}
          </ul>
        </Section>

        {/* Pricing and contact: Amazon's developer website rules ask for pricing (or "quote based") and a direct contact. */}
        <Section
          id="pricing"
          title="Pricing and contact"
          lede="Every brand’s catalog is different, so we price each one on its own."
        >
          <div
            data-reveal="pop"
            className="grid overflow-hidden rounded-card border border-line bg-surface shadow-raised-md md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]"
          >
            <div className="flex flex-col gap-5 p-6 md:p-10">
              <div className="flex items-center gap-3">
                <IconTile icon={CONCEPT_ICON.pricing} tone="brand" size="md" />
                <h3 className="font-display text-[clamp(1.5rem,2.4vw,2rem)] leading-[1.1] font-bold tracking-[-0.02em] text-ink">
                  Quoted per brand
                </h3>
              </div>
              <p className="max-w-[48ch] text-[15px] leading-[1.6] text-ink-2">
                Your price depends on how many products you list and on which marketplaces. Tell us about your catalog and we
                will send you a quote. You pay nothing to request access.
              </p>
              <ul className="flex flex-col gap-2.5 text-[15px] text-ink" aria-label="Every plan includes">
                {[
                  'Rule checks on every field, for Amazon and Flipkart',
                  'Approval by your team before anything is sent',
                  'CSV import for the whole catalog',
                  'A full history of every draft and approval',
                ].map((t) => (
                  <li key={t} className="flex items-start gap-2.5">
                    <Icon name="check" size={16} className="mt-[calc((1lh-16px)/2)] text-success" />
                    {t}
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <a href={`mailto:${COMPANY.email}?subject=${encodeURIComponent('Kuinn pricing')}`}>Ask for a quote</a>
                </Button>
                <Button asChild size="lg" variant="secondary">
                  <Link to="/signup">Request access</Link>
                </Button>
              </div>
            </div>
            <div id="contact" className="flex flex-col gap-6 border-t border-line bg-sunken p-6 md:border-t-0 md:border-l md:p-10">
              <div>
                <h3 className="text-h3 text-ink">Talk to us</h3>
                <p className="mt-1.5 text-small text-ink-2">Questions about Kuinn, your data or your account.</p>
              </div>
              <ul className="flex flex-col gap-5 text-[15px]">
                {[
                  { icon: 'mail' as const, label: 'Email', value: COMPANY.email, href: `mailto:${COMPANY.email}` },
                  { icon: 'phone' as const, label: 'Phone', value: COMPANY.phone, href: COMPANY.phoneHref },
                ].map((c) => (
                  <li key={c.label} className="flex items-start gap-3">
                    <IconTile icon={c.icon} tone="neutral" size="sm" />
                    <div className="min-w-0">
                      <p className="text-caption font-semibold text-ink-3">{c.label}</p>
                      <div>
                        <a href={c.href} className="font-semibold break-words text-ink underline-offset-4 hover:text-brand hover:underline">
                          {c.value}
                        </a>
                      </div>
                    </div>
                  </li>
                ))}
                <li className="flex items-start gap-3">
                  <IconTile icon="pin" tone="neutral" size="sm" />
                  <div className="min-w-0">
                    <p className="text-caption font-semibold text-ink-3">Registered office</p>
                    <div className="text-ink">
                      <span className="block font-semibold">{COMPANY.legalName}</span>
                      {COMPANY.addressLines.map((line) => (
                        <span key={line} className="block text-ink-2">
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

        {/* Final CTA */}
        <section aria-labelledby="cta-h">
          <div className="mx-auto max-w-[1200px] px-4 py-20 md:px-8 md:py-28">
            <div data-reveal="pop" className="flex flex-col gap-6 rounded-card border border-brand-line bg-brand-bg p-6 shadow-raised-md md:flex-row md:items-center md:justify-between md:p-12">
              <div className="flex max-w-[60ch] flex-col items-start gap-4">
                <IconTile icon="users" tone="brand" size="lg" />
                <div>
                  <h2 id="cta-h" className="font-display text-[clamp(1.875rem,3.4vw,2.75rem)] leading-[1.05] font-bold tracking-[-0.03em] text-ink">
                    Access is reviewed by a person
                  </h2>
                  <p className="mt-3 text-[15px] leading-[1.55] text-ink-2">
                    Tell us your brand, your name and the email you will sign in with. Someone on our team reviews each request,
                    and you can check where yours stands at any time.
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap md:shrink-0">
                <Button asChild size="lg">
                  <Link to="/signup">Request access</Link>
                </Button>
                <Button asChild size="lg" variant="secondary">
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
