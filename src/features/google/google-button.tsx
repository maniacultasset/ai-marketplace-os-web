/**
 * The "Continue with Google" button, drawn to Google's sign-in branding rules: the standard
 * multicolour "G" (never recoloured, always on white), Google's own wording ("Continue with
 * Google", "Sign up with Google"), a neutral white button with Google's 1px #747775 outline, 12px
 * padding to the left of the mark and a 10px gap to the text, label in medium weight. It is as tall as our large buttons (44px), so it is
 * never smaller than the email button below it.
 */
import { useEffect, useState } from 'react'
import { Banner } from '@/components/la/banner'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { OrDivider } from '@/features/public/auth-frame'
import { useGoogleEnabled } from './api'
import { GOOGLE_LABEL, startGoogle, StorageBlockedError, type GoogleIntent } from './start'

/** Google's standard "G" mark, from Google's published sign-in button asset. Do not recolour. */
export function GoogleMark({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden focusable="false" className={className}>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
      <path fill="none" d="M0 0h48v48H0z" />
    </svg>
  )
}

/**
 * The button itself. The mark always sits on white or Google's neutral #f2f2f2 hover fill; hover
 * also raises the shadow, press insets it, focus adds our brand ring outside the outline.
 *
 * The raw colours (#747775 outline, #f2f2f2 hover, #1f1f1f text) are Google's required branding
 * values, not our design tokens: keep them as they are.
 */
export function GoogleButton({
  intent,
  returnTo,
  label,
  className,
  onBlocked,
}: {
  intent: GoogleIntent
  returnTo?: string | null
  /** Google's wording only: "Continue with Google", "Sign up with Google" or "Sign in with Google". */
  label?: string
  className?: string
  onBlocked?: () => void
}) {
  const [busy, setBusy] = useState(false)

  // Coming back with the browser's Back button restores this page from the cache, busy: reset it.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) setBusy(false)
    }
    window.addEventListener('pageshow', onShow)
    return () => window.removeEventListener('pageshow', onShow)
  }, [])

  const onClick = async () => {
    if (busy) return
    setBusy(true)
    try {
      await startGoogle({ intent, returnTo })
    } catch (e) {
      setBusy(false)
      if (e instanceof StorageBlockedError) onBlocked?.()
      else throw e
    }
  }

  const text = label ?? GOOGLE_LABEL[intent]
  return (
    <button
      type="button"
      onClick={() => void onClick()}
      aria-busy={busy || undefined}
      disabled={busy}
      data-testid={`google-${intent}`}
      className={cn(
        'group/google focus-ring relative inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2.5 rounded-control border border-[#747775] bg-white pr-4 pl-3 font-sans text-[15px] leading-5 font-medium text-[#1f1f1f] shadow-raised-sm select-none',
        'transition-[background-color,box-shadow,transform] duration-200 ease-(--ease-tactile) [--focus-rest:var(--shadow-raised-sm)]',
        'hover:bg-[#f2f2f2] hover:shadow-raised-md active:translate-y-px active:shadow-pressed',
        'disabled:cursor-progress disabled:shadow-none',
        className,
      )}
    >
      <GoogleMark size={18} className="shrink-0" />
      <span className="truncate">{busy ? 'Opening Google…' : text}</span>
      {busy ? <Spinner className="absolute right-3 size-4 text-ink-3" role="presentation" aria-hidden /> : null}
    </button>
  )
}

/**
 * The Google button over an "or" divider, for the top of the sign-in and sign-up forms. Renders
 * nothing unless the backend says Google sign-in is on.
 */
export function GoogleEntry({ intent, returnTo, divider = 'or use email' }: { intent: GoogleIntent; returnTo?: string | null; divider?: string }) {
  const enabled = useGoogleEnabled()
  const [blocked, setBlocked] = useState(false)
  if (!enabled) return null
  return (
    <div className="flex flex-col gap-4" data-testid="google-entry">
      <GoogleButton intent={intent} returnTo={returnTo} onBlocked={() => setBlocked(true)} />
      {blocked ? (
        <Banner tone="attention" role="alert">
          This browser is blocking site storage, so Google sign-in can’t finish here. Use your email instead, or allow
          storage for this site.
        </Banner>
      ) : null}
      <OrDivider>{divider}</OrDivider>
    </div>
  )
}
