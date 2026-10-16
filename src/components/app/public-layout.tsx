/**
 * Public frame for the landing page, legal pages and auth pages: white header (mark, links,
 * "Sign in", one primary "Request access"), canvas body, plain footer. Sign-up is a request a
 * person reviews (ADR-0019), so the primary call to action is "Request access", never "Sign up".
 */
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { Wordmark } from '@/components/la/icons'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function PublicHeader({ links }: { links?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-4 px-4 md:gap-6 md:px-8">
        <Link to="/" aria-label="Listing Agent home" className="shrink-0">
          <Wordmark size="lg" compactBelowSm />
        </Link>
        {links ? <nav aria-label="Site" className="hidden items-center gap-6 text-body font-medium text-ink-2 md:flex">{links}</nav> : null}
        <div className="ml-auto flex items-center gap-2">
          <Button asChild variant="ghost">
            <Link to="/login">Sign in</Link>
          </Button>
          <Button asChild>
            <Link to="/signup">Request access</Link>
          </Button>
        </div>
      </div>
    </header>
  )
}

export function PublicFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 text-small text-ink-2 md:px-8">
        <Wordmark />
        <span>Amazon and Flipkart listings, checked against the rules and approved by you.</span>
        <nav aria-label="Legal" className="ml-auto flex gap-4">
          <Link to="/privacy" className="hover:text-ink hover:underline">
            Privacy policy
          </Link>
          <Link to="/login" className="hover:text-ink hover:underline">
            Sign in
          </Link>
        </nav>
      </div>
    </footer>
  )
}

export function PublicLayout({ children, links, className }: { children: ReactNode; links?: ReactNode; className?: string }) {
  return (
    <div className="flex min-h-svh flex-col bg-canvas">
      <a
        href="#main"
        className="sr-only z-50 rounded-control bg-surface px-3 py-2 font-semibold text-brand focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <PublicHeader links={links} />
      <main id="main" className={cn('flex-1', className)}>
        {children}
      </main>
      <PublicFooter />
    </div>
  )
}
