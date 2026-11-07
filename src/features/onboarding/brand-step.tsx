/**
 * Setup step 1, "Brand and business" (hi-fi 02).
 *
 * Saved through PATCH /tenants/me (If-Match: the ETag from GET; backend routers/tenants.py,
 * schemas/tenants.py TenantPatch). TenantOut/TenantPatch carry `name`, `tone`, `guidelines` and
 * `glossary` only, so the step asks for just two things:
 *   Brand name   → `name`  (autosaves on blur)
 *   Brand voice  → `tone`  (autosaves on blur; this is what the agent writes in)
 * The design's legal name, business type, website, logo, description and "Read my site" have no
 * API and no V1 use, so they are not shown.
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
import { IconTile } from '@/components/la/icons'
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
import { savedClock } from './model'
import { SetupBody, SetupColumns, SetupFooter, SetupHeading } from './setup-frame'

type SaveSource = 'blur' | 'explicit'

/** Read-only look for a value the viewer cannot change: muted fill and text, no hover cue. */
const READ_ONLY_CONTROL = 'bg-subtle text-ink-2 border-line shadow-none cursor-default'

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
    if (ok) await navigate({ to: '/setup/manufacturer' })
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
              <SetupHeading title="Tell us about your brand once" sub="Your brand name and how listings should sound. We reuse them on every product." />

              {stale ? (
                <div id="setup-stale" tabIndex={-1} className="rounded-banner outline-none">
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
                <Banner tone="neutral" icon="lock" title="Only owners and admins can change the brand profile">
                  You can look through setup. Ask an owner or admin to fill it in.
                </Banner>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2">
                <LaField
                  label="Brand name"
                  htmlFor="brand-name"
                  hint="Exactly as customers see it. Marketplaces match on this."
                  error={err('name')}
                  submitCount={attempts}
                  confirmFix
                  source={canEdit && touched.has('name') && draft.name.trim() ? { kind: 'you' } : undefined}
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
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-3 w-56" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-3 w-72" />
            </div>
          </LaCard>
        }
        aside={<Skeleton className="h-28 w-full rounded-card" />}
      />
    </SetupBody>
  )
}
