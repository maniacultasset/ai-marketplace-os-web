/**
 * "Invite a teammate": email and role, then the invite link shown once with Copy. Kuinn sends no
 * email, so the inviter passes the link on. POST /invites asks for a login code first under
 * `MFA_ENFORCEMENT=all` (the client opens the step-up dialog and replays). Only an owner invites
 * an owner; a new invite for an email with an open one replaces the old link.
 */
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { describeError, isApiError } from '@/api/errors'
import type { Role } from '@/api/types'
import { Banner } from '@/components/la/banner'
import { fieldHintId, LaField } from '@/components/la/field'
import { IconTile } from '@/components/la/icons'
import { ReferenceId } from '@/components/states/reference-id'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { useMe } from '@/lib/auth'
import { useKeys } from '@/lib/query-keys'
import { email, FORM_VALIDATION_MODE, LOGIN_EMAIL_MAX, normalizeEmail } from '@/lib/validation'
import { createInvite, type Invite, type InviteCreated } from './access-api'
import { inviteErrorMessage } from './access-errors'
import { INVITE_DAYS, inviteRoleOptions, sameEmail, shortDateTime } from './access-model'
import { OneTimeLink } from './one-time-link'
import { ROLE_INFO, type Member } from './roles'

const schema = z.object({ email: email({ label: 'their email' }), role: z.enum(['owner', 'admin', 'operator', 'reviewer']) })
type Values = z.infer<typeof schema>

export function InviteDialog({
  open,
  onClose,
  members,
  pending,
}: {
  open: boolean
  onClose: () => void
  /** Loaded member rows, to say "already on the team" before sending. */
  members: readonly Member[]
  /** Loaded open invites, to say a new one replaces the old link. */
  pending: readonly Invite[]
}) {
  const [busy, setBusy] = useState(false)
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-lg" data-testid="invite-dialog" showCloseButton={!busy}>
        {/* Radix unmounts the content when closed: each opening is a fresh form, and the link leaves memory. */}
        <InviteBody onClose={onClose} members={members} pending={pending} onBusy={setBusy} />
      </DialogContent>
    </Dialog>
  )
}

function InviteBody({
  onClose,
  members,
  pending,
  onBusy,
}: {
  onClose: () => void
  members: readonly Member[]
  pending: readonly Invite[]
  onBusy: (busy: boolean) => void
}) {
  const { data: me } = useMe()
  const qc = useQueryClient()
  const keys = useKeys()
  const roles = inviteRoleOptions(me?.role)
  const [created, setCreated] = useState<InviteCreated | null>(null)
  const [formError, setFormError] = useState<{ message: string; ref: string | null } | null>(null)

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', role: 'operator' },
    ...FORM_VALIDATION_MODE,
  })
  const { errors, isSubmitting, submitCount } = form.formState
  const typed = useWatch({ control: form.control, name: 'email' })

  const onMember = members.some((m) => sameEmail(m.email, typed))
  const replaces = !onMember && pending.some((i) => sameEmail(i.email, typed))

  const onSubmit = form.handleSubmit(async (v) => {
    setFormError(null)
    const address = normalizeEmail(v.email)
    if (members.some((m) => sameEmail(m.email, address))) {
      form.setError('email', { message: 'This person is already on your team.' }, { shouldFocus: true })
      return
    }
    onBusy(true)
    try {
      const out = await createInvite(address, v.role as Role)
      setCreated(out)
      void qc.invalidateQueries({ queryKey: keys.invites.all() })
    } catch (e) {
      if (isApiError(e) && e.status === 401) return // session handling redirects
      const known = inviteErrorMessage(e, v.role as Role)
      if (known?.field) {
        form.setError(known.field, { message: known.message }, { shouldFocus: true })
        return
      }
      setFormError({ message: known?.message ?? describeError(e), ref: isApiError(e) ? e.correlationId : null })
    } finally {
      onBusy(false)
    }
  })

  const busy = isSubmitting

  return created ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <IconTile icon="check" tone="ok" size="sm" />
                Invite ready
              </DialogTitle>
              <DialogDescription>
                For <span className="font-semibold [overflow-wrap:anywhere] text-ink">{created.invite.email}</span> as{' '}
                {ROLE_INFO[created.invite.role].label.toLowerCase()}. It works once, until {shortDateTime(created.invite.expires_at)}.
              </DialogDescription>
            </DialogHeader>
            <OneTimeLinkBlock url={created.invite_url} />
            <DialogFooter>
              <Button onClick={onClose} data-testid="invite-done">
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={onSubmit} noValidate className="contents">
            <DialogHeader>
              <DialogTitle>Invite a teammate</DialogTitle>
              <DialogDescription>You get a link to send them. They set their own password, or use Google.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              {formError ? (
                <Banner tone="danger" role="alert">
                  <span className="block">{formError.message}</span>
                  <ReferenceId id={formError.ref} className="mt-1" />
                </Banner>
              ) : null}
              <LaField
                label="Email"
                htmlFor="invite-email"
                error={errors.email?.message}
                submitCount={submitCount}
                hint={replaces ? 'An invite for this email is open. A new one replaces the old link.' : 'The email they will sign in with.'}
              >
                <Input
                  id="invite-email"
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={LOGIN_EMAIL_MAX}
                  placeholder="name@yourbrand.com"
                  aria-invalid={!!errors.email}
                  aria-describedby={fieldHintId('invite-email')}
                  disabled={busy}
                  data-testid="invite-email"
                  {...form.register('email')}
                />
              </LaField>
              <LaField
                label="Role"
                htmlFor="invite-role"
                error={errors.role?.message}
                submitCount={submitCount}
                hint={me?.role === 'owner' ? undefined : 'Only an owner can invite an owner or a reviewer.'}
              >
                <Controller
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange} disabled={busy}>
                      <SelectTrigger
                        id="invite-role"
                        ref={field.ref}
                        className="w-full"
                        aria-invalid={!!errors.role}
                        aria-describedby={fieldHintId('invite-role')}
                        data-testid="invite-role"
                      >
                        <SelectValue>{ROLE_INFO[field.value].label}</SelectValue>
                      </SelectTrigger>
                      <SelectContent align="start" className="w-(--radix-select-trigger-width) p-1">
                        {roles.map((r) => (
                          <SelectItem key={r} value={r} textValue={ROLE_INFO[r].label}>
                            <div className="flex flex-col gap-0.5 py-0.5">
                              <span className="font-medium">{ROLE_INFO[r].label}</span>
                              <span className="text-xs whitespace-normal text-muted-foreground">{ROLE_INFO[r].summary}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </LaField>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy} data-testid="invite-submit">
                {busy ? <Spinner data-icon="inline-start" /> : null}
                {busy ? 'Making link…' : 'Make invite link'}
              </Button>
            </DialogFooter>
          </form>
        )
}

function OneTimeLinkBlock({ url }: { url: string }) {
  return (
    <OneTimeLink
      url={url}
      label="Invite link"
      testId="invite-link"
      note={`Send this link to them yourself (Kuinn does not email it). You see it only now. It works for ${INVITE_DAYS} days.`}
    />
  )
}
