/**
 * The waiting screens' live status: the stored status handle polled with POST /signup/status/poll
 * (features/signup-admin/poll.ts), the copy for each state, and the one next step.
 *
 *   pending   brand and request time; the page updates by itself (and, when the handle is kept on
 *             this device, it can be closed and opened again)
 *   approved  one button into the workspace: Google sign-in in one click, or the password sign-in
 *             with the email filled in when this page knows it, with the intended page kept
 *   rejected  the reviewer's reason and how to reach support
 *
 * A pending request may carry the reviewer's one question (`QuestionBlock`): the person reads it
 * and sends one reply with the same status handle (POST /signup/status/reply), then sees it sent.
 */
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { isApiError } from '@/api/errors'
import { Icon } from '@/components/la/icons'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { TOUCH_TEXT } from '@/features/mfa/components'
import { GoogleButton } from '@/features/google/google-button'
import { replyError, useSignupReply } from '@/features/signup-admin/poll'
import { codePoints, REASON_MAX, replyFormSchema, type ReplyFormValues } from '@/features/signup-admin/schema'
import { clearStatusHandle, type SignInVia } from '@/features/signup-admin/status-handle'
import { TimeAgo } from '@/features/signup-admin/time'
import { approvedSignIn } from '@/lib/sign-in-state'
import { cn } from '@/lib/utils'
import { FORM_VALIDATION_MODE } from '@/lib/validation'
import { FormAlert } from './auth-frame'
import { COMPANY } from './company'
import { questionState, replyElsewhere, type StatusView } from './waiting'

/** The one next step for a status, plus `secondary` (a back link) under it. */
export function WaitingActions({
  status,
  via,
  returnTo,
  email,
  signInEmail,
  secondary,
}: {
  status: StatusView['status']
  via: SignInVia
  returnTo: string | null
  /** The email the person applied with, when this page knows it (prefills "Apply again"). */
  email?: string
  /** The email to fill in on the sign-in, when known (falls back to `email`). Never in a URL. */
  signInEmail?: string
  secondary?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3">
      {status === 'approved' ? (
        via === 'google' ? (
          <div onClickCapture={clearStatusHandle} data-testid="waiting-continue">
            <GoogleButton intent="login" returnTo={returnTo} />
          </div>
        ) : (
          <Button asChild size="lg" className="w-full">
            <Link
              to="/login"
              search={returnTo ? { redirect: returnTo } : {}}
              state={approvedSignIn(signInEmail || email)}
              onClick={clearStatusHandle}
              data-testid="waiting-continue"
            >
              Continue to your workspace
              <Icon name="arrow" size={16} />
            </Link>
          </Button>
        )
      ) : status === 'rejected' ? (
        <>
          <Button asChild size="lg" className="w-full">
            <a href={`mailto:${COMPANY.email}`} data-testid="waiting-support">
              Contact support
            </a>
          </Button>
          <Button asChild size="lg" variant="secondary" className="w-full">
            <Link to="/signup" search={email && via === 'password' ? { email } : {}} onClick={clearStatusHandle} data-testid="signup-status-reapply">
              Apply again
            </Link>
          </Button>
        </>
      ) : null}
      {secondary}
    </div>
  )
}

/**
 * The reviewer's one question on a pending request, and the person's one reply. With a live
 * handle and no reply yet: the question and a reply box; without one, the way back in for `via`.
 * Once replied: both, read only. Nothing when no question was asked.
 */
export function QuestionBlock({ view, handle, via }: { view: StatusView; handle: string | null; via: SignInVia }) {
  const state = questionState(view)
  if (state === 'none' || !view.question) return null
  return (
    <section className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-raised-md" aria-labelledby="signup-question-title" data-testid="signup-question">
      <div>
        <h2 id="signup-question-title" className="text-caption font-bold text-ink-2">
          Question from our team
        </h2>
        <p className="mt-1 text-body break-words whitespace-pre-wrap text-ink" data-testid="signup-question-text">
          {view.question}
        </p>
      </div>
      {state === 'replied' && view.reply ? (
        <div className="border-t border-line pt-3" data-testid="signup-reply-sent">
          <p className="text-caption font-bold text-ink-2">Your reply</p>
          <p className="mt-1 text-body break-words whitespace-pre-wrap text-ink">{view.reply}</p>
          {view.replied_at ? (
            <p className="mt-1 text-caption text-ink-3">
              Sent <TimeAgo iso={view.replied_at} />
            </p>
          ) : null}
        </div>
      ) : handle ? (
        <ReplyForm handle={handle} />
      ) : (
        <p className="text-small text-ink-2" data-testid="signup-question-hint">
          {replyElsewhere(via)}
        </p>
      )}
    </section>
  )
}

function ReplyForm({ handle }: { handle: string }) {
  const send = useSignupReply(handle)
  const form = useForm<ReplyFormValues>({
    resolver: zodResolver(replyFormSchema),
    defaultValues: { reply: '' },
    ...FORM_VALIDATION_MODE,
  })
  const { errors } = form.formState
  const length = codePoints(form.watch('reply').trim())
  const busy = send.isPending
  const onSubmit = form.handleSubmit((values) => send.mutate(values.reply.trim()))
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-2 border-t border-line pt-3">
      <label htmlFor="signup-reply" className="text-caption font-bold text-ink-2">
        Your reply
      </label>
      <Textarea
        id="signup-reply"
        rows={3}
        className={cn('max-h-60 min-h-20', TOUCH_TEXT)}
        autoComplete="off"
        aria-invalid={!!errors.reply}
        aria-describedby="signup-reply-hint"
        disabled={busy}
        data-testid="signup-reply"
        {...form.register('reply')}
      />
      <div id="signup-reply-hint" className="flex items-start justify-between gap-3 text-caption">
        {errors.reply ? (
          <span className="text-danger-ink" role="alert">
            {errors.reply.message}
          </span>
        ) : (
          <span className="text-ink-3">You can send one reply. Plain text only.</span>
        )}
        <span className={cn('shrink-0 text-ink-3 tabular-nums', length > REASON_MAX && 'text-danger-ink')}>
          {length}/{REASON_MAX}
        </span>
      </div>
      {send.isError ? (
        <FormAlert testId="signup-reply-error" message={replyError(send.error)} reference={isApiError(send.error) ? send.error.correlationId : null} />
      ) : null}
      <Button type="submit" size="lg" className="w-full" disabled={busy} data-testid="signup-reply-send">
        {busy ? <Spinner data-icon="inline-start" /> : null}
        {busy ? 'Sending…' : 'Send reply'}
      </Button>
    </form>
  )
}
