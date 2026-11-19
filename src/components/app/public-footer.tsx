/**
 * The public footer, after getpopcom.com, built for Kuinn. On the page's deepest ground ("floor"):
 *  1. "We've got you." with the accent underline, a line of help and a contact button. A product
 *     photo card with its Live listing chip breaks over the footer's top edge, the way Popcom's model
 *     steps out of its band (from lg; it would crowd a phone).
 *  2. A floating glass bar: the wordmark, the page's sections and "Request access".
 *  3. The tagline and direct contact, then Product, Company and Legal links.
 *  4. One giant "Kuinn" wordmark, cut by the bottom edge, with the copyright and registered office.
 * Company name, direct contact and the app's name stay on every public page, as Amazon's developer
 * website rules ask.
 */
import { Link } from '@tanstack/react-router'
import { ArrowUpRight, Mail, MapPin, Phone } from 'lucide-react'
import { IconGlyph, LogoMark } from '@/components/la/icons'
import { MarketplaceTile } from '@/components/la/marketplace'
import { Button } from '@/components/ui/button'
import { COMPANY, COMPANY_ADDRESS } from '@/features/public/company'
import { FOOTER } from '@/features/public/landing-content'

const YEAR = new Date().getFullYear()
const WRAP = 'mx-auto w-full max-w-[1200px] px-4 sm:px-6 md:px-8 2xl:max-w-[1320px]'
const link = 'hit-area inline-flex items-center rounded-control text-[15px] text-night-ink-2 transition-colors hover:text-white'

const COLUMNS: readonly { title: string; links: readonly { label: string; to: string; hash?: string; href?: string }[] }[] = [
  {
    title: 'Product',
    links: [
      { label: 'How it works', to: '/', hash: 'how' },
      { label: 'Marketplaces', to: '/', hash: 'marketplaces' },
      { label: 'Why Kuinn', to: '/', hash: 'why' },
      { label: 'Pricing', to: '/', hash: 'pricing' },
      { label: 'FAQ', to: '/', hash: 'faq' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'Contact us', to: '', href: `mailto:${COMPANY.email}` },
      { label: 'Request access', to: '/signup' },
      { label: 'Check a request', to: '/signup/status' },
      { label: 'Sign in', to: '/login' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy policy', to: '/privacy' },
      { label: 'Terms of service', to: '/terms' },
    ],
  },
]

export function PublicFooter() {
  return (
    <footer className="relative overflow-hidden bg-floor text-night-ink lg:overflow-visible">
      {/* 1. Contact */}
      <div className={`${WRAP} relative grid gap-10 pt-20 pb-14 md:pt-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]`}>
        <div className="flex flex-col items-start">
          <p className="font-display text-[clamp(2.5rem,3vw+1.5rem,4rem)] leading-none font-bold tracking-[-0.04em] text-white">{FOOTER.contactTitle}</p>
          <span aria-hidden className="mt-4 h-1 w-20 rounded-full bg-brand-on-night" />
          <p className="mt-6 max-w-[44ch] text-[17px] leading-[1.6] text-night-ink-2">{FOOTER.contactBody}</p>
          <Button asChild size="lg" variant="secondary" className="mt-8 border-white/25 bg-transparent text-white shadow-none hover:bg-white/10">
            <a href={`mailto:${COMPANY.email}`}>
              Contact us
              <IconGlyph icon={ArrowUpRight} size={16} />
            </a>
          </Button>
        </div>
        {/* The product card stepping out of the band (lg and up). */}
        <div aria-hidden className="relative max-lg:hidden">
          <div className="absolute right-6 -top-36 w-[280px] rotate-[3deg] rounded-[22px] border border-white/10 bg-surface p-2.5 shadow-[0_40px_80px_-20px_rgb(0_0_0/0.6)] xl:right-16">
            <img src="/landing/kurta-set-420.webp" srcSet="/landing/kurta-set-420.webp 1x, /landing/kurta-set-840.webp 2x" alt="" width={280} height={373} loading="lazy" decoding="async" className="aspect-[3/4] w-full rounded-[14px] bg-photo object-cover" />
            <div className="absolute inset-x-5 bottom-5 flex items-center gap-2.5 rounded-xl bg-surface/95 p-2.5 shadow-raised-md backdrop-blur">
              <MarketplaceTile id="amazon" size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-small font-semibold text-ink">Indigo floral kurta set</span>
                <span className="text-caption font-semibold text-success">Live on Amazon</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Floating bar */}
      <div className={WRAP}>
        <nav
          aria-label="Footer sections"
          className="flex flex-col gap-4 rounded-[22px] border border-white/10 bg-white/[0.06] p-3 backdrop-blur-xl sm:flex-row sm:items-center sm:pl-6"
        >
          <Link to="/" aria-label="Kuinn home" className="inline-flex items-center gap-2.5 font-display text-[18px] font-bold text-white">
            <LogoMark />
            Kuinn
          </Link>
          <div className="flex flex-wrap gap-x-6 gap-y-1 sm:ml-auto">
            {COLUMNS[0]!.links.slice(0, 3).map((l) => (
              <Link key={l.label} to={l.to} hash={l.hash} className={link}>
                {l.label}
              </Link>
            ))}
          </div>
          <Button asChild size="lg" className="shadow-none sm:ml-2">
            <Link to="/signup">Request access</Link>
          </Button>
        </nav>
      </div>

      {/* 3. Tagline, contact, links */}
      <div className={`${WRAP} grid gap-12 pt-16 pb-12 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)]`}>
        <div className="flex max-w-[46ch] flex-col gap-6">
          <p className="text-[16px] leading-[1.65] text-night-ink-2">{FOOTER.tagline}</p>
          <ul className="flex flex-col gap-2.5 text-[15px]">
            <li>
              <a href={`mailto:${COMPANY.email}`} className={`${link} gap-2.5`}>
                <IconGlyph icon={Mail} size={16} className="text-brand-on-night" />
                {COMPANY.email}
              </a>
            </li>
            <li>
              <a href={COMPANY.phoneHref} className={`${link} gap-2.5`}>
                <IconGlyph icon={Phone} size={16} className="text-brand-on-night" />
                {COMPANY.phone}
              </a>
            </li>
          </ul>
        </div>
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="font-display text-[18px] font-bold tracking-[-0.01em] text-white">{col.title}</p>
              <ul className="mt-4 flex flex-col gap-1.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    {l.href ? (
                      <a href={l.href} className={link}>
                        {l.label}
                      </a>
                    ) : (
                      <Link to={l.to} hash={l.hash} className={link}>
                        {l.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* 4. Wordmark and the fine print */}
      <div className={`${WRAP} grid items-end gap-6 overflow-hidden border-t border-white/10 pt-10 lg:grid-cols-[minmax(0,1fr)_auto]`}>
        <p aria-hidden className="footer-wordmark -mb-[0.12em] -ml-[0.04em]">
          Kuinn
        </p>
        <div className="flex flex-col gap-2 pb-10 text-small text-night-ink-2 lg:max-w-[300px] lg:pb-14">
          <p>
            © {YEAR} {COMPANY.legalName}. All rights reserved.
          </p>
          <address className="flex gap-2 not-italic">
            <IconGlyph icon={MapPin} size={14} className="mt-0.5 shrink-0" />
            {COMPANY_ADDRESS}
          </address>
        </div>
      </div>
    </footer>
  )
}
