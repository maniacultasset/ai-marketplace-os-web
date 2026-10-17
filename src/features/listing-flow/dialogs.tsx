/**
 * Review dialogs (p13): "Send back with a note" (reject, optionally rewrite with the note) and
 * "Edit" (a human edit creates a new version; the editor can no longer approve it).
 */
import { useRef, useState } from 'react'
import { describeError, isApiError } from '@/api/errors'
import { useIntentKey } from '@/api/idempotency'
import type { Versioned } from '@/api/etag'
import { fieldHintId, LaField } from '@/components/la'
import { ReferenceId } from '@/components/states/reference-id'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useReviewListings, useSaveContent } from '@/features/listings/api'
import { REJECT_REASONS, summarizeBatch, type BatchItemResult, type ListingDetail, type RejectReason } from '@/features/listings/model'
import { codePoints, focusFirstInvalid } from '@/lib/validation'
import {
  BULLETS_MAX,
  DESCRIPTION_MAX,
  FEEDBACK_MAX,
  TITLE_MAX,
  editToContent,
  sendBackItem,
  splitBullets,
  validateEdit,
  validateSendBack,
  type EditDraft,
  type SendBackInput,
} from './review-model'

type Touched<K extends string> = Partial<Record<K, boolean>>

/** Like react-hook-form's onTouched: a field's error shows after it is left or the form is submitted, then tracks every change. */
function shownErrors<K extends string>(all: Partial<Record<K, string>>, touched: Touched<K>, submits: number): Partial<Record<K, string>> {
  if (submits > 0) return all
  const out: Partial<Record<K, string>> = {}
  for (const k of Object.keys(all) as K[]) if (touched[k]) out[k] = all[k]
  return out
}

/** Focus the first invalid control once the error state has rendered. */
const focusAfterRender = (root: HTMLElement | null) => {
  requestAnimationFrame(() => focusFirstInvalid(root))
}

export function SendBackDialog({
  open,
  onOpenChange,
  listing,
  marketplaceName,
  onDone,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  listing: Pick<ListingDetail, 'id' | 'current_version_id'>
  marketplaceName: string
  onDone: (item: BatchItemResult, rewrite: boolean) => void
}) {
  const review = useReviewListings()
  const key = useIntentKey()
  const [v, setV] = useState<SendBackInput>({ reason: '', note: '', rewrite: true })
  const [touched, setTouched] = useState<Touched<'reason' | 'note'>>({})
  const [submits, setSubmits] = useState(0)
  const [refusal, setRefusal] = useState<{ message: string; ref: string | null } | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const errors = shownErrors(validateSendBack(v), touched, submits)

  function submit() {
    setSubmits((n) => n + 1)
    if (Object.keys(validateSendBack(v)).length) return focusAfterRender(bodyRef.current)
    setRefusal(null)
    review.mutate(
      { items: [sendBackItem(listing, v)], key: key.get() },
      {
        onSuccess: (res) => {
          key.reset()
          const out = summarizeBatch(res)
          const failed = out.failed[0]
          if (failed) setRefusal({ message: failed.message, ref: failed.requestId })
          else if (out.ok[0]) onDone(out.ok[0], v.rewrite)
        },
        onError: (e) => {
          if (isApiError(e) && !e.isNetwork) key.reset()
          setRefusal({ message: describeError(e), ref: isApiError(e) ? e.correlationId : null })
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send back with a note</DialogTitle>
          <DialogDescription>
            The {marketplaceName} listing is not approved. Your note goes to the agent and stays in the listing’s history.
          </DialogDescription>
        </DialogHeader>
        <div ref={bodyRef} className="flex flex-col gap-4">
          <LaField label="Reason" htmlFor="sendback-reason" error={errors.reason} submitCount={submits} confirmFix>
            <Select
              name="reason"
              value={v.reason}
              onValueChange={(r) => setV((s) => ({ ...s, reason: r as RejectReason }))}
              // Closing the list without a choice counts as leaving the field.
              onOpenChange={(o) => !o && setTouched((t) => ({ ...t, reason: true }))}
            >
              <SelectTrigger
                id="sendback-reason"
                className="w-full"
                aria-invalid={!!errors.reason}
                aria-describedby={fieldHintId('sendback-reason')}
              >
                <SelectValue placeholder="Choose a reason" />
              </SelectTrigger>
              <SelectContent>
                {REJECT_REASONS.map((r) => (
                  <SelectItem key={r.code} value={r.code}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </LaField>
          <LaField
            label="Note"
            htmlFor="sendback-note"
            error={errors.note}
            hint={`${codePoints(v.note.trim()).toLocaleString()} / ${FEEDBACK_MAX.toLocaleString()}`}
            submitCount={submits} confirmFix
          >
            <Textarea
              id="sendback-note"
              name="note"
              rows={4}
              value={v.note}
              autoComplete="off"
              aria-invalid={!!errors.note}
              aria-describedby={fieldHintId('sendback-note')}
              placeholder="Say what is wrong and what it should say instead."
              onChange={(e) => setV((s) => ({ ...s, note: e.target.value }))}
              onBlur={() => setTouched((t) => ({ ...t, note: true }))}
            />
          </LaField>
          <label className="flex items-start gap-2.5 text-body text-ink">
            <Checkbox checked={v.rewrite} onCheckedChange={(c) => setV((s) => ({ ...s, rewrite: c === true }))} className="mt-0.5" />
            <span>
              Ask the agent to rewrite it with this note
              <span className="block text-small text-ink-2">
                {v.rewrite ? 'A new version comes back for review. You become its maker, so someone else approves it.' : 'The listing stays blocked until someone edits or regenerates it.'}
              </span>
            </span>
          </label>
          {refusal ? (
            <p role="alert" className="text-small font-semibold text-danger">
              {refusal.message} <ReferenceId id={refusal.ref} className="ml-1 font-normal" />
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" disabled={review.isPending} onClick={submit} data-testid="send-back-submit">
            {review.isPending ? 'Sending back…' : 'Send back'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function EditDialog({
  open,
  onOpenChange,
  listing,
  etag,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  listing: ListingDetail
  etag: string | null
  onSaved: (next: Versioned<ListingDetail>) => void
}) {
  const save = useSaveContent(listing.id)
  const c = listing.content?.content
  const [d, setD] = useState<EditDraft>({ title: c?.title ?? '', bullets: (c?.bullets ?? []).join('\n'), description: c?.description ?? '' })
  const [touched, setTouched] = useState<Touched<keyof EditDraft>>({})
  const [submits, setSubmits] = useState(0)
  const [refusal, setRefusal] = useState<{ message: string; ref: string | null } | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const errors = shownErrors(validateEdit(d), touched, submits)
  const touch = (k: keyof EditDraft) => () => setTouched((t) => ({ ...t, [k]: true }))
  const bulletCount = splitBullets(d.bullets).length

  function submit() {
    setSubmits((n) => n + 1)
    if (Object.keys(validateEdit(d)).length) return focusAfterRender(bodyRef.current)
    setRefusal(null)
    save.mutate(
      { body: { content: editToContent(d) }, etag },
      {
        onSuccess: (next) => onSaved(next),
        onError: (e) =>
          setRefusal({
            message:
              isApiError(e) && e.type === 'STALE_VERSION'
                ? 'Someone changed this listing while you were editing. Close this, read the new version, and edit again.'
                : describeError(e),
            ref: isApiError(e) ? e.correlationId : null,
          }),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit the listing text</DialogTitle>
          <DialogDescription>
            Saving creates a new version and runs the checks on it again. Because you edited it, someone else must approve it.
          </DialogDescription>
        </DialogHeader>
        <div ref={bodyRef} className="flex flex-col gap-4">
          <LaField
            label="Title"
            htmlFor="edit-title"
            error={errors.title}
            hint={`${codePoints(d.title.trim()).toLocaleString()} / ${TITLE_MAX.toLocaleString()}`}
            submitCount={submits} confirmFix
          >
            <Input
              id="edit-title"
              name="title"
              value={d.title}
              autoComplete="off"
              aria-invalid={!!errors.title}
              aria-describedby={fieldHintId('edit-title')}
              onChange={(e) => setD((s) => ({ ...s, title: e.target.value }))}
              onBlur={touch('title')}
            />
          </LaField>
          <LaField
            label="Bullets"
            htmlFor="edit-bullets"
            error={errors.bullets}
            hint={`One bullet per line, up to ${BULLETS_MAX} (${bulletCount} / ${BULLETS_MAX}).`}
            submitCount={submits} confirmFix
          >
            <Textarea
              id="edit-bullets"
              name="bullets"
              rows={6}
              value={d.bullets}
              autoComplete="off"
              aria-invalid={!!errors.bullets}
              aria-describedby={fieldHintId('edit-bullets')}
              onChange={(e) => setD((s) => ({ ...s, bullets: e.target.value }))}
              onBlur={touch('bullets')}
            />
          </LaField>
          <LaField
            label="Description"
            htmlFor="edit-description"
            error={errors.description}
            hint={`${codePoints(d.description.trim()).toLocaleString()} / ${DESCRIPTION_MAX.toLocaleString()}`}
            submitCount={submits} confirmFix
          >
            <Textarea
              id="edit-description"
              name="description"
              rows={6}
              value={d.description}
              autoComplete="off"
              aria-invalid={!!errors.description}
              aria-describedby={fieldHintId('edit-description')}
              onChange={(e) => setD((s) => ({ ...s, description: e.target.value }))}
              onBlur={touch('description')}
            />
          </LaField>
          {refusal ? (
            <p role="alert" className="text-small font-semibold text-danger">
              {refusal.message} <ReferenceId id={refusal.ref} className="ml-1 font-normal" />
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" disabled={save.isPending} onClick={submit}>
            {save.isPending ? 'Saving…' : 'Save as new version'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
