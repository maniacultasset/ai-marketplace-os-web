/**
 * "Tell Kuinn about your brand" (client feedback item 19): the read-back of the seller's brand
 * voice answers and the way into the questionnaire (VoiceQuestionnaire).
 *
 * GET /brand-profile (shared cache with the manufacturer card) -> PATCH /brand-profile
 * `{ brand_description, brand_voice }` with If-Match = the ETag the questionnaire opened from
 * (never a newer one a background refetch brought: that would silently overwrite). 409
 * STALE_VERSION: the latest is loaded, the answers in the dialog are kept, and Save sends them
 * again. Owners and admins edit (settings:manage); everyone else reads.
 *
 * `variant="section"`: a section inside the Brand page's Voice card. `variant="setup"`: a card in
 * setup step 1 with "Do this later", which folds it to one line (it stays on the Brand page).
 */
import { useState } from 'react'
import { isStaleVersion } from '@/api/etag'
import { Banner, CardHead, LaCard } from '@/components/la'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useBrandManufacturer, useSaveBrandManufacturer } from '@/features/products/api'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { FACTS_WIN_COPY, VoiceQuestionnaire, VoiceSummaryList } from './voice-questionnaire'
import { isDraftEmpty, sameAsSaved, toVoiceBody, toVoiceDraft, voiceSummary, type VoiceDraft, type VoiceStepId } from './voice-model'

export const VOICE_TITLE = 'Tell Kuinn about your brand'

export function BrandVoiceCard({ canEdit, variant = 'section' }: { canEdit: boolean; variant?: 'section' | 'setup' }) {
  const q = useBrandManufacturer()
  const save = useSaveBrandManufacturer()
  const [open, setOpen] = useState(false)
  const [startAt, setStartAt] = useState<VoiceStepId>('about')
  const [etag, setEtag] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [stale, setStale] = useState(false)
  const [later, setLater] = useState(false)
  // The answers the dialog holds across a stale reload (the dialog re-mounts from this).
  const [pending, setPending] = useState<VoiceDraft | null>(null)

  const saved = toVoiceDraft(q.data?.data)
  const lines = voiceSummary(saved)
  const empty = isDraftEmpty(saved)

  const start = (at: VoiceStepId = 'about') => {
    setEtag(q.data?.etag ?? null)
    setStartAt(at)
    setError(null)
    setStale(false)
    setPending(null)
    setOpen(true)
  }

  const onSave = async (draft: VoiceDraft) => {
    setError(null)
    setPending(draft)
    if (!stale && sameAsSaved(draft, saved)) {
      setOpen(false)
      return
    }
    try {
      await save.mutateAsync({ body: toVoiceBody(draft), etag })
      setOpen(false)
      setStale(false)
      setLater(false)
      toast.success('Brand answers saved', { description: 'Product facts always win.' })
    } catch (err) {
      if (isStaleVersion(err)) {
        const fresh = await q.refetch()
        if (!fresh.data) {
          setError(fresh.error ?? err)
          return
        }
        setEtag(fresh.data.etag)
        setStale(true)
        setStartAt('summary')
        return
      }
      setError(err)
    }
  }

  const body = q.isPending ? (
    <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading your brand answers">
      <Skeleton className="h-4 w-56" />
      <Skeleton className="h-4 w-72 max-w-full" />
    </div>
  ) : q.error && !q.data ? (
    <Banner tone="danger" action={<Button type="button" variant="secondary" size="sm" onClick={() => void q.refetch()}>Try again</Button>}>
      Couldn’t load your brand answers.
    </Banner>
  ) : empty ? (
    <div className="flex flex-col gap-3">
      <p className="text-small text-ink-2">
        {canEdit
          ? 'A few short questions: who buys it, your price level, what sets you apart, and the words and claims to stay away from. Each one is optional.'
          : 'Not answered yet. An owner or admin can fill it in.'}
      </p>
      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant={variant === 'setup' ? 'primary' : 'secondary'} onClick={() => start()} data-testid="voice-start">
            Answer the questions
          </Button>
          {variant === 'setup' ? (
            <Button type="button" variant="ghost" onClick={() => setLater(true)} data-testid="voice-later">
              Do this later
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  ) : (
    <div className="flex flex-col gap-3">
      <p className="text-small font-semibold text-ink">How Kuinn will write for you</p>
      <VoiceSummaryList lines={lines} onChange={canEdit ? (s) => start(s) : undefined} />
    </div>
  )

  const dialog = canEdit ? (
    <VoiceQuestionnaire
      // a stale reload re-mounts the steps on the summary with the seller's own answers
      key={`${startAt}-${stale ? 'stale' : 'fresh'}`}
      open={open}
      initial={pending ?? saved}
      startAt={startAt}
      saving={save.isPending}
      error={error}
      stale={stale}
      onSave={(d) => void onSave(d)}
      onClose={() => setOpen(false)}
    />
  ) : null

  if (variant === 'setup' && later && empty)
    return (
      <LaCard pad="sm" emphasis="tint" data-testid="voice-later-note">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-small text-ink-2">Skipped for now. You can answer anytime on the Brand page.</p>
          <Button type="button" variant="link" size="sm" onClick={() => start()}>
            Answer now
          </Button>
        </div>
        {dialog}
      </LaCard>
    )

  const action =
    canEdit && !empty && q.data ? (
      <Button type="button" variant="secondary" size="sm" onClick={() => start('summary')} data-testid="voice-edit">
        Edit answers
      </Button>
    ) : null

  if (variant === 'setup')
    return (
      <LaCard data-testid="brand-voice-card" className="flex flex-col gap-4">
        <CardHead icon="spark" iconTone="brand" title={VOICE_TITLE} sub={FACTS_WIN_COPY} action={action} />
        {body}
        {dialog}
      </LaCard>
    )

  return (
    <section aria-labelledby="brand-voice-title" data-testid="brand-voice-card" className={cn('flex flex-col gap-3')}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 id="brand-voice-title" className="text-sm font-medium">
            {VOICE_TITLE}
          </h3>
          <p className="text-xs text-muted-foreground">{FACTS_WIN_COPY}</p>
        </div>
        {action}
      </div>
      {body}
      {dialog}
    </section>
  )
}
