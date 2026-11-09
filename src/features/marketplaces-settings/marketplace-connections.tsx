/**
 * Hi-fi 04 "Connect marketplaces" body: the marketplace list on the left (400px, rows 68, gap 10)
 * and the selected marketplace's detail card on the right. Amazon and Flipkart are real
 * (GET /marketplaces/accounts, POST /marketplaces/connect, POST /marketplaces/accounts/{id}/revoke);
 * Flipkart reads "Coming soon" with no Connect while publishing there is not open; the other four
 * read "On the roadmap" with one disabled "Join waitlist". Reused by /setup/marketplaces.
 */
import { useRef, useState, type ReactNode } from 'react'
import { Banner } from '@/components/la/banner'
import { LaCard } from '@/components/la/cards'
import { CONCEPT_ICON } from '@/components/la/concept-icons'
import { Icon, IconGlyph } from '@/components/la/icons'
import { MarketplaceTile, marketplaceInfo } from '@/components/la/marketplace'
import { ComingSoon, NOT_YET, UnavailableButton, UnavailableHint, WaitlistButton } from '@/components/la/unavailable'
import { ErrorState } from '@/components/states/error-state'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { useCurrentMarketplaceAccounts, type Marketplace } from '@/features/marketplaces/api'
import { accessText, formatDateTime, formatRelative } from '@/features/marketplaces/format'
import { comingSoon, comingSoonReason, MARKETPLACE_META } from '@/features/marketplaces/meta'
import { RevokeDialog } from '@/features/marketplaces/revoke-dialog'
import { AccountStatusBadge, NotConnectedBadge } from '@/features/marketplaces/status-badge'
import { useNow } from '@/features/marketplaces/use-now'
import { useCan } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { connectionFor, defaultSelection, SUPPORTED, WAITLIST, type Connection } from './model'
import { useStartConnect } from './use-start-connect'

type Connector = ReturnType<typeof useStartConnect>

export function MarketplaceConnections({
  selected: selectedProp,
  onSelect,
  showHeading = true,
}: {
  /** Selected marketplace (from the URL); defaults to the row with something to do. */
  selected?: Marketplace
  onSelect: (m: Marketplace) => void
  /**
   * The "Where do you sell?" heading above the list. /marketplaces turns it off: its page header
   * already names the page, and the list then starts on the same top edge as the detail card.
   */
  showHeading?: boolean
}) {
  const current = useCurrentMarketplaceAccounts()
  const can = useCan()
  const canConnect = can('marketplace:connect')
  // One connector per supported marketplace (fixed count), shared by the row and the detail card.
  const connectors: Record<Marketplace, Connector> = {
    amazon: useStartConnect('amazon'),
    flipkart: useStartConnect('flipkart'),
  }
  const detailRef = useRef<HTMLDivElement>(null)

  if (current.error && !current.data) {
    return (
      <LaCard pad="none">
        <ErrorState error={current.error} title="Couldn't load marketplace accounts" onRetry={() => void current.refetch()} />
      </LaCard>
    )
  }

  const selected = selectedProp ?? defaultSelection(current.data)
  const select = (m: Marketplace) => {
    onSelect(m)
    // Below lg the detail sits under the list: bring it into view.
    if (window.matchMedia?.('(max-width: 1023px)').matches) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }))
    }
  }

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[400px_minmax(0,1fr)]">
      <section
        aria-labelledby={showHeading ? 'where-heading' : undefined}
        aria-label={showHeading ? undefined : 'Marketplace accounts'}
        className="flex flex-col gap-2.5"
      >
        {showHeading ? (
          <div className="mb-0.5">
            <h2 id="where-heading" className="font-display text-h2 text-ink">
              Where do you sell?
            </h2>
            <p className="mt-1 text-small text-ink-2">Connect one to start. Add the rest any time.</p>
          </div>
        ) : null}
        <ul className="flex flex-col gap-2.5" aria-label="Marketplaces">
          {SUPPORTED.map((m) =>
            current.data ? (
              <SupportedRow
                key={m}
                connection={connectionFor(current.data, m)}
                selected={selected === m}
                onSelect={() => select(m)}
                canConnect={canConnect}
                connector={connectors[m]}
              />
            ) : (
              <RowSkeleton key={m} />
            ),
          )}
          {WAITLIST.map((w) => (
            <li
              key={w.id}
              data-testid={`marketplace-row-${w.id}`}
              className="flex min-h-[68px] items-center justify-between gap-3 rounded-card border border-dashed border-line-strong px-4 py-3"
            >
              <span className="flex min-w-0 items-center gap-3">
                <MarketplaceTile id={w.id} />
                <span className="min-w-0">
                  <span className="block truncate font-bold text-ink">{marketplaceInfo(w.id).name}</span>
                  <span className="block text-caption text-ink-3">{w.note}</span>
                </span>
              </span>
              <WaitlistButton variant="secondary" size="sm" name={marketplaceInfo(w.id).name} />
            </li>
          ))}
        </ul>
        {canConnect ? (
          <p className="px-0.5 text-caption text-ink-3">
            Connect opens the marketplace so you can approve access, then brings you back here.
          </p>
        ) : null}
      </section>

      <div ref={detailRef} className="scroll-mt-20">
        {current.data ? (
          <ConnectionDetail
            key={selected}
            connection={connectionFor(current.data, selected)}
            canConnect={canConnect}
            connector={connectors[selected]}
          />
        ) : (
          <DetailSkeleton />
        )}
      </div>
    </div>
  )
}

function SupportedRow({
  connection,
  selected,
  onSelect,
  canConnect,
  connector,
}: {
  connection: Connection
  selected: boolean
  onSelect: () => void
  canConnect: boolean
  connector: Connector
}) {
  const { marketplace, kind, account } = connection
  const m = MARKETPLACE_META[marketplace]
  const soon = !account && comingSoon(marketplace, [])
  return (
    <li
      data-testid={`marketplace-card-${marketplace}`}
      data-status={account?.status ?? 'none'}
      data-selected={selected || undefined}
      className={cn(
        'tactile relative flex min-h-[68px] items-center justify-between gap-3 rounded-card border bg-surface px-4 py-3',
        selected ? 'border-brand shadow-[var(--selected-ring),var(--shadow-raised-sm)]' : 'border-line shadow-raised-sm hover:border-edge-hover',
      )}
    >
      {/* The whole row selects; the action button sits above this layer. */}
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={`Show ${m.name} details`}
        className="focus-ring absolute inset-0 cursor-pointer rounded-card"
      />
      <span className="pointer-events-none flex min-w-0 items-center gap-3">
        <MarketplaceTile id={marketplace} />
        <span className="min-w-0">
          <span className="block truncate font-bold text-ink">{m.name}</span>
          {account ? (
            <span className="block truncate text-caption text-ink-3">
              Seller <span data-testid="seller-id">{account.seller_id}</span>
            </span>
          ) : null}
        </span>
      </span>
      <span className="relative z-10 flex shrink-0 items-center">
        {soon ? (
          // Publishing there is not open yet: no Connect (prod QA 9 Nov, item 10).
          <span data-testid={`coming-soon-${marketplace}`}>
            <ComingSoon />
          </span>
        ) : kind === 'not-connected' && canConnect && !connector.notConfigured ? (
          <Button size="sm" onClick={connector.start} disabled={connector.redirecting} aria-label={`Connect ${m.short}`}>
            {connector.redirecting ? <Spinner data-icon="inline-start" /> : null}
            {connector.redirecting ? 'Redirecting…' : 'Connect'}
          </Button>
        ) : account ? (
          <AccountStatusBadge status={account.status} />
        ) : (
          <NotConnectedBadge />
        )}
      </span>
    </li>
  )
}

function ConnectionDetail({ connection, canConnect, connector }: { connection: Connection; canConnect: boolean; connector: Connector }) {
  const { marketplace, kind, account, previous } = connection
  const m = MARKETPLACE_META[marketplace]
  const [revokeOpen, setRevokeOpen] = useState(false)
  const now = useNow()

  const actions =
    canConnect && account ? (
      <>
        <Button
          variant={kind === 'reconnect' ? 'primary' : 'secondary'}
          size="sm"
          onClick={connector.start}
          disabled={connector.redirecting}
        >
          {connector.redirecting ? <Spinner data-icon="inline-start" /> : <Icon name="link" size={16} />}
          {connector.redirecting ? `Redirecting to ${m.short}…` : 'Reconnect'}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setRevokeOpen(true)} disabled={connector.redirecting}>
          <IconGlyph icon={CONCEPT_ICON.revoke} size={16} />
          Revoke
        </Button>
      </>
    ) : null

  return (
    <LaCard
      className="flex flex-col gap-4"
      data-testid="marketplace-detail"
      data-marketplace={marketplace}
      data-status={account?.status ?? 'none'}
      aria-labelledby="mp-detail-title"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <MarketplaceTile id={marketplace} size="big" />
          <div className="min-w-0">
            <h2 id="mp-detail-title" className="font-display text-h2 text-ink">
              {m.name}
            </h2>
            <p className="truncate text-small text-ink-2">
              {account ? (
                <>
                  Seller ID <span data-testid="detail-seller-id">{account.seller_id}</span>
                  {account.region ? ` · ${account.region}` : ''}
                </>
              ) : (
                'Not connected'
              )}
            </p>
          </div>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>

      {kind === 'reconnect' && account ? (
        <Banner tone="attention" role="status" title={`Reconnect ${m.short}`}>
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
        </Banner>
      ) : null}

      {!account && comingSoon(marketplace, []) ? (
        <Banner tone="neutral" title="Coming soon" icon="clock">
          <span data-testid="coming-soon-detail">{comingSoonReason(marketplace)}</span>
        </Banner>
      ) : connector.notConfigured ? (
        <Banner tone="neutral" title="Coming soon" icon="alert">
          <span data-testid="not-configured">
            Connecting {m.short} is coming soon. {m.short} drafts open once it is connected.
          </span>
        </Banner>
      ) : null}

      {account ? (
        <>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-small sm:grid-cols-[150px_minmax(0,1fr)]">
            <Kv label="Status">
              <AccountStatusBadge status={account.status} />
            </Kv>
            <Kv label="Seller ID">{account.seller_id}</Kv>
            <Kv label="Region">{account.region ?? <Dash />}</Kv>
            <Kv label="Authorized">
              <time dateTime={account.created_at}>{formatDateTime(account.created_at)}</time>
            </Kv>
            {/* Never the 1-hour access-token expiry (prod QA 9 Nov, item 19): it renews itself. */}
            <Kv label="Access">{accessText(account.status)}</Kv>
            <Kv label="Pickup locations">
              <UnavailableHint reason={NOT_YET.pickupLocations}>
                <ComingSoon />
              </UnavailableHint>
            </Kv>
            <Kv label="Default shipping">
              <UnavailableHint reason={NOT_YET.pickupLocations}>
                <ComingSoon />
              </UnavailableHint>
            </Kv>
          </dl>
          <div>
            <h3 className="text-body font-bold text-ink">Listing permissions</h3>
            <div className="mt-2 flex items-center justify-between gap-3 text-body text-ink-2">
              <span>Category and brand approvals on {m.short}</span>
              <UnavailableHint reason={`Reading category approvals from ${m.short} is not available yet. Check them in ${m.console}.`}>
                <ComingSoon />
              </UnavailableHint>
            </div>
          </div>
          <Banner
            tone="neutral"
            icon="shield"
            title="Brand authorisation"
            action={
              canConnect ? (
                <UnavailableButton variant="secondary" size="sm" reason={NOT_YET.brandAuthorisation}>
                  Upload proof
                </UnavailableButton>
              ) : null
            }
          >
            <span className="text-small text-ink-2">If {m.short} asks for proof that you may sell a brand, upload it in {m.console} for now.</span>
          </Banner>
        </>
      ) : (
        <div className="flex flex-col gap-3 text-body text-ink-2">
          {previous ? (
            <p>
              The last connection (seller <span className="font-semibold text-ink">{previous.seller_id}</span>) was revoked.
            </p>
          ) : null}
          {comingSoon(marketplace, []) ? null : <p>
            {canConnect
              ? connector.notConfigured
                ? `Connecting ${m.short} becomes possible once it is configured on this server.`
                : `Select Connect, approve access on ${m.short}, and you come back here. Approved listings can then be published to ${m.short}.`
              : `An owner or admin can connect ${m.short}.`}
          </p>}
        </div>
      )}

      {account ? <RevokeDialog account={account} open={revokeOpen} onOpenChange={setRevokeOpen} /> : null}
    </LaCard>
  )
}

function Kv({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="flex min-h-[22px] items-center text-ink-3">{label}</dt>
      <dd className="flex min-h-[22px] min-w-0 items-center text-ink">{children}</dd>
    </>
  )
}

function Dash() {
  return <span className="text-ink-3">—</span>
}

function RowSkeleton() {
  return (
    <li aria-hidden className="flex min-h-[68px] items-center gap-3 rounded-card border border-line bg-surface px-4">
      <Skeleton className="size-9 rounded-tile" />
      <Skeleton className="h-4 w-24" />
      <Skeleton className="ml-auto h-[22px] w-24 rounded-full" />
    </li>
  )
}

function DetailSkeleton() {
  return (
    <LaCard aria-hidden className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Skeleton className="size-11 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3.5 w-48" />
        </div>
      </div>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="grid grid-cols-[150px_1fr] gap-3">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-3.5 w-40" />
        </div>
      ))}
    </LaCard>
  )
}
