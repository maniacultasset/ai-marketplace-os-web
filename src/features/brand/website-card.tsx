/**
 * Brand profile > Website: optional, filled from the sign-up form on approval and editable here
 * (GET /brand-profile with its ETag -> PATCH /brand-profile `website_url` with If-Match,
 * settings:manage). Stored only: nothing is generated from it. 409 STALE_VERSION: the latest is
 * loaded, the draft is kept, and the person saves again.
 */
import { useState } from 'react'
import { isStaleVersion } from '@/api/etag'
import { isApiError } from '@/api/errors'
import { Banner, CardHead, fieldHintId, LaCard, LaField } from '@/components/la'
import { ReferenceId } from '@/components/states/reference-id'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { useBrandManufacturer as useBrandProfileRow, useSaveBrandManufacturer as useSaveBrandProfileRow } from '@/features/products/api'
import { toast } from '@/lib/toast'
import { WEBSITE_MAX, websiteProblem, websiteValue } from './website-model'

export const WEBSITE_HINT = 'Optional. Saved on your brand profile.'

export function WebsiteCard({ canEdit }: { canEdit: boolean }) {
  // The same GET /brand-profile read (and cache) as the manufacturer card.
  const q = useBrandProfileRow()
  const save = useSaveBrandProfileRow()
  const [draft, setDraft] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(0)
  const [serverError, setServerError] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [error, setError] = useState<unknown>(null)
  /** The ETag the edit started from: a background refetch must never swap it (silent overwrite). */
  const [etag, setEtag] = useState<string | null>(null)

  const website = q.data?.data.website_url ?? null
  const editing = draft !== null
  const problem = draft !== null && submitted > 0 ? websiteProblem(draft) : null
  const fieldError = serverError ?? problem ?? undefined

  const start = () => {
    setEtag(q.data?.etag ?? null)
    setDraft(website ?? '')
    setSubmitted(0)
    setServerError(null)
    setStale(false)
    setError(null)
  }
  const stop = () => {
    setDraft(null)
    setStale(false)
    setError(null)
  }

  const onSave = async () => {
    if (draft === null) return
    setSubmitted((n) => n + 1)
    if (websiteProblem(draft)) return
    const value = websiteValue(draft)
    setError(null)
    try {
      await save.mutateAsync({ body: { website_url: value }, etag })
      toast.success(value ? 'Website saved' : 'Website removed')
      stop()
    } catch (err) {
      if (isStaleVersion(err)) {
        const fresh = await q.refetch()
        if (fresh.data) setEtag(fresh.data.etag)
        else {
          setError(fresh.error ?? err)
          return
        }
        setStale(true)
        return
      }
      if (isApiError(err) && err.status === 422) {
        setServerError('Enter a full web address, for example https://yourbrand.in')
        return
      }
      setError(err)
    }
  }

  return (
    <LaCard id="website" data-testid="brand-website-card" className="scroll-mt-24 md:scroll-mt-4">
      <CardHead
        icon="globe"
        title="Website"
        sub={WEBSITE_HINT}
        action={
          canEdit && !editing && q.data ? (
            <Button variant="secondary" size="sm" onClick={start} data-testid="website-edit">
              {website ? 'Edit' : 'Add website'}
            </Button>
          ) : null
        }
      />
      <div className="mt-4">
        {q.isPending ? (
          <div aria-busy="true" aria-label="Loading website">
            <Skeleton className="h-4 w-56 max-w-full" />
          </div>
        ) : q.error && !q.data ? (
          <Banner tone="danger" action={<Button variant="secondary" size="sm" onClick={() => void q.refetch()}>Try again</Button>}>
            Couldn’t load the website.
          </Banner>
        ) : editing ? (
          <form
            aria-label="Edit website"
            className="flex flex-col gap-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              void onSave()
            }}
          >
            {stale ? (
              <Banner tone="attention" role="status" title="Someone changed this while you were editing">
                The latest is now {website ? <b className="break-all">{website}</b> : 'empty'}. Your change is kept below. Save again to use it.
              </Banner>
            ) : null}
            <LaField label="Website" htmlFor="brand-website" hint={WEBSITE_HINT} error={fieldError} submitCount={submitted} confirmFix>
              <Input
                id="brand-website"
                name="website"
                type="url"
                inputMode="url"
                autoComplete="url"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="https://yourbrand.in"
                maxLength={WEBSITE_MAX + 50}
                value={draft}
                disabled={save.isPending}
                aria-invalid={fieldError ? true : undefined}
                aria-describedby={fieldHintId('brand-website')}
                onChange={(e) => {
                  setDraft(e.target.value)
                  setServerError(null)
                }}
              />
            </LaField>
            {error ? (
              <Banner tone="danger" role="alert" title="Couldn’t save the website">
                {isApiError(error) ? error.message : 'Something went wrong. Try again.'}
                {isApiError(error) ? <ReferenceId id={error.correlationId} className="mt-1" /> : null}
              </Banner>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={stop} disabled={save.isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={save.isPending} data-testid="website-save">
                {save.isPending ? <Spinner data-icon="inline-start" aria-hidden /> : null}
                {save.isPending ? 'Saving…' : 'Save website'}
              </Button>
            </div>
          </form>
        ) : website ? (
          <p className="text-small break-all text-ink" data-testid="brand-website-value">
            {website}
          </p>
        ) : (
          <p className="text-small text-ink-2">Not set. {canEdit ? 'Add it if your brand has one.' : 'An owner or admin can add it.'}</p>
        )}
      </div>
    </LaCard>
  )
}
