/**
 * Frame for the auth pages (hi-fi 01 Sign up, `.solo`): a white 65px header with the mark on the
 * left and one account link on the right, then the page body. Sign up is two columns (1a white,
 * 1b canvas); log in and the status check are "this frame without column 1b" (01 redlines).
 */
import { Link } from '@tanstack/react-router'
import type { ReactNode, Ref } from 'react'
import { Banner } from '@/components/la/banner'
import { IconTile, Wordmark, type IconName } from '@/components/la/icons'
import { Button } from '@/components/ui/button'
import { ReferenceId } from '@/components/states/reference-id'
import { cn } from '@/lib/utils'

/**
 * `tone="canvas"` (the sign-in steps): one flat surface on a phone; from 640px up the step's card
 * sits on the canvas. `aside` is the header's right slot, left out on the steps after the password.
 */
export function AuthFrame({ aside, tone = 'surface', children }: { aside?: ReactNode; tone?: 'surface' | 'canvas'; children: ReactNode }) {
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
        {aside ? <p className="text-small text-ink-2">{aside}</p> : null}
      </header>
      <main id="main" className={cn('flex flex-1 flex-col', tone === 'canvas' && 'bg-surface sm:bg-canvas')}>
        {children}
      </main>
    </div>
  )
}

/**
 * The single frame for every sign-in step: centred when short, top-aligned when tall. `sm` (440)
 * for the password and code steps, `lg` (640) for enrolment, the recovery codes and a new password,
 * so that sequence never changes width. No border or padding on a phone: the 16px gutter is the
 * only margin.
 */
export function AuthCard({ size = 'sm', children, testId = 'login-card' }: { size?: 'sm' | 'lg'; children: ReactNode; testId?: string }) {
  return (
    <div className="mx-auto flex w-full flex-1 flex-col px-4 py-6 sm:px-6 sm:py-10 lg:py-14">
      <div
        className={cn(
          'mx-auto flex w-full flex-col gap-5 sm:my-auto sm:rounded-2xl sm:border sm:border-line sm:bg-surface sm:p-8 sm:shadow-card',
          size === 'sm' ? 'max-w-[440px]' : 'max-w-[640px] md:p-10',
        )}
        data-testid={testId}
      >
        {children}
      </div>
      <AuthFootnote />
    </div>
  )
}

/** "Signing in as …" on the steps after the password, with the way back to a different account. */
export function AccountChip({ email, onSwitch }: { email: string; onSwitch?: () => void }) {
  return (
    <div className="flex min-h-11 items-center gap-3 rounded-xl border border-line bg-canvas py-1.5 pr-1.5 pl-3">
      <IconTile icon="user" tone="neutral" size="sm" />
      {/* A long address wraps (two lines at most) rather than hiding which account this is. */}
      <p className="line-clamp-2 min-w-0 flex-1 text-small font-semibold [overflow-wrap:anywhere] text-ink" title={email}>
        <span className="sr-only">Signing in as </span>
        {email}
      </p>
      {onSwitch ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-my-1.5 shrink-0 px-2.5 max-sm:h-11"
          onClick={onSwitch}
          aria-label="Switch account"
          data-testid="login-start-over"
        >
          Switch
        </Button>
      ) : null}
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

/**
 * Form-level message with the request reference: danger by default (an alert); `attention` and
 * `info` (a status) for a calm restart notice.
 */
export function FormAlert({
  message,
  reference,
  testId,
  tone = 'danger',
  icon,
  focusRef,
}: {
  message: ReactNode
  reference: string | null
  testId?: string
  tone?: 'danger' | 'attention' | 'info'
  icon?: IconName
  /** To move focus to the alert (it takes programmatic focus only), e.g. after a submit. */
  focusRef?: Ref<HTMLDivElement>
}) {
  return (
    <div data-testid={testId} ref={focusRef} tabIndex={-1} className="rounded-[10px] outline-none focus-visible:shadow-[var(--focus-ring)]">
      <Banner tone={tone} icon={icon} role={tone === 'danger' ? 'alert' : 'status'}>
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
