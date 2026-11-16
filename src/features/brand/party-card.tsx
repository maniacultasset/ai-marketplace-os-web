/**
 * Brand profile > a brand party (manufacturer, marketer, packer or importer): the default every
 * product inherits, set once (GET /brand-profile with its ETag -> PATCH /brand-profile with
 * If-Match, settings:manage, `default_<role>`). A product overrides it only when it differs
 * (product form, "Different for this product").
 * 409 STALE_VERSION: the latest is loaded, the person's draft is kept, and they save again.
 * The save tells `onSaved` the PATCH reply's `affected_listings` (the backend's verdicts).
 */
import { useState } from 'react'
import { isStaleVersion } from '@/api/etag'
import { isApiError } from '@/api/errors'
import { Banner, CardHead, LaCard, SourceBadge } from '@/components/la'
import { ReferenceId } from '@/components/states/reference-id'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import type { AffectedListing, BrandRole } from '@/features/inbox-groups/model'
import { useBrandManufacturer, useSaveBrandManufacturer } from '@/features/products/api'
import { PartyFields } from '@/features/products/intake-fields'
import {
  bodyErrorKey,
  fromPartyOut,
  partyPlace,
  partyProblems,
  toPartyIn,
  type PartyDraft,
  type PartyField,
} from '@/features/products/intake-model'
import { toast } from '@/lib/toast'
import { focusFirstInvalid } from '@/lib/validation'

type RoleCopy = { title: string; sub: string; add: string; removed: string; removeNote: string; id: string }

/** Plain words per party. Only the manufacturer is required to list. */
const PARTY_COPY: Record<BrandRole, RoleCopy> = {
  manufacturer: {
    title: 'Manufacturer',
    sub: 'Set once for the brand. Every product uses it on its label and marketplace listing, unless a product sets its own.',
    add: 'Add manufacturer',
    removed: 'Products without their own manufacturer now have none.',
    removeNote: 'Products that don’t set their own will have no manufacturer, and can’t be listed until they do.',
    id: 'brand-mfr',
  },
  marketer: {
    title: 'Marketer',
    sub: 'The company that markets your products, if not the manufacturer. Set once for the brand, unless a product sets its own.',
    add: 'Add marketer',
    removed: 'Products without their own marketer now have none.',
    removeNote: 'Products that don’t set their own will have no marketer.',
    id: 'brand-marketer',
  },
  packer: {
    title: 'Packer',
    sub: 'The company that packs your products, if not the manufacturer. Set once for the brand, unless a product sets its own.',
    add: 'Add packer',
    removed: 'Products without their own packer now have none.',
    removeNote: 'Products that don’t set their own will have no packer.',
    id: 'brand-packer',
  },
  importer: {
    title: 'Importer',
    sub: 'The company that imports your products, for goods made outside India. Set once for the brand, unless a product sets its own.',
    add: 'Add importer',
    removed: 'Products without their own importer now have none.',
    removeNote: 'Products that don’t set their own will have no importer.',
    id: 'brand-importer',
  },
}

export function BrandPartyCard({
  role,
  canEdit,
  onEditingChange,
  onSaved,
}: {
  role: BrandRole
  canEdit: boolean
  /** Told when the edit form opens and closes, so a page can hold navigation over an unsaved draft. */
  onEditingChange?: (editing: boolean) => void
  /**
   * Told after a save: `set` is false when the party was removed; `affected` is the PATCH reply's
   * `affected_listings` (absent when the backend sends none).
   */
  onSaved?: (set: boolean, affected?: AffectedListing[]) => void
}) {
  const copy = PARTY_COPY[role]
  const bodyKey = `default_${role}` as const
  const lower = copy.title.toLocaleLowerCase('en')
  const q = useBrandManufacturer()
  const save = useSaveBrandManufacturer()
  const [draft, setDraft] = useState<PartyDraft | null>(null)
  const [touched, setTouched] = useState<ReadonlySet<PartyField>>(() => new Set())
  const [submitted, setSubmitted] = useState(0)
  const [serverErrors, setServerErrors] = useState<Partial<Record<PartyField, string>>>({})
  const [stale, setStale] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [formEl, setFormEl] = useState<HTMLElement | null>(null)
  /** The ETag the edit started from: a background refetch must never swap it (silent overwrite). */
  const [etag, setEtag] = useState<string | null>(null)

  const party = q.data?.data[bodyKey] ?? null
  const editing = draft !== null
  const client = draft ? partyProblems(draft) : {}
  const errors: Partial<Record<PartyField, string>> = { ...serverErrors }
  for (const [k, v] of Object.entries(client) as [PartyField, string][]) if (submitted > 0 || touched.has(k)) errors[k] ??= v

  const start = () => {
    setEtag(q.data?.etag ?? null)
    setDraft(fromPartyOut(party))
    setTouched(new Set())
    setSubmitted(0)
    setServerErrors({})
    setStale(false)
    setError(null)
    onEditingChange?.(true)
  }
  const stop = () => {
    setDraft(null)
    setStale(false)
    setError(null)
    onEditingChange?.(false)
  }

  const submit = async (value: ReturnType<typeof toPartyIn> | null) => {
    setError(null)
    try {
      const out = await save.mutateAsync({ body: { [bodyKey]: value }, etag })
      toast.success(value ? `${copy.title} saved` : `${copy.title} removed`, {
        description: value ? 'Every product uses it unless it sets its own.' : copy.removed,
      })
      setConfirmRemove(false)
      stop()
      onSaved?.(!!value, out.data.affected_listings ?? undefined)
    } catch (err) {
      if (isStaleVersion(err)) {
        // Only here does the base move: to the version someone else saved.
        const fresh = await q.refetch()
        if (fresh.data) setEtag(fresh.data.etag)
        else {
          setError(fresh.error ?? err)
          return
        }
        setStale(true)
        setConfirmRemove(false)
        return
      }
      if (isApiError(err) && err.status === 422) {
        const fields: Partial<Record<PartyField, string>> = {}
        let unmapped = false
        for (const d of err.details) {
          const key = bodyErrorKey(d.loc)
          const f = key?.startsWith(`${bodyKey}.`) ? (key.split('.')[1] as PartyField) : null
          if (f) fields[f] = d.msg
          else unmapped = true
        }
        setServerErrors(fields)
        if (unmapped || !Object.keys(fields).length) setError(err)
        requestAnimationFrame(() => focusFirstInvalid(formEl))
        return
      }
      setError(err)
    }
  }

  const onSave = () => {
    if (!draft) return
    setSubmitted((n) => n + 1)
    if (Object.keys(partyProblems(draft)).length) {
      requestAnimationFrame(() => focusFirstInvalid(formEl))
      return
    }
    void submit(toPartyIn(draft))
  }

  return (
    <LaCard id={role} data-testid={`brand-${role}-card`} className="scroll-mt-24 md:scroll-mt-4">
      <CardHead
        icon="store"
        title={copy.title}
        sub={copy.sub}
        action={
          canEdit && !editing && q.data ? (
            <Button variant="secondary" size="sm" onClick={start} data-testid={`${role}-edit`}>
              {party ? 'Edit' : copy.add}
            </Button>
          ) : null
        }
      />
      <div className="mt-4">
        {q.isPending ? (
          <div className="flex flex-col gap-2" aria-busy="true" aria-label={`Loading ${lower}`}>
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </div>
        ) : q.error && !q.data ? (
          <Banner tone="danger" action={<Button variant="secondary" size="sm" onClick={() => void q.refetch()}>Try again</Button>}>
            Couldn’t load the {lower}.
          </Banner>
        ) : editing ? (
          <section ref={setFormEl} aria-label={`Edit ${lower}`} className="flex flex-col gap-4">
            {stale ? (
              <Banner tone="attention" role="status" title="Someone changed this while you were editing">
                The latest is now {party ? <b>{party.legal_name}</b> : 'empty'}. Your changes are kept below. Save again to use them.
              </Banner>
            ) : null}
            <PartyFields
              id={copy.id}
              value={draft}
              onChange={(v) => {
                setDraft(v)
                setServerErrors({})
              }}
              errors={errors}
              onBlur={(k) => setTouched((t) => new Set(t).add(k))}
              submitCount={submitted}
              disabled={save.isPending}
            />
            {error ? (
              <Banner tone="danger" role="alert" title={`Couldn’t save the ${lower}`}>
                {isApiError(error) ? error.message : 'Something went wrong. Try again.'}
                {isApiError(error) ? <ReferenceId id={error.correlationId} className="mt-1" /> : null}
              </Banner>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                {party && !confirmRemove ? (
                  <Button variant="ghost" size="sm" className="-ml-3 text-danger" onClick={() => setConfirmRemove(true)} disabled={save.isPending}>
                    Remove
                  </Button>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={stop} disabled={save.isPending}>
                  Cancel
                </Button>
                <Button onClick={onSave} disabled={save.isPending} data-testid={`${role}-save`}>
                  {save.isPending ? <Spinner data-icon="inline-start" aria-hidden /> : null}
                  {save.isPending ? 'Saving…' : `Save ${lower}`}
                </Button>
              </div>
            </div>
            {confirmRemove ? (
              <Banner
                tone="attention"
                role="alert"
                title={`Remove the brand ${lower}?`}
                action={
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setConfirmRemove(false)} disabled={save.isPending}>
                      Keep it
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => void submit(null)} disabled={save.isPending}>
                      Remove
                    </Button>
                  </div>
                }
              >
                {copy.removeNote}
              </Banner>
            ) : null}
          </section>
        ) : party ? (
          <div className="flex flex-col gap-1 text-small">
            <p className="font-semibold text-ink">{party.legal_name}</p>
            <p className="text-ink-2">{[party.address_line1, party.address_line2].filter(Boolean).join(', ')}</p>
            <p className="text-ink-2">{partyPlace(party)}</p>
            {party.gstin ? <p className="font-mono text-caption text-ink-2">GSTIN {party.gstin}</p> : null}
            <p className="mt-1.5">
              <SourceBadge source={{ kind: 'you' }} />
            </p>
          </div>
        ) : (
          <p className="text-small text-ink-2">
            Not set yet. {canEdit ? 'Add it once and every product uses it.' : 'An owner or admin can add it.'}
          </p>
        )}
      </div>
    </LaCard>
  )
}
