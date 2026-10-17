/**
 * Setup step 1, "Brand and business" (hi-fi 02).
 *
 * Saved through PATCH /tenants/me (If-Match: the ETag from GET; backend routers/tenants.py,
 * schemas/tenants.py TenantPatch). TenantOut/TenantPatch carry `name`, `tone`, `guidelines` and
 * `glossary` only, so:
 *   Brand name   → `name`  (live, autosaves on blur)
 *   Brand voice  → `tone`  (live, autosaves on blur; this is what the agent writes in)
 * Legal business name, extra brand names, "You are the", website, logo and the short description
 * have no API: they render where the design puts them, disabled, under one banner.
 * "Read my site" is Coming soon.
 *
 * STALE_VERSION: re-read, lay this person's own changes on top (profile-model `rebase`), say so,
 * and let them save again. Never retry blindly. While both people changed the same field, blur
 * autosave pauses: only "Save again", "Save and continue" or "Save and exit" send it. Focus moves to
 * the banner only when one of those explicit saves hit the conflict, never from a blur.
 *
 * The "You" source badge shows only on a field this person changed in this session; a value that
 * came from the server (signup, another member) carries no badge, as in the design.
 */
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useCallback, useRef, useState } from 'react'
import { isApiError, type ApiError } from '@/api/errors'
import { isStaleVersion, type Versioned } from '@/api/etag'
import { useSoloExit } from '@/components/app/solo-exit'
import { Banner } from '@/components/la/banner'
import { LaCard } from '@/components/la/cards'
import { fieldHintId, LaField } from '@/components/la/field'
import { CardHead } from '@/components/la/cards'
import { Icon, IconTile } from '@/components/la/icons'
import { ComingSoon, NOT_YET, UnavailableButton } from '@/components/la/unavailable'
import { ReferenceId } from '@/components/states/reference-id'
import { ErrorState } from '@/components/states/error-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { fetchProfile, useBrandProfile, useSaveProfile } from '@/features/brand/api'
import {
  buildPatch,
  FIELD_LABEL,
  fieldLength,
  mapServerErrors,
  NAME_MAX,
  rebase,
  TONE_MAX,
  toDraft,
  validateDraft,
  type ProfileDraft,
  type ProfileErrors,
  type ProfileField,
  type TenantOut,
} from '@/features/brand/profile-model'
import { useCan } from '@/lib/permissions'
import { useKeys } from '@/lib/query-keys'
import { focusFirstInvalid } from '@/lib/validation'
import { cn } from '@/lib/utils'
import { NEEDS_BACKEND, savedClock } from './model'
import { SetupBody, SetupColumns, SetupFooter, SetupHeading } from './setup-frame'

type SaveSource = 'blur' | 'explicit'

/** Read-only look for a value the viewer cannot change: muted fill and text, no hover cue. */
const READ_ONLY_CONTROL = 'bg-subtle text-ink-2 border-line shadow-none cursor-default'

const OWNER_TYPES = ['Brand owner', 'Manufacturer', 'Reseller', 'Distributor', 'Trader'] as const

export function BrandStep() {
  const profile = useBrandProfile()
  if (profile.error && !profile.data) {
    return (
      <SetupBody step={0}>
        <LaCard pad="none">
          <ErrorState error={profile.error} title="Couldn’t load your brand profile" onRetry={() => void profile.refetch()} />
        </LaCard>
      </SetupBody>
    )
  }
  if (!profile.data) return <BrandStepSkeleton />
  return <BrandStepForm initial={profile.data} />
}

type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: Date }
  | { kind: 'error'; error: ApiError | null }

interface Stale {
  theirs: ProfileField[]
  conflicts: ProfileField[]
  correlationId: string | null
}

function BrandStepForm({ initial }: { initial: Versioned<TenantOut> }) {
  const can = useCan()
  const canEdit = can('settings:manage')
  const qc = useQueryClient()
  const keys = useKeys()
  const navigate = useNavigate()
  const save = useSaveProfile()

  const [base, setBase] = useState(initial)
  const [draft, setDraftState] = useState<ProfileDraft>(() => toDraft(initial.data))
  const [errors, setErrors] = useState<ProfileErrors>({})
  const [stale, setStale] = useState<Stale | null>(null)
  const [state, setState] = useState<SaveState>({ kind: 'idle' })
  const [continuing, setContinuing] = useState(false)
  const [touched, setTouched] = useState<ReadonlySet<'name' | 'tone'>>(() => new Set())
  // Explicit saves that ran into a field error: drives LaField's one-off nudge.
  const [attempts, setAttempts] = useState(0)
  const touch = (k: 'name' | 'tone') => setTouched((t) => (t.has(k) ? t : new Set(t).add(k)))

  // Refs so a blur-save and a click-save that race read the newest values and run one at a time.
  const draftRef = useRef(draft)
  const baseRef = useRef(base)
  const chain = useRef<Promise<boolean>>(Promise.resolve(true))
  const staleRef = useRef<Stale | null>(null)
  const setStaleBoth = (v: Stale | null) => {
    staleRef.current = v
    setStale(v)
  }
  const setDraft = (next: (d: ProfileDraft) => ProfileDraft) => {
    setDraftState((d) => {
      const n = next(d)
      draftRef.current = n
      return n
    })
  }
  const setBaseBoth = (v: Versioned<TenantOut>) => {
    baseRef.current = v
    setBase(v)
  }

  const doSave = useCallback(async (source: SaveSource): Promise<boolean> => {
    if (!canEdit) return true
    // Unresolved conflict: the person must look before it is sent, so a blur does not save it.
    if (source === 'blur' && staleRef.current?.conflicts.length) return false
    const current = draftRef.current
    const v = validateDraft(current, baseRef.current.data)
    const local: ProfileErrors = {}
    if (v.name) local.name = v.name
    if (v.tone) local.tone = v.tone
    if (Object.keys(local).length) {
      setErrors(local)
      if (source === 'explicit') setAttempts((n) => n + 1)
      return false
    }
    const body = buildPatch(baseRef.current.data, current)
    if (!body) return true
    setState({ kind: 'saving' })
    try {
      const next = await save.mutateAsync({ body, etag: baseRef.current.etag })
      setBaseBoth(next)
      setErrors({})
      setStaleBoth(null)
      setState({ kind: 'saved', at: new Date() })
      return true
    } catch (err) {
      if (isStaleVersion(err)) {
        try {
          const latest = await qc.fetchQuery({ queryKey: keys.brand.profile(), queryFn: fetchProfile, staleTime: 0 })
          const r = rebase(baseRef.current.data, latest.data, draftRef.current)
          setBaseBoth(latest)
          setDraft(() => r.draft)
          setStaleBoth({ theirs: r.theirs, conflicts: r.conflicts, correlationId: err.correlationId })
          setState({ kind: 'idle' })
          // A blur-save must not pull focus from the field the person just moved to; the banner is
          // role="alert", so it is announced either way.
          if (source === 'explicit')
            requestAnimationFrame(() => {
              const el = document.getElementById('setup-stale')
              el?.scrollIntoView({ block: 'center' })
              el?.focus({ preventScroll: true })
            })
        } catch (e) {
          setState({ kind: 'error', error: isApiError(e) ? e : null })
        }
        return false
      }
      if (isApiError(err) && err.status === 422) {
        const { errors: mapped } = mapServerErrors(err.details, current)
        setErrors(mapped)
        setState(Object.keys(mapped).length ? { kind: 'idle' } : { kind: 'error', error: err })
        return false
      }
      setState({ kind: 'error', error: isApiError(err) ? err : null })
      return false
    }
  }, [canEdit, keys, qc, save])

  const saveNow = useCallback(
    (source: SaveSource = 'explicit') => {
      const run = () => doSave(source)
      chain.current = chain.current.then(run, run)
      return chain.current
    },
    [doSave],
  )

  useSoloExit(() => saveNow('explicit'))

  const onContinue = async () => {
    setContinuing(true)
    const ok = await saveNow('explicit')
    setContinuing(false)
    if (ok) await navigate({ to: '/setup/compliance' })
    else requestAnimationFrame(() => focusFirstInvalid(document.querySelector('[data-setup-form]')))
    // A stale-version banner focuses itself (see doSave).
  }

  const err = (k: 'name' | 'tone') => errors[k]
  // Once a field shows an error, re-check it on every change so it clears the moment it is fixed
  // (and updates if it is wrong in a new way). A field without an error waits for blur or save.
  const recheck = (k: 'name' | 'tone', next: ProfileDraft) => {
    if (!errors[k]) return
    setErrors((x) => ({ ...x, [k]: validateDraft(next, baseRef.current.data)[k] }))
  }
  const dirty = buildPatch(base.data, draft) !== null

  return (
    <>
      <SetupBody step={0}>
        <SetupColumns
          main={
            <LaCard className="flex flex-col gap-4" data-setup-form>
              <SetupHeading title="Tell us about your brand once" sub="We reuse this on every product and marketplace." />

              {stale ? (
                <div id="setup-stale" tabIndex={-1} className="rounded-[10px] outline-none">
                  <Banner tone="attention" role="alert" title="Someone saved a newer version">
                    We loaded it and kept your changes on top
                    {stale.conflicts.length
                      ? `. You both changed ${stale.conflicts.map((f) => FIELD_LABEL[f].toLowerCase()).join(' and ')}: check it, then save again.`
                      : '. Save again to keep them.'}
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <Button size="sm" variant="secondary" onClick={() => void saveNow('explicit')} disabled={state.kind === 'saving'}>
                        Save again
                      </Button>
                      <ReferenceId id={stale.correlationId} />
                    </div>
                  </Banner>
                </div>
              ) : null}

              {!canEdit ? (
                <Banner tone="neutral" icon="shield" title="Only owners and admins can change the brand profile">
                  You can look through setup. Ask an owner or admin to fill it in.
                </Banner>
              ) : null}

              {/* "Read my site": designed, not in the API. */}
              <div className="flex items-start gap-3 rounded-[10px] border border-brand-line bg-brand-bg px-4 py-3 text-brand-ink">
                <IconTile icon="globe" tone="brand" size="sm" className="-mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-bold">
                    Start from your website <ComingSoon />
                  </p>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <Input
                      aria-label="Your website, to read"
                      type="url"
                      inputMode="url"
                      spellCheck={false}
                      placeholder="https://yourbrand.in"
                      disabled
                      className="sm:flex-1"
                      aria-describedby="read-site-reason"
                    />
                    <UnavailableButton reason={NOT_YET.readSite} className="h-10">
                      Read my site
                    </UnavailableButton>
                  </div>
                  <p id="read-site-reason" className="mt-2 text-caption">
                    We will pre-fill what we find and you confirm each field. Until then, fill the fields yourself.
                  </p>
                </div>
              </div>

              <Banner tone="neutral" icon="alert" title="Some fields can’t be saved yet">
                Brand name and brand voice save now. Saving legal name, extra brand names, business type, website, logo
                and description needs a backend update — coming soon.
              </Banner>

              <div className="grid gap-4 md:grid-cols-2">
                <LaField label="Legal business name" htmlFor="legal-name">
                  <Input id="legal-name" autoComplete="organization" disabled placeholder="Your company’s registered name" />
                </LaField>
                <LaField
                  label="Brand name"
                  htmlFor="brand-name"
                  hint="Exactly as customers see it. Marketplaces match on this."
                  error={err('name')}
                  submitCount={attempts}
                  confirmFix
                  source={canEdit && touched.has('name') && draft.name.trim() ? { kind: 'you' } : undefined}
                  hintAction={
                    <UnavailableButton variant="secondary" size="xs" reason={`Adding more brand names: ${NEEDS_BACKEND}`}>
                      <Icon name="plus" size={12} />
                      Add another name
                    </UnavailableButton>
                  }
                  required
                >
                  <Input
                    id="brand-name"
                    name="name"
                    value={draft.name}
                    maxLength={NAME_MAX + 50}
                    readOnly={!canEdit}
                    className={cn(!canEdit && READ_ONLY_CONTROL)}
                    aria-invalid={err('name') ? true : undefined}
                    aria-describedby={fieldHintId('brand-name')}
                    autoComplete="organization"
                    autoCapitalize="words"
                    onChange={(e) => {
                      const v = e.target.value
                      setDraft((d) => ({ ...d, name: v }))
                      touch('name')
                      recheck('name', { ...draftRef.current, name: v })
                    }}
                    onBlur={() => void saveNow('blur')}
                  />
                </LaField>
              </div>

              <fieldset className="min-w-0">
                <legend id="owner-type-label" className="mb-1.5 block text-small font-bold text-ink">
                  You are the
                </legend>
                <div
                  role="radiogroup"
                  aria-labelledby="owner-type-label"
                  aria-disabled
                  aria-describedby="owner-type-hint" className="flex flex-wrap gap-2">
                  {OWNER_TYPES.map((t) => (
                    <span
                      key={t}
                      role="radio"
                      aria-checked={false}
                      aria-disabled
                      className="inline-flex h-10 cursor-not-allowed items-center gap-2 rounded-control border border-dashed border-line-strong bg-subtle px-3.5 text-ink-3"
                    >
                      <span aria-hidden className="size-4 rounded-full border-[1.5px] border-line-strong bg-field shadow-inset-sm" />
                      {t}
                    </span>
                  ))}
                </div>
                <p id="owner-type-hint" className="mt-1.5 text-caption text-ink-3">
                  This decides which proof marketplaces may ask for.
                </p>
              </fieldset>

              <div className="grid gap-4 md:grid-cols-2">
                <LaField label="Brand website" htmlFor="website">
                  <Input id="website" type="url" inputMode="url" autoComplete="url" spellCheck={false} disabled placeholder="https://yourbrand.in" />
                </LaField>
                <div className="min-w-0">
                  <p className="mb-1.5 text-small font-bold text-ink">Logo</p>
                  <div className="flex h-10 items-center gap-3">
                    <span aria-hidden className="inline-flex size-10 items-center justify-center rounded-control border border-dashed border-line-strong bg-subtle text-ink-3">
                      <Icon name="image" size={18} />
                    </span>
                    <UnavailableButton variant="secondary" size="sm" reason={NEEDS_BACKEND}>
                      Upload logo
                    </UnavailableButton>
                  </div>
                </div>
              </div>

              <LaField label="Short brand description" htmlFor="description" hint="Up to 300 characters. Factual, no claims.">
                <Textarea id="description" maxLength={300} disabled placeholder="What you make, in one line" className="min-h-[64px]" />
              </LaField>

              <LaField
                label="Brand voice"
                htmlFor="brand-voice"
                hint={`How listings should sound, for example “warm and plain, no hype”. The agent writes in this voice. ${fieldLength(draft.tone).toLocaleString()} of ${TONE_MAX.toLocaleString()} characters.`}
                error={err('tone')}
                submitCount={attempts}
                confirmFix
                source={canEdit && touched.has('tone') && draft.tone.trim() ? { kind: 'you' } : undefined}
              >
                <Textarea
                  id="brand-voice"
                  name="tone"
                  value={draft.tone}
                  maxLength={TONE_MAX * 2}
                  autoComplete="off"
                  readOnly={!canEdit}
                  className={cn('min-h-[64px]', !canEdit && READ_ONLY_CONTROL)}
                  aria-invalid={err('tone') ? true : undefined}
                  aria-describedby={fieldHintId('brand-voice')}
                  onChange={(e) => {
                    const v = e.target.value
                    setDraft((d) => ({ ...d, tone: v }))
                    touch('tone')
                    recheck('tone', { ...draftRef.current, tone: v })
                  }}
                  onBlur={() => void saveNow('blur')}
                />
              </LaField>
              {errors.profile ? (
                <p role="alert" className="text-small font-semibold text-danger">
                  {errors.profile}
                </p>
              ) : null}
            </LaCard>
          }
          aside={
            <>
              <LaCard pad="sm">
                <CardHead title="What we found on your site" icon="search" />
                <ComingSoon className="mt-3" />
                <p className="mt-2 text-small text-ink-2">
                  Once we can read your site, each value we find shows here with a Check chip until you confirm it.
                  Nothing on this page is filled in for you today.
                </p>
              </LaCard>
              <LaCard emphasis="tint" pad="sm">
                <div className="flex items-start gap-3">
                  <IconTile icon="users" size="sm" />
                  <div className="min-w-0">
                    <h4 className="text-body font-bold text-ink">Working with an agency?</h4>
                    <p className="mt-1 text-small text-ink-2">
                      Each brand keeps its own profile and marketplace accounts. Switch between the brands you belong to
                      from the brand menu.
                    </p>
                  </div>
                </div>
              </LaCard>
            </>
          }
        />
      </SetupBody>
      <SetupFooter status={<SaveStatus state={state} dirty={dirty} canEdit={canEdit} conflict={!!stale?.conflicts.length} />}>
        <UnavailableButton variant="secondary" reason="This is the first setup step. Use Save and exit to leave setup.">
          Back
        </UnavailableButton>
        <Button onClick={() => void onContinue()} disabled={continuing} data-testid="setup-continue">
          {!canEdit ? 'Continue' : continuing ? 'Saving…' : 'Save and continue'}
        </Button>
      </SetupFooter>
    </>
  )
}

function SaveStatus({ state, dirty, canEdit, conflict }: { state: SaveState; dirty: boolean; canEdit: boolean; conflict: boolean }) {
  if (!canEdit) return <>Read only. Nothing on this step is changed.</>
  if (state.kind === 'saving') return <>Saving…</>
  if (conflict) return <>Not saved. Check the field you both changed, then save again.</>
  if (state.kind === 'error')
    return (
      <span role="alert" className="font-semibold text-danger">
        Couldn’t save. Check your connection and try again.
        {state.error?.correlationId ? <ReferenceId id={state.error.correlationId} className="ml-2 inline-flex" /> : null}
      </span>
    )
  if (state.kind === 'saved' && !dirty) return <>Saved automatically · {savedClock(state.at)}</>
  return <>{dirty ? 'Changes save when you leave a field.' : 'Brand name and brand voice save automatically.'}</>
}

function BrandStepSkeleton() {
  return (
    <SetupBody step={0}>
      <SetupColumns
        main={
          <LaCard className="flex flex-col gap-4" aria-busy="true" aria-label="Loading your brand profile">
            <Skeleton className="h-6 w-72" />
            <Skeleton className="h-4 w-80" />
            <Skeleton className="h-[108px] w-full rounded-[10px]" />
            <div className="grid gap-4 md:grid-cols-2">
              {[0, 1].map((i) => (
                <div key={i} className="space-y-1.5">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ))}
            </div>
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-16 w-full" />
          </LaCard>
        }
        aside={<Skeleton className={cn('h-40 w-full rounded-card')} />}
      />
    </SetupBody>
  )
}
