/**
 * '/' signed out. Structure from the "Aisle" landing (hero with a validation finding, four
 * problems, one workflow, AI proposes / rules decide, bulk band, supported marketplaces, one call
 * to action), styled with the Listing Agent hi-fi tokens and kit. No testimonials, no invented
 * numbers; marketplace status is the honest one from the handover.
 */
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { PublicLayout } from '@/components/app/public-layout'
import { Icon, IconTile } from '@/components/la/icons'
import { MarketplaceTile } from '@/components/la/marketplace'
import { StatusChip, TagChip } from '@/components/la/status-chip'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { HeroFinding } from './hero-finding'
import { MARKET_STATUS, STAGE_CHIP } from './model'
import { useDocumentTitle } from './use-document-title'

const PROBLEMS = [
  {
    title: 'Every marketplace has its own rulebook',
    body: 'Amazon and Flipkart use different category trees, required attributes and limits. For a kurta set the title can run to 200 characters on Amazon and 150 on Flipkart.',
    cost: 'Your team keeps two rulebooks in their heads and still guesses at the edges.',
  },
  {
    title: 'One title rarely fits both',
    body: 'A title that passes on Amazon can be too long for Flipkart. A word like “best” is a promotional claim that both refuse.',
    cost: 'So the same product gets written twice, by hand, from the same facts.',
  },
  {
    title: 'Variants multiply the rows',
    body: 'A shirt in four sizes and three colours is twelve SKUs, and each one needs its own price, stock and measurements.',
    cost: 'A modest catalog turns into a sheet far longer than anyone planned for.',
  },
  {
    title: 'Rejections arrive late and explain little',
    body: 'The marketplace error names a field, not the fix. You change one value, resubmit and wait again.',
    cost: 'One listing, several round trips, and the hours vanish between them.',
  },
] as const

const FLOW = [
  { icon: 'upload', title: 'Import', body: 'Upload a CSV or add one product at a time. Each row becomes one clean product with its variants.' },
  {
    icon: 'spark',
    title: 'Generate',
    body: 'The agent will draft the title, bullets, description and attributes in your brand’s voice.',
    inDevelopment: true,
  },
  { icon: 'shield', title: 'Validate', body: 'A rules engine written as code checks every field against each marketplace’s limits. No model decides pass or fail.' },
  { icon: 'check', title: 'Approve', body: 'A person reviews the draft beside its field-level results. Whoever edited a listing cannot approve it.' },
  { icon: 'store', title: 'Publish', body: 'Approved listings go to the marketplace. A listing shows as Live only after the marketplace confirms it.' },
] as const

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

const BULK = [
  { title: 'Upload', body: 'Your catalog as a CSV file.' },
  { title: 'Map', body: 'Columns become products and variants.' },
  { title: 'Generate', body: 'Drafts for every product in the background, once the agent is ready.', inDevelopment: true },
  { title: 'Validate', body: 'Field-level results per row and per marketplace.' },
  { title: 'Review', body: 'Approve row by row with the error beside the field.' },
  { title: 'Retry', body: 'Rerun only the rows that failed. The rest stay as they are.' },
] as const

function Section({ id, title, lede, children, className }: { id?: string; title: ReactNode; lede?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-h` : undefined} className={cn('scroll-mt-20 border-t border-line', className)}>
      <div className="reveal mx-auto max-w-[1200px] px-4 py-16 md:px-8 md:py-24">
        <h2
          id={id ? `${id}-h` : undefined}
          className="max-w-[26ch] font-display text-[clamp(1.75rem,3.2vw,2.5rem)] leading-[1.08] font-bold tracking-[-0.022em] text-ink"
        >
          {title}
        </h2>
        {lede ? <p className="mt-4 max-w-[60ch] text-[17px] leading-[1.6] text-ink-2">{lede}</p> : null}
        <div className="mt-10 md:mt-12">{children}</div>
      </div>
    </section>
  )
}

const navLink = 'tactile rounded-control px-2 py-2 hover:bg-hover hover:text-ink'

export function Landing() {
  useDocumentTitle(null)
  return (
    <PublicLayout
      links={
        <>
          <a href="#how" className={navLink}>
            How it works
          </a>
          <a href="#bulk" className={navLink}>
            Bulk
          </a>
          <a href="#marketplaces" className={navLink}>
            Marketplaces
          </a>
        </>
      }
    >
      {/* Hero */}
      <section aria-labelledby="hero-h" className="bg-canvas">
        <div className="mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-12 px-4 pt-14 pb-16 md:px-8 md:pt-20 md:pb-24 lg:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)] lg:gap-16">
          <div className="animate-page-in">
            <h1
              id="hero-h"
              className="max-w-[16ch] font-display text-[clamp(2.4rem,5vw,3.75rem)] leading-[1.02] font-bold tracking-[-0.028em] text-ink"
            >
              Two marketplaces. Two rulebooks. One catalog.
            </h1>
            <p className="mt-6 max-w-[46ch] text-[18px] leading-[1.55] text-ink-2">
              Listing Agent checks every field of your Amazon and Flipkart listings against each marketplace’s rules and waits
              for someone on your team to approve before anything is sent. Drafting in your brand’s voice is in development.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/signup" data-testid="landing-cta">
                  Request access
                </Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <a href="#how">See how it works</a>
              </Button>
            </div>
            <ul className="mt-8 flex flex-wrap gap-2" aria-label="At a glance">
              {['Every request reviewed by a person', 'Amazon and Flipkart', 'Nothing is sent without approval'].map((t) => (
                <li key={t}>
                  <TagChip>{t}</TagChip>
                </li>
              ))}
            </ul>
          </div>
          <div className="materialize min-w-0">
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
        <ol className="divide-y divide-line border-y border-line">
          {PROBLEMS.map((p, i) => (
            <li key={p.title} className="grid gap-3 py-7 md:grid-cols-[56px_minmax(0,1.3fr)_minmax(0,1fr)] md:gap-8">
              <span className="font-display text-h2 font-semibold text-ink-3 tabular-nums" aria-hidden>
                {String(i + 1).padStart(2, '0')}
              </span>
              <div>
                <h3 className="text-h3 text-ink">{p.title}</h3>
                <p className="mt-2 text-[15px] leading-[1.55] text-ink-2">{p.body}</p>
              </div>
              <p className="border-l-2 border-attention-line pl-4 text-[15px] leading-[1.55] font-medium text-ink">{p.cost}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* Workflow */}
      <Section id="how" title="One workflow, from spreadsheet to listing" lede="The same five steps run for one product or a whole catalog.">
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {FLOW.map((s, i) => (
            <li
              key={s.title}
              className={cn(
                'flex flex-col gap-3 rounded-card border bg-surface p-5 md:p-6',
                s.title === 'Approve' ? 'border-brand shadow-[var(--selected-ring),var(--shadow-raised-md)]' : 'border-line shadow-raised-md',
              )}
            >
              <span className="flex items-center justify-between">
                <IconTile icon={s.icon} tone="brand" />
                <span className="text-caption font-bold text-ink-2">Step {i + 1}</span>
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-h3 text-ink">{s.title}</h3>
                {'inDevelopment' in s ? <TagChip tone="plain">In development</TagChip> : null}
              </div>
              <p className="text-body text-ink-2">{s.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* AI proposes, rules decide */}
      <Section
        title="AI proposes. The rules engine decides."
        lede="Writing is a job for a model. Checking is not. Your seller account depends on keeping those two jobs apart, so they are never done by the same thing. The drafting agent is still in development; the rules and the approval step it will answer to come first."
        className="bg-surface"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-card border border-line bg-canvas p-6 shadow-inset-sm md:p-7">
            <div className="flex flex-wrap items-center gap-3">
              <IconTile icon="spark" tone="brand" />
              <h3 className="text-h3 text-ink">What the agent will do</h3>
              <TagChip tone="plain" className="ml-auto">
                In development
              </TagChip>
            </div>
            <ul className="mt-4 flex flex-col gap-3">
              {AGENT_DOES.map((t) => (
                <li key={t} className="flex gap-3 text-[15px] leading-[1.5] text-ink">
                  <Icon name="check" size={16} className="mt-[3px] shrink-0 text-success" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-card border border-line bg-canvas p-6 shadow-inset-sm md:p-7">
            <div className="flex items-center gap-3">
              <IconTile icon="shield" tone="brand" />
              <h3 className="text-h3 text-ink">What the agent never does</h3>
            </div>
            <ul className="mt-4 flex flex-col gap-3">
              {AGENT_NEVER.map((t) => (
                <li key={t} className="flex gap-3 text-[15px] leading-[1.5] text-ink">
                  <Icon name="x" size={16} className="mt-[3px] shrink-0 text-danger" />
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
            <li key={s.title} className="flex flex-col gap-1.5 bg-surface p-5">
              <span className="font-display text-caption font-bold text-brand tabular-nums">{String(i + 1).padStart(2, '0')}</span>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-h3 text-ink">{s.title}</h3>
                {'inDevelopment' in s ? <TagChip tone="plain">In development</TagChip> : null}
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
          {MARKET_STATUS.map((m) => {
            const chip = STAGE_CHIP[m.stage]
            return (
              <li
                key={m.name}
                data-testid={`market-${m.stage}`}
                className={cn(
                  'flex flex-col gap-3 rounded-card border p-5',
                  m.stage === 'later' ? 'border-dashed border-line-strong bg-transparent' : 'border-line bg-surface shadow-raised-md',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="flex -space-x-1.5">
                    {m.ids.map((id) => (
                      <MarketplaceTile key={id} id={id} className={cn('ring-2 ring-surface', m.stage === 'later' && 'shadow-none')} />
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

      {/* Final CTA */}
      <section aria-labelledby="cta-h" className="border-t border-line">
        <div className="reveal mx-auto max-w-[1200px] px-4 py-16 md:px-8 md:py-24">
          <div className="flex flex-col gap-6 rounded-card border border-brand-line bg-brand-bg p-6 shadow-raised-md md:flex-row md:items-center md:justify-between md:p-10">
            <div className="flex max-w-[60ch] flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
              <IconTile icon="users" tone="brand" size="lg" />
              <div>
                <h2 id="cta-h" className="font-display text-[clamp(1.6rem,2.8vw,2.2rem)] leading-[1.1] font-bold tracking-[-0.02em] text-ink">
                  Access is reviewed by a person
                </h2>
                <p className="mt-3 text-[15px] leading-[1.55] text-ink-2">
                  Tell us your brand, your name and the email you will sign in with. Someone on our team reviews each request,
                  and you can check where yours stands at any time.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
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
    </PublicLayout>
  )
}
