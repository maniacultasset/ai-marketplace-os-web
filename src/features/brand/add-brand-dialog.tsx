/**
 * "Add another brand" dialog, opened from the brand switcher: the brand name and an optional
 * website, then the new brand is made (POST /tenants), the session moves into it
 * (POST /auth/switch-tenant) and its setup starts. One idempotency key per opening, so a retry
 * after a network drop never makes two brands. A login code is asked for first when the
 * deployment needs one (the API client opens the step-up dialog and replays).
 */
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { applyFieldErrors, describeError, isApiError } from '@/api/errors'
import { useIntentKey } from '@/api/idempotency'
import { Banner } from '@/components/la/banner'
import { fieldHintId, LaField } from '@/components/la/field'
import { ReferenceId } from '@/components/states/reference-id'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { switchTenant } from '@/lib/auth'
import { queryClient } from '@/lib/query-client'
import { FORM_VALIDATION_MODE, NAME_MAX, orgName, WEBSITE_MAX, website } from '@/lib/validation'
import { addBrandBody, addBrandErrorMessage, createBrand, NEW_BRAND_START } from './add-brand'

const schema = z.object({ name: orgName('the brand name'), website: website() })
type Values = z.infer<typeof schema>
type Phase = 'form' | 'creating' | 'switching'

export function AddBrandDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md" data-testid="add-brand-dialog" showCloseButton={!busy}>
        {/* Radix unmounts the content when closed: each opening is a fresh form and a fresh key. */}
        <AddBrandBody onClose={onClose} onBusy={setBusy} />
      </DialogContent>
    </Dialog>
  )
}

function AddBrandBody({ onClose, onBusy }: { onClose: () => void; onBusy: (busy: boolean) => void }) {
  const navigate = useNavigate()
  const intent = useIntentKey()
  const [phase, setPhase] = useState<Phase>('form')
  const [formError, setFormError] = useState<{ message: string; ref: string | null } | null>(null)
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', website: '' },
    ...FORM_VALIDATION_MODE,
  })
  const { errors, submitCount } = form.formState
  const busy = phase !== 'form'

  const onSubmit = form.handleSubmit(async (v) => {
    setFormError(null)
    setPhase('creating')
    onBusy(true)
    let created
    try {
      created = await createBrand(addBrandBody(v.name, v.website), intent.get())
    } catch (e) {
      setPhase('form')
      onBusy(false)
      if (isApiError(e) && e.status === 401) return // session handling redirects
      if (isApiError(e) && e.type === 'IDEMPOTENCY_KEY_REUSED') intent.reset()
      const unmapped = applyFieldErrors(e, form.setError, { fields: ['name', 'website'] })
      if (isApiError(e) && e.status === 422 && unmapped.length === 0) return
      setFormError({ message: addBrandErrorMessage(e) ?? describeError(e), ref: isApiError(e) ? e.correlationId : null })
      return
    }
    setPhase('switching')
    try {
      await switchTenant(created.id)
    } catch {
      // The brand exists; the menu lists it after this refresh, so the owner can switch by hand.
      void queryClient.invalidateQueries()
      setPhase('form')
      onBusy(false)
      setFormError({ message: `${created.name} is added. Open it from the brand menu.`, ref: null })
      return
    }
    onBusy(false)
    onClose()
    void navigate({ to: NEW_BRAND_START })
  })

  return (
    <form onSubmit={onSubmit} noValidate className="contents">
      <DialogHeader>
        <DialogTitle>Add another brand</DialogTitle>
        <DialogDescription>You will own it. It starts empty, with its own products, team and marketplace accounts.</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-4">
        {formError ? (
          <Banner tone="danger" role="alert" data-testid="add-brand-error">
            <span className="block">{formError.message}</span>
            <ReferenceId id={formError.ref} className="mt-1" />
          </Banner>
        ) : null}
        <LaField label="Brand name" htmlFor="add-brand-name" error={errors.name?.message} submitCount={submitCount} hint="As customers see it.">
          <Input
            id="add-brand-name"
            autoComplete="organization"
            maxLength={NAME_MAX}
            aria-invalid={!!errors.name}
            aria-describedby={fieldHintId('add-brand-name')}
            disabled={busy}
            data-testid="add-brand-name"
            {...form.register('name')}
          />
        </LaField>
        <LaField label="Website" htmlFor="add-brand-website" error={errors.website?.message} submitCount={submitCount} hint="Optional.">
          <Input
            id="add-brand-website"
            type="url"
            inputMode="url"
            autoComplete="url"
            spellCheck={false}
            maxLength={WEBSITE_MAX}
            placeholder="yourbrand.in"
            aria-invalid={!!errors.website}
            aria-describedby={fieldHintId('add-brand-website')}
            disabled={busy}
            data-testid="add-brand-website"
            {...form.register('website')}
          />
        </LaField>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy} data-testid="add-brand-submit">
          {busy ? <Spinner data-icon="inline-start" /> : null}
          {phase === 'creating' ? 'Adding brand…' : phase === 'switching' ? 'Opening brand…' : 'Add brand'}
        </Button>
      </DialogFooter>
    </form>
  )
}
