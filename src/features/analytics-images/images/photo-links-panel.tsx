/**
 * G2: what happened to the photo links of the product's spreadsheet, on the Media tab. A quiet
 * panel: the links still downloading, then each failed or skipped link in the server's words with
 * Dismiss (DELETE /photo-links/{id}), and Retry (POST /products/{id}/photo-links/retry) when a
 * retry would download any of them again. Saved links need nothing here: their photos are in the
 * list below, tagged "From your file".
 */
import { useState } from 'react'
import { isApiError } from '@/api/errors'
import { Icon } from '@/components/la/icons'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { photoLinkText } from '@/features/imports/row-errors'
import { useDismissPhotoLink, useRetryProductPhotos } from '@/features/imports/sheet-photos'
import { toast, toastError } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { downloadingText, summarizeLinks, type PhotoLink } from './photo-links'

export function PhotoLinksPanel({
  productId,
  links,
  canAct,
  className,
}: {
  productId: string
  links: readonly PhotoLink[]
  /** Retry and Dismiss (permission product:import). */
  canAct: boolean
  className?: string
}) {
  const { waiting, problems, retryable } = summarizeLinks(links)
  const retry = useRetryProductPhotos(productId)
  const dismiss = useDismissPhotoLink(productId)
  const [retryOff, setRetryOff] = useState(false)
  const [dismissing, setDismissing] = useState<string | null>(null)
  if (!waiting && !problems.length) return null

  const runRetry = () =>
    retry.mutate(undefined, {
      onSuccess: () => toast.success('Downloading the photos again', { description: 'The results show here.' }),
      onError: (err) => {
        if (isApiError(err) && err.status === 501) return setRetryOff(true)
        if (isApiError(err) && err.type === 'INVALID_STATUS_TRANSITION') return void toast.info('No failed photos to retry')
        toastError(err, "Couldn't retry the photos")
      },
    })
  const runDismiss = (linkId: string) => {
    setDismissing(linkId)
    dismiss.mutate(linkId, {
      onError: (err) => {
        // Already gone or no longer failed: the product read below says what it is now.
        if (isApiError(err) && (err.status === 404 || err.type === 'INVALID_STATUS_TRANSITION')) return
        toastError(err, "Couldn't hide the photo link")
      },
      onSettled: () => setDismissing(null),
    })
  }

  return (
    <section aria-label="Photos from your file" data-testid="photo-links" className={cn('flex flex-col gap-2', className)}>
      {waiting ? (
        <p className="flex items-center gap-2 text-small text-ink-2" role="status" data-testid="photo-links-pending">
          <Spinner className="size-4 shrink-0" aria-hidden />
          {downloadingText(waiting)}
        </p>
      ) : null}
      {problems.length ? (
        <div className="rounded-lg border border-line bg-sunken">
          <ul className="divide-y divide-line" aria-label="Photo links not saved">
            {problems.map((l) => (
              <li key={l.link_id} className="flex items-start justify-between gap-3 px-3 py-2" data-testid="photo-link-problem" data-status={l.status}>
                <span className="flex min-w-0 gap-2 text-small text-ink">
                  <Icon name="alert" size={14} className="mt-0.5 shrink-0 text-warning" />
                  <span className="min-w-0 break-words">{photoLinkText(l)}</span>
                </span>
                {canAct ? (
                  <Button
                    variant="ghost"
                    size="xs"
                    className="shrink-0 text-ink-2"
                    disabled={dismissing === l.link_id}
                    onClick={() => runDismiss(l.link_id)}
                    aria-label={`Dismiss photo ${l.position}`}
                    data-testid="photo-link-dismiss"
                  >
                    {dismissing === l.link_id ? <Spinner data-icon="inline-start" aria-hidden /> : null}
                    Dismiss
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
          {canAct && retryable && !retryOff ? (
            <div className="flex items-center justify-between gap-3 border-t border-line px-3 py-2">
              <span className="text-caption text-ink-3">Retry once anyone with the link can open it.</span>
              <Button variant="secondary" size="sm" disabled={retry.isPending} onClick={runRetry} data-testid="photo-links-retry">
                {retry.isPending ? <Spinner data-icon="inline-start" aria-hidden /> : <Icon name="refresh" size={16} data-icon="inline-start" />}
                Retry
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
