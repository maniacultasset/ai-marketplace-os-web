import { ArrowUpRight, Clock, RefreshCcw, TriangleAlert, Unplug } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { isNotImplemented } from '@/api/errors'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useCan } from '@/lib/permissions'
import { toastError } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { useConnectMarketplace, type Marketplace, type MarketplaceAccount } from './api'
import { formatDateTime, formatRelative, isPast } from './format'
import { MarketplaceMark } from './marketplace-mark'
import { MARKETPLACE_META } from './meta'
import { RevokeDialog } from './revoke-dialog'
import { AccountStatusBadge, NotConnectedBadge } from './status-badge'
import { useNow } from './use-now'

/** One marketplace: its live (non-revoked) account, or a Connect call to action. */
export function MarketplaceCard({
  marketplace,
  account,
  previous,
}: {
  marketplace: Marketplace
  account: MarketplaceAccount | null
  /** Latest revoked account, for "previously connected" context. */
  previous: MarketplaceAccount | null
}) {
  const m = MARKETPLACE_META[marketplace]
  const can = useCan()
  const canConnect = can('marketplace:connect')
  const connect = useConnectMarketplace()
  const [notConfigured, setNotConfigured] = useState(false)
  const [revokeOpen, setRevokeOpen] = useState(false)
  const now = useNow()

  // Back button from the marketplace restores this page from bfcache with the mutation still
  // "pending"; reset so the button is usable again.
  const { reset } = connect
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) reset()
    }
    window.addEventListener('pageshow', onShow)
    return () => window.removeEventListener('pageshow', onShow)
  }, [reset])

  const startConnect = () => {
    connect.mutate(marketplace, {
      onSuccess: ({ authorize_url }) => window.location.assign(authorize_url),
      onError: (err) => {
        if (isNotImplemented(err)) setNotConfigured(true)
        else toastError(err, `Couldn't start connecting ${m.short}`)
      },
    })
  }
  // Stays "Redirecting…" after success until the browser leaves the page.
  const redirecting = connect.isPending || connect.isSuccess
  const status = account?.status
  const tokenExpired = account?.status === 'active' && isPast(account.expires_at, now)

  return (
    <Card className="gap-0 py-0" data-testid={`marketplace-card-${marketplace}`} data-status={status ?? 'none'}>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3.5 gap-y-2.5 p-5 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
        <MarketplaceMark marketplace={marketplace} />
        <div className="min-w-0 space-y-0.5 pt-px">
          <h2 className="text-[0.9375rem] leading-snug font-semibold tracking-[-0.01em]">{m.name}</h2>
          <p className={cn('text-sm text-muted-foreground', account && 'truncate')}>
            {account ? (
              <>
                Seller{' '}
                <code className="font-mono text-[0.8125rem] text-foreground" data-testid="seller-id">
                  {account.seller_id}
                </code>
              </>
            ) : (
              `Publish listings to your ${m.short} seller account.`
            )}
          </p>
        </div>
        <div className="col-start-2 sm:col-start-3 sm:pt-0.5">{account ? <AccountStatusBadge status={account.status} /> : <NotConnectedBadge />}</div>
      </div>

      {status === 'needs_reconnect' && account ? (
        <div
          role="status"
          className="mx-5 mb-5 flex gap-2.5 rounded-lg bg-warning/8 px-3.5 py-3 text-sm ring-1 ring-warning/25 ring-inset dark:bg-warning/10"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <p className="text-pretty text-foreground/90">
            {m.short} rejected the token refresh
            {account.needs_reconnect_since ? (
              <>
                {' '}
                <time dateTime={account.needs_reconnect_since} title={formatDateTime(account.needs_reconnect_since)}>
                  {formatRelative(account.needs_reconnect_since, now)}
                </time>
              </>
            ) : null}
            . Reconnect with the same seller account ({account.seller_id}); a different seller is refused.
          </p>
        </div>
      ) : null}

      <div className="flex-1 border-t px-5">
        {account ? (
          <dl className="divide-y text-sm">
            <Row label="Token expires">
              {account.expires_at ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <time
                      dateTime={account.expires_at}
                      tabIndex={0}
                      className={cn(
                        'rounded-sm underline decoration-border decoration-dotted underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                        tokenExpired && 'text-warning',
                      )}
                    >
                      {tokenExpired ? `Expired ${formatRelative(account.expires_at, now)}` : formatRelative(account.expires_at, now)}
                    </time>
                  </TooltipTrigger>
                  <TooltipContent>
                    {formatDateTime(account.expires_at)}
                    {status === 'active' ? ' · refreshed automatically' : ''}
                  </TooltipContent>
                </Tooltip>
              ) : (
                <Empty />
              )}
            </Row>
            <Row label="Connected">
              <time dateTime={account.created_at}>{formatDateTime(account.created_at)}</time>
            </Row>
            <Row label="Region">{account.region ?? <Empty />}</Row>
          </dl>
        ) : notConfigured ? (
          <div className="flex items-start gap-2.5 py-4 text-sm" data-testid="not-configured">
            <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="space-y-0.5">
              <p className="font-medium">Not configured on this server</p>
              <p className="text-muted-foreground">
                {m.short} OAuth settings are missing here, so connecting is not available yet.
              </p>
            </div>
          </div>
        ) : (
          <p className="py-4 text-sm text-pretty text-muted-foreground">
            {previous ? (
              <>
                Last connection (seller <code className="font-mono text-[0.8125rem] text-foreground/80">{previous.seller_id}</code>) was
                revoked.{' '}
              </>
            ) : null}
            {canConnect
              ? `You approve access on ${m.short}, then come back here.`
              : `An owner or admin can connect ${m.short}.`}
          </p>
        )}
      </div>

      {canConnect && !(notConfigured && !account) ? (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t bg-muted/40 px-5 py-3">
          {account ? (
            <Button variant="outline" onClick={() => setRevokeOpen(true)} disabled={redirecting}>
              <Unplug data-icon="inline-start" />
              Revoke
            </Button>
          ) : null}
          {!account || status === 'needs_reconnect' ? (
            <Button onClick={startConnect} disabled={redirecting}>
              {redirecting ? (
                <Spinner data-icon="inline-start" />
              ) : status === 'needs_reconnect' ? (
                <RefreshCcw data-icon="inline-start" />
              ) : null}
              {redirecting
                ? `Redirecting to ${m.short}…`
                : status === 'needs_reconnect'
                  ? 'Reconnect'
                  : `Connect ${m.short}`}
              {!redirecting && status !== 'needs_reconnect' ? <ArrowUpRight data-icon="inline-end" /> : null}
            </Button>
          ) : null}
        </div>
      ) : null}

      {account ? <RevokeDialog account={account} open={revokeOpen} onOpenChange={setRevokeOpen} /> : null}
    </Card>
  )
}

/** One definition row: muted label left, value right, hairline between rows. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-[0.8125rem] text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right tabular-nums">{children}</dd>
    </div>
  )
}

function Empty() {
  return <span className="text-muted-foreground">—</span>
}

export function MarketplaceCardSkeleton() {
  return (
    <Card className="gap-0 py-0" aria-hidden>
      <div className="flex items-start gap-3.5 p-5">
        <Skeleton className="size-10 rounded-xl" />
        <div className="flex-1 space-y-2 pt-1">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3.5 w-44" />
        </div>
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
      <div className="divide-y border-t px-5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex justify-between py-3">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3.5 w-28" />
          </div>
        ))}
      </div>
    </Card>
  )
}
