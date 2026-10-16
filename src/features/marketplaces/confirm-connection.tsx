import { Link, useNavigate } from '@tanstack/react-router'
import { CheckCircle2, ExternalLink, Link2Off, RotateCw, ShieldOff, TriangleAlert, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { isApiError, isForbidden } from '@/api/errors'
import { ErrorState } from '@/components/states/error-state'
import { ReferenceId } from '@/components/states/reference-id'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { useCan } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { PENDING_HANDLE_RE, useConfirmConnection } from './api'
import { formatDateTime, formatRelative } from './format'
import { MarketplaceMark } from './marketplace-mark'
import { MARKETPLACE_META } from './meta'
import { AccountStatusBadge } from './status-badge'

/**
 * Confirms the pending connection exactly once (StrictMode-safe), then strips `?pending=` from
 * the URL. The handle is kept in memory so "Try again" works after a conflict.
 */
export function ConfirmConnection({ urlPending }: { urlPending: string | undefined }) {
  const can = useCan()
  const navigate = useNavigate()
  const [pending, setPending] = useState(() => urlPending ?? null)
  const valid = !!pending && PENDING_HANDLE_RE.test(pending)
  const allowed = can('marketplace:connect')
  const confirm = useConfirmConnection()
  const fired = useRef<string | null>(null)

  const { mutate } = confirm
  useEffect(() => {
    if (!urlPending) return
    // A handle is confirmed once; seeing it again (StrictMode, or a repeated push of the same URL)
    // only strips the query again.
    if (fired.current !== urlPending) {
      fired.current = urlPending
      setPending(urlPending)
      if (PENDING_HANDLE_RE.test(urlPending) && allowed) mutate(urlPending)
    }
    void navigate({ to: '/marketplaces/connected', search: {}, replace: true })
  }, [urlPending, allowed, mutate, navigate])

  if (!pending) {
    return (
      <Panel
        icon={Link2Off}
        title="No connection to confirm"
        description="Open this page from the marketplace's approval screen. To start a new connection, go to Marketplaces."
        actions={<BackButton />}
      />
    )
  }
  if (!valid) {
    return (
      <Panel
        icon={Link2Off}
        tone="danger"
        title="This connection link is not valid"
        description="The link is incomplete or was changed. Start again from Marketplaces."
        actions={<BackButton />}
      />
    )
  }
  if (!allowed || isForbidden(confirm.error)) {
    return (
      <Panel
        icon={ShieldOff}
        title="Only owners and admins can connect marketplaces"
        description="Ask an owner or admin of this brand to connect the account."
        reference={isApiError(confirm.error) ? confirm.error.correlationId : null}
        actions={<BackButton />}
      />
    )
  }
  if (confirm.isSuccess) {
    const a = confirm.data
    const m = MARKETPLACE_META[a.marketplace]
    return (
      <Card className="gap-0 py-0" data-testid="connect-success">
        <StatusHead
          tile={<IconTile icon={CheckCircle2} tone="success" />}
          title={`${m.name} connected`}
          description={`Listings for this brand can now be published to ${m.short}.`}
        />
        <dl className="mx-6 divide-y border-t text-sm sm:mx-8">
          <Row label="Marketplace">
            <span className="inline-flex items-center gap-2">
              <MarketplaceMark marketplace={a.marketplace} size="sm" />
              {m.name}
            </span>
          </Row>
          <Row label="Seller">
            <code className="font-mono text-[0.8125rem]" data-testid="seller-id">
              {a.seller_id}
            </code>
          </Row>
          <Row label="Status">
            <AccountStatusBadge status={a.status} />
          </Row>
          <Row label="Token expires">
            {a.expires_at ? (
              <time dateTime={a.expires_at} title={formatDateTime(a.expires_at)}>
                {formatRelative(a.expires_at)}
              </time>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </Row>
        </dl>
        <div className="mt-6 flex justify-end border-t bg-muted/40 px-6 py-3.5 sm:px-8">
          <Button size="sm" className="max-sm:w-full" asChild>
            <Link to="/marketplaces">View marketplaces</Link>
          </Button>
        </div>
      </Card>
    )
  }
  if (confirm.isError) {
    const err = confirm.error
    if (isApiError(err) && err.type === 'OAUTH_STATE_INVALID') {
      return (
        <Panel
          icon={Link2Off}
          tone="danger"
          title="This connection link expired or was already used."
          description="Links work once and for about 10 minutes. Start again from Marketplaces."
          reference={err.correlationId}
          actions={<BackButton />}
          testId="connect-link-invalid"
        />
      )
    }
    if (isApiError(err) && err.type === 'MARKETPLACE_ACCOUNT_CONFLICT') {
      return (
        <Panel
          icon={TriangleAlert}
          tone="warning"
          title={err.message}
          description="Revoke the existing connection on Marketplaces (opens in a new tab), then try again here. This link stays valid for about 10 minutes."
          reference={err.correlationId}
          testId="connect-conflict"
          actions={
            <>
              <Button variant="outline" size="sm" asChild>
                <a href="/marketplaces" target="_blank" rel="noopener">
                  Open Marketplaces
                  <ExternalLink data-icon="inline-end" />
                </a>
              </Button>
              <Button size="sm" onClick={() => mutate(pending)}>
                <RotateCw data-icon="inline-start" />
                Try again
              </Button>
            </>
          }
        />
      )
    }
    return (
      <Card className="py-0">
        <ErrorState error={err} title="Couldn't confirm the connection" onRetry={() => mutate(pending)} />
      </Card>
    )
  }
  return (
    <Card className="py-0" role="status" aria-live="polite" data-testid="connect-confirming">
      <StatusHead
        tile={
          <span className="flex size-12 items-center justify-center rounded-xl bg-subtle text-ink-2 ring-1 ring-line ring-inset">
            <Spinner className="size-5" />
          </span>
        }
        title="Finishing your connection…"
        description="Saving the seller account to this brand."
        className="pb-10"
      />
    </Card>
  )
}

function BackButton() {
  return (
    <Button variant="outline" size="sm" asChild>
      <Link to="/marketplaces">Go to Marketplaces</Link>
    </Button>
  )
}

const TONES = {
  neutral: 'bg-subtle text-ink-2 ring-line',
  success: 'bg-success-bg text-success ring-success-line',
  danger: 'bg-danger-bg text-danger ring-danger-line',
  warning: 'bg-attention-bg text-attention ring-attention-line',
} as const

function IconTile({ icon: Icon, tone }: { icon: LucideIcon; tone: keyof typeof TONES }) {
  return (
    <span className={cn('flex size-12 items-center justify-center rounded-xl ring-1 ring-inset', TONES[tone])}>
      <Icon className="size-[1.375rem]" strokeWidth={1.75} aria-hidden />
    </span>
  )
}

/** Centered tile, page title (h1: this card is the page's subject) and one sentence. */
function StatusHead({
  tile,
  title,
  description,
  className,
}: {
  tile: ReactNode
  title: string
  description: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center gap-4 px-6 pt-10 pb-7 text-center sm:px-10', className)}>
      {tile}
      <div className="max-w-sm space-y-1.5">
        <h1 className="font-display text-h2 text-balance text-ink">{title}</h1>
        <p className="text-body text-pretty text-ink-2">{description}</p>
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 py-2">
      <dt className="text-[0.8125rem] leading-5 text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 items-center justify-end truncate leading-5">{children}</dd>
    </div>
  )
}

function Panel({
  icon,
  title,
  description,
  actions,
  reference,
  tone = 'neutral',
  testId,
}: {
  icon: LucideIcon
  title: string
  description: ReactNode
  actions?: ReactNode
  reference?: string | null
  tone?: Exclude<keyof typeof TONES, 'success'>
  testId?: string
}) {
  return (
    <Card className="py-0" role={tone === 'neutral' ? undefined : 'alert'} data-testid={testId}>
      <StatusHead tile={<IconTile icon={icon} tone={tone} />} title={title} description={description} className="pb-5" />
      {reference || actions ? (
        <div className="flex flex-col items-center gap-4 px-6 pb-9">
          <ReferenceId id={reference} />
          {actions ? <div className="flex w-full flex-wrap items-center justify-center gap-2 max-sm:flex-col-reverse max-sm:*:w-full">{actions}</div> : null}
        </div>
      ) : null}
    </Card>
  )
}
