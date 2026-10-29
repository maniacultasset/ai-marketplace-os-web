/**
 * Frame for the auth pages (hi-fi 01 Sign up, `.solo`): a white 65px header with the mark on the
 * left and one account link on the right, then the page body. Sign up is two columns (1a white,
 * 1b canvas); log in and the status check are "this frame without column 1b" (01 redlines).
 */
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { Banner } from '@/components/la/banner'
import { Wordmark } from '@/components/la/icons'
import { ReferenceId } from '@/components/states/reference-id'
import { cn } from '@/lib/utils'

export function AuthFrame({ aside, children }: { aside: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-surface">
      <a
        href="#main"
        className="sr-only z-50 rounded-control bg-surface px-3 py-2 font-semibold text-brand focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <header className="flex h-[65px] shrink-0 items-center justify-between gap-4 border-b border-line bg-surface px-4 md:px-10">
        <Link to="/" aria-label="Kuinn home" className="rounded-control">
          <Wordmark size="lg" />
        </Link>
        <p className="text-small text-ink-2">{aside}</p>
      </header>
      <main id="main" className="flex flex-1 flex-col">
        {children}
      </main>
    </div>
  )
}

/** The link in the header's right slot ("Already have an account? Log in"). */
export function AsideLink({ to, children }: { to: '/login' | '/signup'; children: ReactNode }) {
  return (
    <Link to={to} className="font-bold text-brand underline-offset-4 hover:underline">
      {children}
    </Link>
  )
}

/** Column 1a: white, padding 48 / 96 on desktop, 16 on mobile, max width for reading. */
export function AuthColumn({ children, className, tone = 'white' }: { children: ReactNode; className?: string; tone?: 'white' | 'canvas' }) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 px-4 py-8 sm:px-10 lg:pt-12 lg:pb-12',
        tone === 'white' ? 'bg-surface lg:px-24' : 'border-line bg-canvas max-lg:border-t lg:border-l lg:px-[72px]',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** "1a · Account" step tag (hi-fi `.chip.tag`). */
export function StepTag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-[22px] items-center self-start rounded-full border border-line-strong bg-surface px-[9px] text-caption font-semibold text-ink-2">
      {children}
    </span>
  )
}

/** "or use email" divider. */
export function OrDivider({ children = 'or use email' }: { children?: ReactNode }) {
  return (
    <div className="flex items-center gap-3" role="separator">
      <span aria-hidden className="h-px flex-1 bg-line" />
      <span className="text-caption text-ink-3">{children}</span>
      <span aria-hidden className="h-px flex-1 bg-line" />
    </div>
  )
}

/** The hi-fi Google glyph (a neutral placeholder mark, as in the design). */
export function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <circle cx="9" cy="9" r="7.5" fill="none" stroke="var(--ink-3)" strokeWidth="1.5" />
      <path d="M9 5.2v3.9h3.4" fill="none" stroke="var(--ink)" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

/** Form-level error: a danger banner with the request reference. */
export function FormAlert({ message, reference, testId }: { message: ReactNode; reference: string | null; testId?: string }) {
  return (
    <div data-testid={testId}>
      <Banner tone="danger" role="alert">
        <span className="block">{message}</span>
        <ReferenceId id={reference} className="mt-1" />
      </Banner>
    </div>
  )
}

/** Quiet footer line. An unreachable server is shown by the app-wide NetworkBanner instead. */
export function AuthFootnote({ children }: { children?: ReactNode }) {
  return (
    <div className="mt-auto flex flex-wrap items-center justify-end gap-x-4 gap-y-2 pt-6 text-caption text-ink-2">
      {children}
    </div>
  )
}
