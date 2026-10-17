/**
 * Public frame for the landing page, legal pages and auth pages: translucent sticky header (mark, links,
 * "Sign in", one primary "Request access"), canvas body, plain footer. Sign-up is a request a
 * person reviews (ADR-0019), so the primary call to action is "Request access", never "Sign up".
 */
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { Wordmark } from '@/components/la/icons'
import { Button } from '@/components/ui/button'
import { useScrolled } from '@/lib/use-scrolled'
import { cn } from '@/lib/utils'

/** `compactLinks`: the same in-page links as a second, scrollable row inside the bar below md. */
export function PublicHeader({ links, compactLinks }: { links?: ReactNode; compactLinks?: ReactNode }) {
  const scrolled = useScrolled()
  return (
    <header data-scrolled={scrolled || undefined} className="material-bar sticky top-0 z-30">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-3 px-4 md:gap-6 md:px-8">
        <Link to="/" aria-label="Listing Agent home" className="inline-flex min-h-10 shrink-0 items-center">
          {/* The name stays at phone width; screens under 375px (where the name and both buttons cannot fit) drop to the mark. */}
          <Wordmark size="lg" className="max-[374px]:[&>span]:hidden" />
        </Link>
        {links ? <nav aria-label="Site" className="hidden items-center gap-6 text-body font-medium text-ink-2 md:flex">{links}</nav> : null}
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <Button asChild variant="ghost" className="max-sm:px-2.5 max-sm:text-[13px]">
            <Link to="/login">Sign in</Link>
          </Button>
          <Button asChild className="max-sm:px-3 max-sm:text-[13px]">
            <Link to="/signup">Request access</Link>
          </Button>
        </div>
      </div>
      {compactLinks ? (
        <nav aria-label="Sections" className="flex gap-1 overflow-x-auto px-4 pb-2 text-small font-medium text-ink-2 [scrollbar-width:none] md:hidden">
          {compactLinks}
        </nav>
      ) : null}
    </header>
  )
}

export function PublicFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 text-small text-ink-2 md:px-8">
        <Wordmark />
        <span>Amazon and Flipkart listings, checked against the rules and approved by you.</span>
        <nav aria-label="Legal" className="flex gap-4 sm:ml-auto">
          <Link to="/privacy" className="inline-flex min-h-10 items-center hover:text-ink hover:underline">
            Privacy policy
          </Link>
          <Link to="/login" className="inline-flex min-h-10 items-center hover:text-ink hover:underline">
            Sign in
          </Link>
        </nav>
      </div>
    </footer>
  )
}

export function PublicLayout({
  children,
  links,
  compactLinks,
  className,
}: {
  children: ReactNode
  links?: ReactNode
  compactLinks?: ReactNode
  className?: string
}) {
  return (
    <div className="flex min-h-svh flex-col bg-canvas">
      <a
        href="#main"
        className="sr-only z-50 rounded-control bg-surface px-3 py-2 font-semibold text-brand focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <PublicHeader links={links} compactLinks={compactLinks} />
      <main id="main" className={cn('flex-1', className)}>
        {children}
      </main>
      <PublicFooter />
    </div>
  )
}
