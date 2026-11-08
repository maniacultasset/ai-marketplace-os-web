/**
 * Public frame for the landing page and the legal pages: translucent sticky header (mark, the site
 * sections, "Sign in", one primary "Request access"), canvas body, plain footer. Sign-up is a request
 * a person reviews (ADR-0019), so the primary call to action is "Request access", never "Sign up".
 *
 * The header is one 64px row at every width. The sections sit inline from lg; below lg they move into
 * a menu sheet with "Sign in", so a phone keeps the wordmark, "Request access" and the menu button.
 * On the landing page (`inPage`) the section links glide to their section; on other pages they lead
 * back to the landing page at that section.
 */
import { Link } from '@tanstack/react-router'
import { useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { IconGlyph, Wordmark } from '@/components/la/icons'
import { Button } from '@/components/ui/button'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { useScrolled } from '@/lib/use-scrolled'
import { scrollToSection } from '@/lib/scroll-to-section'
import { SITE_SECTIONS, type SiteSectionId } from './site-sections'
import { COMPANY, COMPANY_ADDRESS } from '@/features/public/company'
import { cn } from '@/lib/utils'


const navLink =
  'tactile press inline-flex min-h-10 items-center rounded-control px-3 whitespace-nowrap hover:bg-hover hover:text-ink aria-[current=true]:bg-hover aria-[current=true]:text-ink'
const sheetLink =
  'tactile press flex min-h-12 items-center rounded-control px-3 text-[17px] font-semibold text-ink hover:bg-hover active:bg-pressed aria-[current=true]:bg-hover'

function SectionLink({ id, label, inPage, className, onNavigate }: { id: SiteSectionId; label: string; inPage: boolean; className: string; onNavigate?: () => void }) {
  if (!inPage) {
    return (
      <Link to="/" hash={id} className={className} onClick={onNavigate}>
        {label}
      </Link>
    )
  }
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    if (onNavigate) {
      // Let the sheet close (and hand focus back) first, then glide to the section.
      onNavigate()
      window.setTimeout(() => scrollToSection(id), 0)
    } else scrollToSection(id)
  }
  return (
    <a href={`#${id}`} data-section-link={id} className={className} onClick={onClick}>
      {label}
    </a>
  )
}

export function PublicHeader({ inPage = false }: { inPage?: boolean }) {
  const scrolled = useScrolled()
  const [open, setOpen] = useState(false)
  // A section picked from the sheet moves focus to that section, so the trigger must not take it back.
  const navigated = useRef(false)
  const close = () => {
    navigated.current = true
    setOpen(false)
  }
  return (
    <header data-scrolled={scrolled || undefined} className="material-bar sticky top-0 z-30">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-2 px-4 sm:gap-3 md:px-8 lg:gap-6 2xl:max-w-[1320px]">
        <Link to="/" aria-label="Kuinn home" className="inline-flex min-h-11 shrink-0 items-center rounded-control">
          <Wordmark size="lg" />
        </Link>
        <nav aria-label="Site" className="hidden items-center gap-1 text-body font-medium text-ink-2 lg:flex">
          {SITE_SECTIONS.map((s) => (
            <SectionLink key={s.id} id={s.id} label={s.label} inPage={inPage} className={navLink} />
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <Button asChild variant="ghost" className="max-sm:hidden [@media(pointer:coarse)]:min-h-11">
            <Link to="/login">Sign in</Link>
          </Button>
          <Button asChild className="max-sm:px-3.5 [@media(pointer:coarse)]:min-h-11">
            <Link to="/signup">Request access</Link>
          </Button>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="size-11 lg:hidden" aria-label="Open menu" data-testid="public-menu">
                <IconGlyph icon="menu" size={20} />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="top"
              showCloseButton={false}
              className="gap-0 rounded-b-card bg-surface px-4 pt-2.5 pb-6"
              onCloseAutoFocus={(e) => {
                if (navigated.current) e.preventDefault()
                navigated.current = false
              }}
            >
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <SheetDescription className="sr-only">Sections of this site, and sign in.</SheetDescription>
              <div className="flex h-11 items-center justify-between">
                <Wordmark size="lg" />
                <SheetClose asChild>
                  <Button variant="ghost" size="icon" className="size-11" aria-label="Close menu">
                    <IconGlyph icon="x" size={20} />
                  </Button>
                </SheetClose>
              </div>
              <nav aria-label="Site" className="mt-4 flex flex-col gap-1">
                {SITE_SECTIONS.map((s) => (
                  <SectionLink key={s.id} id={s.id} label={s.label} inPage={inPage} className={sheetLink} onNavigate={close} />
                ))}
              </nav>
              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4">
                <Button asChild variant="secondary" size="lg">
                  <Link to="/login" onClick={() => setOpen(false)}>
                    Sign in
                  </Link>
                </Button>
                <Button asChild size="lg">
                  <Link to="/signup" onClick={() => setOpen(false)}>
                    Request access
                  </Link>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}

const YEAR = new Date().getFullYear()
const footerLink = 'inline-flex min-h-11 items-center rounded-control hover:text-ink hover:underline underline-offset-4'

/** Plain footer on every public page. Carries the company name and a direct contact, which Amazon's developer website rules ask for. */
export function PublicFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto grid max-w-[1200px] gap-8 px-4 pt-10 pb-8 text-small text-ink-2 md:grid-cols-[minmax(0,1fr)_auto] md:px-8 2xl:max-w-[1320px]">
        <div className="flex max-w-[44ch] flex-col gap-3">
          <Wordmark />
          <p>The AI listing agent for Indian fashion brands. Every listing is checked against the marketplace’s rules and approved by your team.</p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-6 min-[400px]:grid-cols-3 md:flex md:flex-wrap md:justify-end md:self-start">
          <Link to="/" hash="pricing" className={footerLink}>
            Pricing
          </Link>
          <a href={`mailto:${COMPANY.email}`} className={footerLink}>
            Contact
          </a>
          <Link to="/terms" className={footerLink}>
            Terms
          </Link>
          <Link to="/privacy" className={footerLink}>
            Privacy policy
          </Link>
          <Link to="/login" className={footerLink}>
            Sign in
          </Link>
          <Link to="/signup" className={footerLink}>
            Request access
          </Link>
        </nav>
        <div className="flex flex-col gap-1 border-t border-line pt-6 text-caption text-ink-3 md:col-span-2 md:flex-row md:justify-between md:gap-6">
          <p>
            © {YEAR} {COMPANY.legalName}
          </p>
          <address className="not-italic">{COMPANY_ADDRESS}</address>
        </div>
      </div>
    </footer>
  )
}

export function PublicLayout({ children, inPage, className }: { children: ReactNode; inPage?: boolean; className?: string }) {
  return (
    <div className="flex min-h-svh flex-col bg-canvas">
      <a
        href="#main"
        className="sr-only z-50 rounded-control bg-surface px-3 py-2 font-semibold text-brand focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <PublicHeader inPage={inPage} />
      <main id="main" tabIndex={-1} className={cn('flex-1 outline-none', className)}>
        {children}
      </main>
      <PublicFooter />
    </div>
  )
}
