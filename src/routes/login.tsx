import { zodResolver } from '@hookform/resolvers/zod'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { AlertCircle, Eye, EyeOff, Info } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { applyFieldErrors, describeError, isApiError } from '@/api/errors'
import { restoreSession } from '@/api/session'
import { BrandMark } from '@/components/app/brand-mark'
import { ReferenceId } from '@/components/states/reference-id'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { login, useSession } from '@/lib/auth'
import { safeRedirect } from '@/lib/redirect'

const searchSchema = z.object({ redirect: z.string().optional() })

export const Route = createFileRoute('/login')({
  validateSearch: searchSchema,
  beforeLoad: async ({ search }) => {
    const status = await restoreSession()
    if (status === 'authenticated') throw redirect({ href: safeRedirect(search.redirect) ?? '/', replace: true })
  },
  component: LoginPage,
})

/** LoginRequest limits: email 3..320, `^[^@\s]+@[^@\s]+$`, visible ASCII; password 1..1024. */
const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Enter your email.')
    .min(3, 'Email is too short.')
    .max(320, 'Email is too long.')
    .regex(/^[\x21-\x7E]+$/, 'Email must be plain ASCII.')
    .regex(/^[^@\s]+@[^@\s]+$/, 'Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.').max(1024, 'Password is too long.'),
})
type LoginValues = z.infer<typeof loginSchema>

function useCountdown() {
  const [until, setUntil] = useState<number | null>(null)
  const [left, setLeft] = useState(0)
  useEffect(() => {
    if (!until) return
    const tick = () => {
      const s = Math.max(0, Math.ceil((until - Date.now()) / 1000))
      setLeft(s)
      if (s === 0) setUntil(null)
    }
    tick()
    const t = setInterval(tick, 500)
    return () => clearInterval(t)
  }, [until])
  return { left: until ? left : 0, start: (seconds: number) => setUntil(Date.now() + seconds * 1000) }
}

function LoginPage() {
  const router = useRouter()
  const search = Route.useSearch()
  const session = useSession()
  const target = safeRedirect(search.redirect) ?? '/'
  const [formError, setFormError] = useState<{ message: string; ref: string | null } | null>(null)
  const countdown = useCountdown()
  const [showPassword, setShowPassword] = useState(false)

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  // Another tab signed in: follow it.
  useEffect(() => {
    if (session.status === 'authenticated') void router.history.push(target)
  }, [session.status, router, target])

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null)
    try {
      await login(values.email, values.password)
      await router.invalidate()
      router.history.push(target)
    } catch (e) {
      if (!isApiError(e)) {
        setFormError({ message: describeError(e), ref: null })
        return
      }
      if (e.status === 401) {
        setFormError({ message: 'Email or password is incorrect.', ref: e.correlationId })
        form.setFocus('password')
      } else if (e.status === 429) {
        const s = e.retryAfter ?? 60
        countdown.start(s)
        setFormError({ message: 'Too many attempts.', ref: e.correlationId })
      } else if (e.status === 422) {
        const rest = applyFieldErrors(e, form.setError, { fields: ['email', 'password'] })
        if (rest.length) setFormError({ message: describeError(e), ref: e.correlationId })
      } else {
        setFormError({ message: describeError(e), ref: e.correlationId })
      }
    }
  })

  const submitting = form.formState.isSubmitting
  const locked = countdown.left > 0
  const { errors } = form.formState

  return (
    <div className="grid min-h-svh bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex flex-col px-6 py-8 sm:px-10">
        <div className="flex items-center gap-2.5">
          <BrandMark />
          <span className="text-[0.9375rem] font-semibold tracking-tight">Marketplace OS</span>
        </div>
        <div className="flex flex-1 items-center justify-center py-12">
          <div className="animate-page-in w-full max-w-sm">
        <div className="mb-8 space-y-2">
          <h1 className="text-[1.75rem] leading-tight font-semibold tracking-[-0.02em]">Sign in</h1>
          <p className="text-sm text-muted-foreground">Use the email and password for your brand account.</p>
        </div>

        <div>
          {session.endReason === 'expired' && !formError ? (
            <div className="mb-4 flex items-start gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-sm" role="status">
              <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              Your session ended. Sign in again.
            </div>
          ) : null}
          {formError ? (
            <div
              role="alert"
              data-testid="login-error"
              className="mb-4 flex flex-col gap-1.5 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm"
            >
              <span className="flex items-start gap-2 text-destructive">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>
                  {formError.message}
                  {locked ? ` Try again in ${countdown.left} s.` : ''}
                </span>
              </span>
              <ReferenceId id={formError.ref} className="pl-6" />
            </div>
          ) : null}

          <form onSubmit={onSubmit} noValidate>
            <FieldGroup className="gap-4">
              <Field data-invalid={!!errors.email || undefined}>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  autoFocus
                  placeholder="you@company.com"
                  aria-invalid={!!errors.email}
                  {...form.register('email')}
                />
                <FieldError errors={[errors.email]} />
              </Field>
              <Field data-invalid={!!errors.password || undefined}>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    className="pr-10"
                    aria-invalid={!!errors.password}
                    {...form.register('password')}
                  />
                  <button
                    type="button"
                    aria-pressed={showPassword}
                    aria-controls="password"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-muted-foreground transition-colors duration-150 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/25"
                  >
                    {showPassword ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                    <span className="sr-only">{showPassword ? 'Hide password' : 'Show password'}</span>
                  </button>
                </div>
                <FieldError errors={[errors.password]} />
              </Field>
              <Button type="submit" size="lg" className="mt-1 w-full" disabled={submitting || locked}>
                {submitting ? <Spinner data-icon="inline-start" /> : null}
                {locked ? `Try again in ${countdown.left} s` : submitting ? 'Signing in…' : 'Sign in'}
              </Button>
            </FieldGroup>
          </form>
        </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Access is managed by your brand owner.</p>
      </div>
      <BrandPanel />
    </div>
  )
}

const FLOW = [
  { step: 'Import', text: 'Bring your catalog in by CSV or one product at a time.' },
  { step: 'Generate', text: 'AI drafts listings in your brand voice.' },
  { step: 'Check', text: 'Deterministic marketplace rules validate every field.' },
  { step: 'Approve', text: 'A second person signs off. Whoever edits cannot approve.' },
  { step: 'Publish', text: 'Approved listings go to Amazon and Flipkart.' },
] as const

/** Right-hand panel: the product's workflow and its one hard rule, from the PRD. */
function BrandPanel() {
  return (
    <aside className="relative hidden overflow-hidden border-l bg-canvas lg:flex lg:flex-col lg:justify-center lg:px-16 xl:px-24">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_75%)] opacity-60"
      />
      <div className="relative max-w-md">
        <h2 className="text-[1.375rem] leading-snug font-semibold tracking-[-0.02em]">
          Marketplace listings your team can trust.
        </h2>
        <p className="mt-3 text-sm text-muted-foreground">AI never publishes on its own. Every listing passes the rules and a human.</p>
        <ol className="mt-10 space-y-0">
          {FLOW.map((f, i) => (
            <li key={f.step} className="relative flex gap-4 pb-6 last:pb-0">
              {i < FLOW.length - 1 ? (
                <span aria-hidden className="absolute top-8 bottom-0 left-[15px] w-px bg-border-strong" />
              ) : null}
              <span className="relative flex size-8 shrink-0 items-center justify-center rounded-full border bg-card text-xs font-semibold text-brand shadow-elev-1 tabular-nums">
                {i + 1}
              </span>
              <div className="pt-1">
                <p className="text-sm font-semibold">{f.step}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{f.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </aside>
  )
}
