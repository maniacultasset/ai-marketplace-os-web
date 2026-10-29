/**
 * The login-code setup as four short steps (get the app, scan, enter the code, save the recovery
 * codes), one screen each. The same shell serves the sign-in enrolment and the Settings > Security
 * setup and replace panels; each caller owns its API calls and only tells the shell which step
 * shows. Moving between the first three steps is client-only: the secret and the challenge stay
 * as they are.
 */
import { ArrowLeft, Check, ChevronDown, Lock, ShieldCheck, Smartphone } from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { QrCode } from './components'
import { ENROL_STEPS, stepBarClass, TOGGLE, type EnrolStepIndex, type StepBarVariant } from './enrol-steps'


/**
 * Four numbered steps joined by a rule: done steps carry a check, the current one is filled. On a
 * phone only the current step's name shows (below the dots); every name stays in the list for
 * screen readers.
 */
export function EnrolStepper({ current, className }: { current: EnrolStepIndex; className?: string }) {
  return (
    // Names beside the dots only where all four fit (a container query); otherwise the current
    // step's name shows under them. Every name stays in the list for screen readers.
    <div className={cn('@container', className)} data-testid="enrol-stepper">
      <ol aria-label="Setup steps" className="flex items-center gap-2 @min-[36rem]:gap-3">
        {ENROL_STEPS.map((label, i) => {
          const state = i < current ? 'done' : i === current ? 'on' : 'todo'
          return (
            <li
              key={label}
              aria-current={state === 'on' ? 'step' : undefined}
              data-state={state}
              // flex-auto, not flex-1: each step gets the same extra space beyond its own label, so the
              // three joining rules come out the same length.
              className="flex items-center gap-2 @min-[36rem]:gap-3 [&:not(:last-child)]:flex-auto"
            >
              <span
                aria-hidden
                className={cn(
                  'tactile inline-flex size-7 shrink-0 items-center justify-center rounded-full border text-caption font-semibold tabular-nums',
                  state === 'done' && 'border-success bg-success text-white shadow-raised-sm',
                  state === 'on' && 'border-brand bg-brand text-white shadow-raised-brand',
                  state === 'todo' && 'border-line-strong bg-field text-ink-2 shadow-inset-sm',
                )}
              >
                {state === 'done' ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
              </span>
              <span
                className={cn(
                  'text-small font-semibold whitespace-nowrap @max-[36rem]:sr-only',
                  state === 'on' ? 'text-ink' : state === 'done' ? 'text-ink-2' : 'text-ink-3',
                )}
              >
                {label}
                {state === 'done' ? <span className="sr-only"> (done)</span> : null}
              </span>
              {i < ENROL_STEPS.length - 1 ? (
                <span aria-hidden className={cn('h-0.5 min-w-3 flex-1 rounded-full', i < current ? 'bg-success' : 'bg-line-strong')} />
              ) : null}
            </li>
          )
        })}
      </ol>
      <p aria-hidden className="mt-2.5 text-caption text-ink-3 @min-[36rem]:hidden">
        Step {current + 1} of {ENROL_STEPS.length} · <span className="font-semibold text-ink-2">{ENROL_STEPS[current]}</span>
      </p>
    </div>
  )
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * One step: the stepper, then the step's heading, intro, body and actions. Only the step's own
 * content animates when the step changes (a short slide in the direction of travel; none under
 * reduced motion), and focus moves to the new heading so the change is announced. With
 * `onSubmit` the body and actions are one form (the code step). In the settings panel each step
 * change also brings the stepper to the top of the screen (below the app header, by the page's
 * scroll-padding), so a tall step
 * starts in view instead of wherever the last one left the page.
 */
export function EnrolWizard({
  step,
  title,
  intro,
  headingId,
  level = 1,
  variant = 'page',
  aside,
  error,
  children,
  actions,
  note,
  onSubmit,
  testId,
}: {
  step: EnrolStepIndex
  title: string
  intro: ReactNode
  /** Id for the heading, so the surrounding region can be named by it. */
  headingId?: string
  /** h1 on the sign-in page, h3 inside the settings card. */
  level?: 1 | 3
  /** `page`: the sign-in card. `panel`: the settings card (its sticky phone bar takes the panel's fill). */
  variant?: StepBarVariant
  /** Next to the stepper (the panel's Cancel). */
  aside?: ReactNode
  /** A form-level alert above the body. */
  error?: ReactNode
  children?: ReactNode
  actions?: ReactNode
  /** Quiet line under the actions (the challenge expiry). */
  note?: ReactNode
  onSubmit?: (e: FormEvent) => void
  testId?: string
}) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const shownStep = useRef(step)
  // The direction of the last move, for the slide (set while rendering: no extra paint).
  const [moved, setMoved] = useState<{ step: EnrolStepIndex; back: boolean }>({ step, back: false })
  if (moved.step !== step) setMoved({ step, back: step < moved.step })

  useEffect(() => {
    // The first step shows where the panel opened; only a move between steps scrolls.
    const moved = shownStep.current !== step
    shownStep.current = step
    if (variant === 'panel' && moved) {
      headingRef.current?.focus({ preventScroll: true })
      rootRef.current?.scrollIntoView?.({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
    } else {
      headingRef.current?.focus()
    }
  }, [step, variant])

  const Heading = level === 1 ? 'h1' : 'h3'
  const page = variant === 'page'
  // On a phone the expiry note sits above the button bar (the bar holds the bottom edge); from
  // 640px it follows the buttons.
  const body = (
    <>
      {error}
      {children}
      {note ? <div className="sm:order-last">{note}</div> : null}
      {actions ? (
        <StepBar variant={variant}>{actions}</StepBar>
      ) : null}
    </>
  )
  return (
    <div
      ref={rootRef}
      // Phone sign-in: the step fills the screen so its button bar sits on the bottom edge even
      // when the step is short. (Scrolled to in Settings, the page's scroll-padding keeps it clear
      // of the app header.)
      className={cn('flex flex-col', page ? 'gap-6 max-sm:flex-1' : 'gap-5')}
      data-testid={testId}
      data-step={step}
    >
      <div className="flex items-start gap-3">
        <EnrolStepper current={step} className="min-w-0 flex-1" />
        {aside}
      </div>
      <div
        key={step}
        className={cn(
          'flex flex-col gap-5',
          page && 'max-sm:flex-1',
          'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300 motion-safe:ease-[var(--ease-tactile)]',
          moved.back ? 'motion-safe:slide-in-from-left-3' : 'motion-safe:slide-in-from-right-3',
        )}
        data-testid="enrol-step-content"
      >
        <div>
          <Heading
            id={headingId}
            ref={headingRef}
            tabIndex={-1}
            className={cn(
              'text-ink outline-none',
              level === 1 ? 'text-[24px] leading-[30px] font-bold tracking-[-0.02em] sm:text-h1' : 'text-h2',
            )}
            data-testid="step-title"
          >
            {title}
          </Heading>
          <div className="mt-2 max-w-[56ch] text-body text-pretty text-ink-2">
            {intro}
          </div>
        </div>
        {onSubmit ? (
          <form onSubmit={onSubmit} noValidate className={cn('flex flex-col gap-5', page && 'max-sm:flex-1')}>
            {body}
          </form>
        ) : (
          body
        )}
      </div>
    </div>
  )
}

/**
 * The step's buttons: Back on the left, the main action on the right. On a phone the bar sticks
 * to the bottom of the screen (above the home indicator) so the main action is always in reach.
 */
function StepBar({ variant, children }: { variant: StepBarVariant; children: ReactNode }) {
  return (
    <div className={cn('flex items-center gap-3 pt-1 max-sm:mt-auto sm:justify-end', stepBarClass(variant))} data-testid="enrol-actions">
      {children}
    </div>
  )
}

/** Back to the previous step (client-only). */
export function BackButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <Button type="button" variant="secondary" size="lg" onClick={onClick} disabled={disabled} className="max-sm:px-4 sm:mr-auto" data-testid="enrol-back">
      <ArrowLeft data-icon="inline-start" />
      Back
    </Button>
  )
}


const APPS = ['Google Authenticator', 'Microsoft Authenticator', '1Password'] as const

/** Step 1: which apps work, as three flat tiles (information, not controls: no raised edge). */
export function GetAppBody({ children }: { children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <ul className="grid gap-2 sm:grid-cols-3" aria-label="Apps that work">
        {APPS.map((name) => (
          <li key={name} className="flex min-h-11 items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-2 sm:min-h-12 sm:py-2.5">
            <span aria-hidden className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-canvas text-ink-2">
              <Smartphone className="size-4" />
            </span>
            <span className="min-w-0 text-small leading-5 font-semibold text-ink">{name}</span>
          </li>
        ))}
      </ul>
      <p className="flex items-start gap-2 text-small text-ink-2">
        <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
        <span>Any app that shows 6-digit codes works. Already have one? Continue.</span>
      </p>
      {children}
    </div>
  )
}

/** "Password confirmed" in place of the password field once the setup key exists. */
export function PasswordConfirmed() {
  return (
    <p className="flex items-center gap-2 rounded-xl border border-success-line bg-success-tint px-3.5 py-2.5 text-small font-semibold text-success-ink">
      <Lock aria-hidden className="size-4 shrink-0" />
      Password confirmed
    </p>
  )
}

/**
 * Step 3's way back to the QR code without leaving the step: a small disclosure that draws the
 * code again, compact.
 */
export function QrAgain({ uri }: { uri: string | null }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  if (!uri) return null
  return (
    <div className="flex flex-col items-start gap-3">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn('-ml-3', TOGGLE)}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        data-testid="show-qr-again"
      >
        <ChevronDown aria-hidden className={cn('tactile', open && 'rotate-180')} />
        {open ? 'Hide QR code' : 'Show QR code again'}
      </Button>
      <div id={id} hidden={!open}>
        {open ? (
          <div className="rounded-xl border border-line bg-surface p-2 shadow-raised-sm">
            <QrCode uri={uri} size={132} className="rounded-xs border-0" />
          </div>
        ) : null}
      </div>
    </div>
  )
}
