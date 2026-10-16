/**
 * Brand profile: GET /tenants/me (with ETag) -> edit -> PATCH /tenants/me (If-Match).
 * 409 STALE_VERSION: re-read, rebase the user's own changes on the newer profile, show what the
 * other person changed, and let the user save again. Never retried automatically.
 */
import { useQueryClient } from '@tanstack/react-query'
import { useBlocker } from '@tanstack/react-router'
import { AlertTriangle, Lock, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { STALE_VERSION_COPY, isStaleVersion, type Versioned } from '@/api/etag'
import { isApiError } from '@/api/errors'
import { StickyActions } from '@/components/app/page-header'
import { ReferenceId } from '@/components/states/reference-id'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { useKeys } from '@/lib/query-keys'
import { toast, toastError } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { fetchProfile, useSaveProfile } from './api'
import {
  buildPatch,
  changedFields,
  FIELD_LABEL,
  mapServerErrors,
  NAME_MAX,
  normalize,
  previewField,
  rebase,
  takeField,
  toDraft,
  TONE_MAX,
  validateDraft,
  valuesOf,
  type ProfileDraft,
  type ProfileErrors,
  type ProfileField,
  type TenantOut,
} from './profile-model'
import { TenantStatusBadge } from './tenant-status'
import { GlossaryEditor, GuidelinesEditor } from './voice-fields'

interface StaleState {
  theirs: ProfileField[]
  conflicts: ProfileField[]
  correlationId: string | null
}

export function ProfileEditor({ profile, canEdit }: { profile: Versioned<TenantOut>; canEdit: boolean }) {
  const keys = useKeys()
  const qc = useQueryClient()
  const save = useSaveProfile()
  const [baseline, setBaseline] = useState(profile)
  const [draft, setDraft] = useState<ProfileDraft>(() => toDraft(profile.data))
  const [submitted, setSubmitted] = useState(false)
  const [serverErrors, setServerErrors] = useState<ProfileErrors>({})
  const [stale, setStale] = useState<StaleState | null>(null)

  const dirtyFields = useMemo(() => changedFields(valuesOf(baseline.data), normalize(draft)), [baseline, draft])
  const dirty = dirtyFields.length > 0

  // A newer profile arrived (refetch on focus, another tab): adopt it unless the user is editing.
  useEffect(() => {
    if (profile.etag === baseline.etag && profile.data === baseline.data) return
    if (dirty) return
    setBaseline(profile)
    setDraft(toDraft(profile.data))
    setStale(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to a new server profile
  }, [profile])

  const clientErrors = useMemo(() => validateDraft(draft), [draft])
  const errors: ProfileErrors = submitted ? { ...serverErrors, ...clientErrors } : serverErrors
  const errorCount = Object.keys(errors).length

  const edit = (next: Partial<ProfileDraft>) => {
    setDraft((d) => ({ ...d, ...next }))
    if (Object.keys(serverErrors).length) setServerErrors({})
  }

  const discard = useCallback(() => {
    setDraft(toDraft(baseline.data))
    setSubmitted(false)
    setServerErrors({})
    setStale(null)
  }, [baseline])

  const onSave = useCallback(() => {
    if (!canEdit || save.isPending) return
    setSubmitted(true)
    if (Object.keys(validateDraft(draft)).length) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-brand-form] [aria-invalid="true"]')?.focus())
      return
    }
    const body = buildPatch(baseline.data, draft)
    if (!body) return
    const voiceChanged = body.tone !== undefined || body.guidelines !== undefined || body.glossary !== undefined
    save.mutate(
      { body, etag: baseline.etag },
      {
        onSuccess: (next) => {
          setBaseline(next)
          setDraft(toDraft(next.data))
          setSubmitted(false)
          setServerErrors({})
          setStale(null)
          toast.success('Brand profile saved', {
            description: voiceChanged ? 'New listings use the updated voice once it has been processed.' : undefined,
          })
        },
        onError: async (failure) => {
          const err: unknown = failure
          if (isStaleVersion(err)) {
            try {
              const latest = await qc.fetchQuery({ queryKey: keys.brand.profile(), queryFn: fetchProfile, staleTime: 0 })
              const r = rebase(baseline.data, latest.data, draft)
              setBaseline(latest)
              setDraft(r.draft)
              setStale({ theirs: r.theirs, conflicts: r.conflicts, correlationId: err.correlationId })
              requestAnimationFrame(() => document.getElementById('stale-banner')?.focus())
            } catch (e) {
              toastError(e, 'Couldn’t load the latest version')
            }
            return
          }
          if (isApiError(err) && err.status === 422) {
            const { errors: mapped, unmapped } = mapServerErrors(err.details, draft)
            setServerErrors(mapped)
            if (unmapped.length || !Object.keys(mapped).length) toastError(err, 'Couldn’t save the brand profile')
            return
          }
          toastError(err, 'Couldn’t save the brand profile')
        },
      },
    )
  }, [baseline, canEdit, draft, keys, qc, save])

  // ⌘S / Ctrl+S saves.
  useEffect(() => {
    if (!canEdit) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        onSave()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canEdit, onSave])

  const blocker = useBlocker({
    shouldBlockFn: () => canEdit && dirty && !save.isPending,
    enableBeforeUnload: () => canEdit && dirty,
    withResolver: true,
  })

  const t = baseline.data
  const changedByOthers = (f: ProfileField) => !!stale?.theirs.includes(f)

  return (
    <form
      data-brand-form
      className="flex flex-col gap-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        onSave()
      }}
    >
      {stale ? (
        <StaleBanner
          stale={{ ...stale, conflicts: stale.conflicts.filter((f) => dirtyFields.includes(f)) }}
          latest={t}
          onUseLatest={(f) => setDraft((d) => takeField(d, t, f))}
          onDiscard={discard}
          onDismiss={() => setStale(null)}
        />
      ) : null}

      {errors.profile ? (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-destructive/5 p-3 text-sm text-destructive ring-1 ring-destructive/25">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {errors.profile}
        </p>
      ) : null}

      <Card className="gap-0 py-0">
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
          <div className="space-y-1">
            <h2 className="text-[0.9375rem] font-semibold tracking-tight">Profile</h2>
            {!canEdit ? (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground" data-testid="brand-readonly">
                <Lock className="size-3.5" aria-hidden />
                Only owners and admins can change the brand profile.
              </p>
            ) : null}
          </div>
          <dl className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">Slug</dt>
              <dd>
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground/80" data-testid="brand-slug">
                  {t.slug}
                </code>
              </dd>
            </div>
            <div>
              <dt className="sr-only">Status</dt>
              <dd>
                <TenantStatusBadge status={t.status} />
              </dd>
            </div>
          </dl>
        </div>
        <div className="px-5 pt-4 pb-5">
          <FieldBlock
            id="brand-name"
            label={FIELD_LABEL.name}
            error={errors.name}
            changedByOthers={changedByOthers('name')}
            counter={canEdit ? { value: draft.name.trim().length, max: NAME_MAX } : undefined}
          >
            {canEdit ? (
              <Input
                id="brand-name"
                value={draft.name}
                maxLength={NAME_MAX * 2}
                autoComplete="organization"
                aria-invalid={!!errors.name || undefined}
                aria-describedby={errors.name ? 'brand-name-err' : undefined}
                onChange={(e) => edit({ name: e.target.value })}
              />
            ) : (
              <p className="text-sm font-medium" id="brand-name">
                {t.name}
              </p>
            )}
          </FieldBlock>
        </div>
      </Card>

      <Card className="gap-0 py-0">
        <div className="space-y-1 px-5 pt-5">
          <h2 className="text-[0.9375rem] font-semibold tracking-tight">Voice</h2>
          <p className="text-sm text-muted-foreground">Every generated listing follows this tone, these guidelines and this glossary.</p>
        </div>

        <section className="px-5 pt-4 pb-5">
          <FieldBlock
            id="brand-tone"
            label={FIELD_LABEL.tone}
            hint="How the brand sounds, in a few sentences."
            error={errors.tone}
            changedByOthers={changedByOthers('tone')}
            counter={canEdit ? { value: draft.tone.trim().length, max: TONE_MAX } : undefined}
          >
            {canEdit ? (
              <Textarea
                id="brand-tone"
                value={draft.tone}
                rows={3}
                maxLength={TONE_MAX * 2}
                placeholder="e.g. Warm, plain and factual. Short sentences, no hype."
                className="min-h-20"
                aria-invalid={!!errors.tone || undefined}
                aria-describedby={errors.tone ? 'brand-tone-err' : 'brand-tone-hint'}
                onChange={(e) => edit({ tone: e.target.value })}
              />
            ) : (
              <ReadText value={t.tone} empty="No tone set." />
            )}
          </FieldBlock>
        </section>

        <section className="border-t px-5 py-5" aria-labelledby="brand-guidelines">
          <SectionHead id="brand-guidelines" label={FIELD_LABEL.guidelines} hint="Rules every listing must follow." changedByOthers={changedByOthers('guidelines')} />
          {canEdit ? (
            <GuidelinesEditor rows={draft.guidelines} errors={errors} onChange={(guidelines) => edit({ guidelines })} />
          ) : t.guidelines?.length ? (
            <ol className="list-decimal space-y-1.5 pl-5 text-sm marker:text-muted-foreground">
              {t.guidelines.map((g, i) => (
                <li key={i}>{g}</li>
              ))}
            </ol>
          ) : (
            <ReadText value={null} empty="No guidelines." />
          )}
        </section>

        <section className="border-t px-5 py-5" aria-labelledby="brand-glossary">
          <SectionHead id="brand-glossary" label={FIELD_LABEL.glossary} hint="Words to avoid, and what to say instead." changedByOthers={changedByOthers('glossary')} />
          {canEdit ? (
            <GlossaryEditor rows={draft.glossary} errors={errors} onChange={(glossary) => edit({ glossary })} />
          ) : Object.keys(t.glossary ?? {}).length ? (
            <dl className="divide-y rounded-lg ring-1 ring-border">
              {Object.entries(t.glossary ?? {}).map(([avoid, use]) => (
                <div key={avoid} className="grid grid-cols-2 gap-3 px-3 py-2 text-sm">
                  <dt className="text-muted-foreground line-through decoration-muted-foreground/40">{avoid}</dt>
                  <dd>{use}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <ReadText value={null} empty="No glossary terms." />
          )}
        </section>
      </Card>

      {canEdit ? (
        <StickyActions className="justify-between">
          <p className="text-sm text-muted-foreground" aria-live="polite" data-testid="brand-save-status">
            {submitted && errorCount
              ? `Fix ${errorCount} ${errorCount === 1 ? 'field' : 'fields'} to save`
              : dirty
                ? `Unsaved: ${dirtyFields.map((f) => FIELD_LABEL[f].toLowerCase()).join(', ')}`
                : 'All changes saved'}
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={discard} disabled={!dirty || save.isPending}>
              Discard
            </Button>
            <Button type="submit" disabled={!dirty || save.isPending}>
              {save.isPending ? <Spinner data-icon="inline-start" /> : null}
              {save.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </StickyActions>
      ) : null}

      <AlertDialog open={blocker.status === 'blocked'} onOpenChange={(o) => !o && blocker.reset?.()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>Your changes to the brand profile have not been saved.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>Keep editing</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => blocker.proceed?.()}>
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  )
}

function FieldBlock({
  id,
  label,
  hint,
  error,
  counter,
  changedByOthers,
  children,
}: {
  id: string
  label: string
  hint?: string
  error?: string
  counter?: { value: number; max: number }
  changedByOthers?: boolean
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-end justify-between gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor={id} className="text-sm font-medium">
            {label}
          </label>
          {changedByOthers ? <UpdatedBadge /> : null}
        </div>
        {counter ? (
          <span className={cn('text-xs tabular-nums', counter.value > counter.max ? 'text-destructive' : 'text-muted-foreground')}>
            {counter.value.toLocaleString()} / {counter.max.toLocaleString()}
          </span>
        ) : null}
      </div>
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {children}
      {error ? (
        <p id={`${id}-err`} className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function SectionHead({ id, label, hint, changedByOthers }: { id: string; label: string; hint: string; changedByOthers: boolean }) {
  return (
    <div className="mb-3 space-y-0.5">
      <div className="flex items-center gap-2">
        <h3 id={id} className="text-sm font-medium">
          {label}
        </h3>
        {changedByOthers ? <UpdatedBadge /> : null}
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}

function UpdatedBadge() {
  return (
    <Badge variant="warning" className="h-[1.125rem] px-1.5 text-[0.6875rem]">
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      Updated by someone else
    </Badge>
  )
}

function ReadText({ value, empty }: { value: string | null | undefined; empty: string }) {
  return value ? (
    <p className="text-sm leading-relaxed whitespace-pre-wrap">{value}</p>
  ) : (
    <p className="text-sm text-muted-foreground">{empty}</p>
  )
}

function StaleBanner({
  stale,
  latest,
  onUseLatest,
  onDiscard,
  onDismiss,
}: {
  stale: StaleState
  latest: TenantOut
  onUseLatest: (f: ProfileField) => void
  onDiscard: () => void
  onDismiss: () => void
}) {
  return (
    <section
      id="stale-banner"
      tabIndex={-1}
      role="alert"
      data-testid="stale-banner"
      className="space-y-3 rounded-xl bg-warning/5 p-4 ring-1 ring-warning/30 outline-none dark:bg-warning/10"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="text-sm font-semibold">{STALE_VERSION_COPY.title}</h2>
          <p className="text-sm text-muted-foreground">
            {STALE_VERSION_COPY.description} Your edits are kept; saving applies only the fields you changed.
          </p>
          {stale.theirs.length ? (
            <p className="text-sm">
              <span className="text-muted-foreground">They changed: </span>
              {stale.theirs.map((f) => FIELD_LABEL[f]).join(', ')}
            </p>
          ) : null}
        </div>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Dismiss" onClick={onDismiss}>
          <X />
        </Button>
      </div>
      {stale.conflicts.length ? (
        <ul className="space-y-2 pl-7">
          {stale.conflicts.map((f) => (
            <li key={f} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-card px-3 py-2 ring-1 ring-border">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-muted-foreground">{FIELD_LABEL[f]}: you both changed this. Latest saved:</p>
                <p className="truncate text-sm" title={previewField(f, latest)}>
                  {previewField(f, latest)}
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => onUseLatest(f)}>
                Use latest
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2 pl-7">
        <ReferenceId id={stale.correlationId} />
        <Button type="button" variant="ghost" size="sm" onClick={onDiscard}>
          Discard my changes
        </Button>
      </div>
    </section>
  )
}
