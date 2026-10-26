/**
 * Setup step 3, "Connect marketplaces" (hi-fi 04).
 *
 * Real calls (backend routers/marketplaces.py), all through features/marketplaces/api:
 *   GET  /marketplaces/accounts   the live account per marketplace (useCurrentMarketplaceAccounts)
 *   POST /marketplaces/connect    { marketplace } → { authorize_url }; the browser goes there and the
 *                                 callback lands on /marketplaces/connected, which confirms it.
 *                                 501 = OAuth not configured on this server.
 * Only Amazon and Flipkart exist in the API. Myntra, AJIO, Meesho and Nykaa Fashion show a disabled
 * "Join waitlist" (no waitlist API). Pickup locations, shipping defaults, listing permissions and
 * brand-authorisation upload have no API: shown disabled, or left out where showing a value would
 * mislead (listing permissions).
 * "Finish setup" needs one `active` account (hi-fi behaviour), then goes to Home.
 */
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useState, type ReactNode } from 'react'
import { isNotImplemented } from '@/api/errors'
import { Banner } from '@/components/la/banner'
import { LaCard } from '@/components/la/cards'
import { Icon } from '@/components/la/icons'
import { MARKETPLACES, MarketplaceTile, type MarketplaceId, type MarketplaceInfo } from '@/components/la/marketplace'
import { StatusChip, TagChip } from '@/components/la/status-chip'
import { ComingSoon, NOT_YET, UnavailableButton, UnavailableHint } from '@/components/la/unavailable'
import { ErrorState } from '@/components/states/error-state'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import {
  useConnectMarketplace,
  useCurrentMarketplaceAccounts,
  type Marketplace,
  type MarketplaceAccount,
} from '@/features/marketplaces/api'
import { formatDateTime } from '@/features/marketplaces/format'
import { useCan } from '@/lib/permissions'
import { toastError } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { activeAccounts } from './model'
import { SetupBody, SetupFooter } from './setup-frame'

export function MarketplacesStep() {
  const current = useCurrentMarketplaceAccounts()
  const navigate = useNavigate()
  const live = current.data?.live
  const active = live ? activeAccounts(Object.values(live)) : []
  const [selected, setSelected] = useState<MarketplaceId | null>(null)
  // Default selection: the first connected marketplace, else Amazon.
  const shown: MarketplaceId = selected ?? active[0]?.marketplace ?? 'amazon'

  const status = !live
    ? 'Checking your connections…'
    : active.length
      ? `You can start on ${active.map((a) => MARKETPLACES.find((m) => m.id === a.marketplace)!.name).join(' and ')} now.`
      : 'Connect at least one marketplace to finish setup. You can also skip and do it later.'

  return (
    <>
      <SetupBody step={2}>
        <div className="grid items-start gap-6 lg:grid-cols-[400px_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-2.5">
            <div>
              <h2 className="text-h2 text-ink">Where do you sell?</h2>
              <p className="mt-1 text-small text-ink-2">Connect one to start. Add the rest any time.</p>
            </div>
            {current.error && !current.data ? (
              <LaCard pad="none">
                <ErrorState compact error={current.error} title="Couldn’t load your marketplace connections" onRetry={() => void current.refetch()} />
              </LaCard>
            ) : (
              <ul aria-label="Marketplaces" className="flex flex-col gap-2.5">
                {MARKETPLACES.map((m) => (
                  <MarketplaceRow
                    key={m.id}
                    info={m}
                    account={m.supported && live ? live[m.id as Marketplace] : null}
                    loading={m.supported && !live}
                    selected={shown === m.id}
                    onSelect={() => setSelected(m.id)}
                  />
                ))}
              </ul>
            )}
          </div>
          <MarketplaceDetail
            key={shown}
            info={MARKETPLACES.find((m) => m.id === shown)!}
            account={live && shown in live ? live[shown as Marketplace] : null}
            loading={!live && !current.error}
          />
        </div>
      </SetupBody>
      <SetupFooter status={status}>
        <Button variant="secondary" onClick={() => void navigate({ to: '/setup/compliance' })}>
          Back
        </Button>
        <Button variant="ghost" onClick={() => void navigate({ to: '/home' })} data-testid="setup-skip">
          Skip for now
        </Button>
        <Button
          disabled={!active.length}
          aria-describedby={active.length ? undefined : 'setup-footer-reason'}
          onClick={() => void navigate({ to: '/home' })}
          data-testid="setup-finish"
        >
          Finish setup
        </Button>
        {!active.length ? (
          <span id="setup-footer-reason" className="sr-only">
            Finish setup needs one connected marketplace.
          </span>
        ) : null}
      </SetupFooter>
    </>
  )
}

function rowChip(account: MarketplaceAccount | null) {
  if (!account) return null
  if (account.status === 'active') return <StatusChip status="live">Connected</StatusChip>
  if (account.status === 'needs_reconnect') return <StatusChip status="needs-you">Reconnect</StatusChip>
  return null
}

function MarketplaceRow({
  info,
  account,
  loading,
  selected,
  onSelect,
}: {
  info: MarketplaceInfo
  account: MarketplaceAccount | null
  loading: boolean
  selected: boolean
  onSelect: () => void
}) {
  const chip = rowChip(account)
  return (
    <li
      data-testid={`setup-mp-${info.id}`}
      data-selected={selected || undefined}
      className={cn(
        'tactile relative flex min-h-[68px] items-center justify-between gap-3 rounded-card border px-4 py-3',
        !info.supported
          ? 'border-dashed border-line-strong bg-transparent'
          : 'border-line bg-surface shadow-raised-sm hover:border-edge-hover hover:shadow-raised-md',
        selected &&
          (info.supported
            ? 'border-brand shadow-[var(--selected-ring),var(--shadow-raised-md)] hover:border-brand hover:shadow-[var(--selected-ring),var(--shadow-raised-md)]'
            : 'border-brand shadow-selected'),
      )}
    >
      {/* The whole row selects; the action on the right sits above the stretched button. */}
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className="focus-ring flex min-w-0 items-center gap-3 rounded-control text-left after:absolute after:inset-0 after:rounded-card"
      >
        <MarketplaceTile id={info.id} className={cn(!info.supported && 'shadow-none')} />
        <span className="min-w-0">
          <b className="block truncate text-ink">{info.name}</b>
          {!info.supported ? <span className="block text-caption text-ink-3">Not supported yet</span> : null}
        </span>
      </button>
      <span className="relative z-10 shrink-0">
        {loading ? (
          <Skeleton className="h-[22px] w-24 rounded-full" />
        ) : !info.supported ? (
          <UnavailableButton variant="secondary" size="sm" reason={NOT_YET.waitlist}>
            Join waitlist
          </UnavailableButton>
        ) : (
          (chip ?? <TagChip tone="plain">Not connected</TagChip>)
        )}
      </span>
    </li>
  )
}

function MarketplaceDetail({ info, account, loading }: { info: MarketplaceInfo; account: MarketplaceAccount | null; loading: boolean }) {
  const can = useCan()
  const canConnect = can('marketplace:connect')
  const connect = useConnectMarketplace()
  const [notConfigured, setNotConfigured] = useState(false)

  // Back from the marketplace restores this page from bfcache with the mutation "pending".
  const { reset } = connect
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) reset()
    }
    window.addEventListener('pageshow', onShow)
    return () => window.removeEventListener('pageshow', onShow)
  }, [reset])

  if (loading) {
    return (
      <LaCard className="flex flex-col gap-4" aria-busy="true" aria-label="Loading connection">
        <div className="flex items-center gap-3">
          <Skeleton className="size-11 rounded-[9px]" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
        <Skeleton className="h-24 w-full" />
      </LaCard>
    )
  }

  const header = (action?: ReactNode, sub?: ReactNode) => (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <MarketplaceTile id={info.id} size="big" className={cn(!info.supported && 'shadow-none')} />
        <div className="min-w-0">
          <h2 className="text-h2 text-ink">{info.name}</h2>
          {sub ? <p className="truncate text-small text-ink-2">{sub}</p> : null}
        </div>
      </div>
      {action}
    </div>
  )

  if (!info.supported) {
    return (
      <LaCard emphasis="dashed" className="flex flex-col gap-4" data-testid="setup-mp-detail">
        {header(
          <UnavailableButton variant="secondary" size="sm" reason={NOT_YET.waitlist}>
            Join waitlist
          </UnavailableButton>,
          'Not supported yet',
        )}
        <p className="text-body text-ink-2">
          Kuinn lists on Amazon and Flipkart today. {info.name} needs API access we do not have yet, and the
          waitlist is not open, so there is nothing to connect here.
        </p>
      </LaCard>
    )
  }

  const mp = info.id as Marketplace
  const startConnect = () => {
    connect.mutate(mp, {
      onSuccess: ({ authorize_url }) => window.location.assign(authorize_url),
      onError: (err) => {
        if (isNotImplemented(err)) setNotConfigured(true)
        else toastError(err, `Couldn’t start connecting ${info.name}`)
      },
    })
  }
  const redirecting = connect.isPending || connect.isSuccess
  const needsReconnect = account?.status === 'needs_reconnect'
  const connectButton =
    canConnect && !notConfigured && (!account || needsReconnect) ? (
      <Button size={account ? 'sm' : 'md'} variant={account ? 'secondary' : 'primary'} onClick={startConnect} disabled={redirecting} data-testid="setup-connect">
        {redirecting ? <Spinner /> : account ? <Icon name="refresh" size={14} /> : null}
        {redirecting ? `Opening ${info.name}…` : account ? 'Reconnect' : `Connect ${info.name}`}
      </Button>
    ) : null

  return (
    <LaCard className="flex flex-col gap-4" data-testid="setup-mp-detail">
      {header(account ? connectButton : null, account ? <>Seller ID <span className="font-mono">{account.seller_id}</span></> : 'Not connected')}

      {needsReconnect ? (
        <Banner tone="attention" title="Reconnect to keep listing">
          {info.name} stopped accepting our access. Reconnect with the same seller account ({account.seller_id}).
        </Banner>
      ) : null}

      {account ? (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-body sm:grid-cols-[150px_minmax(0,1fr)]">
          <dt className="text-ink-2">Region</dt>
          <dd className="text-ink">{account.region ?? '—'}</dd>
          <dt className="text-ink-2">Connected</dt>
          <dd className="text-ink">
            <time dateTime={account.created_at}>{formatDateTime(account.created_at)}</time>
          </dd>
          <dt className="text-ink-2">Pickup locations</dt>
          <dd>
            <UnavailableHint reason={NOT_YET.pickupLocations}>
              <ComingSoon />
            </UnavailableHint>
          </dd>
          <dt className="text-ink-2">Default shipping</dt>
          <dd>
            <UnavailableHint reason={NOT_YET.pickupLocations}>
              <ComingSoon />
            </UnavailableHint>
          </dd>
        </dl>
      ) : notConfigured ? (
        <Banner tone="neutral" icon="alert" title="Not configured on this server" role="status">
          {info.name} connection settings are missing here, so connecting is not available yet.
        </Banner>
      ) : (
        <div className="flex flex-col items-start gap-3">
          <p className="text-body text-ink-2">
            {canConnect
              ? `You approve access on ${info.name}, then come back to Kuinn. We never see your password.`
              : `An owner or admin can connect ${info.name}.`}
          </p>
          {connectButton}
        </div>
      )}

      <Banner
        tone="neutral"
        icon="shield"
        title="Brand authorisation"
        action={
          <UnavailableButton variant="secondary" size="sm" reason={NOT_YET.brandAuthorisation}>
            Upload proof
          </UnavailableButton>
        }
      >
        If {info.name} asks for proof that you may sell your brand, upload it in the {info.name} seller console for
        now.
      </Banner>
    </LaCard>
  )
}
