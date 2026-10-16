/**
 * 05 Home, first run: shown while the brand has no listings. The checklist comes from the API:
 *   Brand profile          GET /tenants/me (tone, guidelines or glossary saved)
 *   Compliance defaults    no API yet → "Later", not counted in the ring
 *   Connect a marketplace  GET /marketplaces/accounts (non-revoked accounts, of the 2 the API supports)
 *   Add your first product GET /products?limit=1
 * The route cards go to the screens that work today. Photo intake has no API → Coming soon.
 */
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Page, PageHeader } from '@/components/app/page-header'
import { CardHead, LaCard } from '@/components/la/cards'
import { IconTile, type IconName } from '@/components/la/icons'
import { ProgressRing, Stepper } from '@/components/la/progress'
import { StatusChip, TagChip } from '@/components/la/status-chip'
import { ComingSoon, NOT_YET } from '@/components/la/unavailable'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useBrandProfile } from '@/features/brand/api'
import { useCurrentMarketplaceAccounts } from '@/features/marketplaces/api'
import { useCan } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { useHasProducts } from './api'
import { API_MARKETPLACES, brandProfileDone, setupProgress, setupSteps, type SetupStep } from './model'

const COMPLIANCE_REASON = 'Compliance defaults cannot be saved yet. Add manufacturer and origin facts on each product for now.'

const STEP_LINK: Partial<Record<SetupStep['id'], '/setup/brand' | '/marketplaces' | '/add'>> = {
  brand: '/setup/brand',
  marketplace: '/marketplaces',
  product: '/add',
}

type RouteId = 'photos' | 'guided' | 'bulk'
const ROUTES: readonly { id: RouteId; icon: IconName; title: string; sub: string; to?: '/products/new' | '/imports/new' }[] = [
  { id: 'photos', icon: 'image', title: 'Photos and basics', sub: 'Start from product photos.' },
  { id: 'guided', icon: 'file', title: 'Guided form', sub: 'One product, step by step.', to: '/products/new' },
  { id: 'bulk', icon: 'table', title: 'Bulk spreadsheet', sub: 'Many products at once.', to: '/imports/new' },
]

const AFTER_STEPS = [
  { label: 'You add it' },
  { label: 'The agent prepares listings' },
  { label: 'You approve, then it is sent' },
  { label: 'We confirm it is live' },
] as const

export function FirstRun({ brand }: { brand: string }) {
  const can = useCan()
  const navigate = useNavigate()
  const profile = useBrandProfile()
  const accounts = useCurrentMarketplaceAccounts()
  const products = useHasProducts()
  const [route, setRoute] = useState<RouteId>('guided')

  const loading = profile.isPending || accounts.isPending || products.isPending
  const failed = profile.isError || accounts.isError || products.isError
  const activeAccounts = accounts.data ? API_MARKETPLACES.filter((m) => accounts.data.live[m]?.status === 'active').length : 0
  const steps = setupSteps({
    brandDone: brandProfileDone(profile.data?.data),
    activeAccounts,
    hasProducts: !!products.data,
  })
  const progress = setupProgress(steps)
  const setupDone = !loading && !failed && steps.every((s) => !s.counted || s.id === 'product' || s.state === 'done')
  const canAdd = can('product:import')
  const selected = ROUTES.find((r) => r.id === route)!

  return (
    <Page>
      <PageHeader
        title={brand ? `Welcome to ${brand}` : 'Welcome'}
        description={setupDone ? 'Setup is done. Let us list your first product.' : 'Finish setting up, then add your first product.'}
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
        <LaCard data-testid="setup-card">
          {loading ? (
            <SetupSkeleton />
          ) : (
            <>
              <div className="flex items-center gap-3.5">
                <ProgressRing done={progress.done} total={progress.total} label="Setup steps done" />
                <div>
                  <h3 className="text-h3 text-ink">Your setup</h3>
                  <p className="text-small text-ink-2" data-testid="setup-line">
                    {failed ? 'Some steps could not be checked.' : progress.line}
                  </p>
                </div>
              </div>
              <ul className="mt-4 flex flex-col gap-3">
                {steps.map((s) => (
                  <SetupRow key={s.id} step={s} unknown={failed && s.id !== 'compliance'} />
                ))}
              </ul>
            </>
          )}
        </LaCard>

        <LaCard emphasis="selected" data-testid="routes-card">
          <h3 className="text-h3 text-ink">Fastest ways to your first listing</h3>
          <div role="radiogroup" aria-label="How to add your first product" className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {ROUTES.map((r) => {
              const available = !!r.to
              const on = route === r.id
              const body = (
                <>
                  <IconTile icon={r.icon} tone={available ? 'brand' : 'neutral'} size="lg" flat={!available} className="size-10 rounded-[11px]" />
                  <h4 className="mt-3 text-[15px] leading-5 font-bold text-ink">{r.title}</h4>
                  <p className="mt-1 text-small text-ink-2">{r.sub}</p>
                  {!available ? <ComingSoon className="mt-2" /> : null}
                </>
              )
              if (!available)
                return (
                  <Tooltip key={r.id}>
                    <TooltipTrigger asChild>
                      {/* Focusable on purpose (like UnavailableButton) so keyboard and screen-reader
                          users reach the reason; it cannot be selected. */}
                      <div
                        role="radio"
                        aria-checked={false}
                        aria-disabled
                        aria-describedby={`route-${r.id}-reason`}
                        tabIndex={0}
                        data-testid={`route-${r.id}`}
                        className="focus-ring cursor-not-allowed rounded-card border border-dashed border-line-strong bg-canvas p-4 opacity-75"
                      >
                        {body}
                        <span id={`route-${r.id}-reason`} className="sr-only">
                          {NOT_YET.intakePhotos}
                        </span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>{NOT_YET.intakePhotos}</TooltipContent>
                  </Tooltip>
                )
              return (
                <button
                  key={r.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setRoute(r.id)}
                  className={cn(
                    'focus-ring tactile rounded-card border p-4 text-left',
                    on
                      ? 'border-brand bg-brand-bg/60 shadow-[var(--selected-ring),var(--shadow-inset-sm)]'
                      : 'lift border-line bg-surface shadow-raised-sm hover:border-line-strong active:shadow-pressed',
                  )}
                >
                  {body}
                </button>
              )
            })}
          </div>
          {canAdd ? (
            <Button className="mt-4" onClick={() => void navigate({ to: selected.to! })} data-testid="first-run-add">
              Add products
            </Button>
          ) : (
            <p className="mt-4 text-small text-ink-2">Your role cannot add products. Ask an owner or operator to add the first one.</p>
          )}
        </LaCard>
      </div>

      <LaCard className="mt-4">
        <CardHead title="What happens after you add a product" />
        <Stepper steps={AFTER_STEPS} current={0} className="mt-4 max-md:flex-col" />
        <p className="mt-3 text-small text-ink-2">
          You hear from us only if a fact is missing, and every listing waits for your approval before it is sent.
        </p>
      </LaCard>
    </Page>
  )
}

function SetupRow({ step, unknown }: { step: SetupStep; unknown: boolean }) {
  const to = STEP_LINK[step.id]
  const label =
    step.state !== 'done' && to ? (
      <Link to={to} className={cn('rounded-sm underline-offset-4 hover:underline', step.state === 'next' ? 'font-bold text-ink' : 'text-ink')}>
        {step.label}
      </Link>
    ) : (
      <span className={cn(step.state === 'next' ? 'font-bold' : '', 'text-ink')}>{step.label}</span>
    )
  let chip
  if (unknown) chip = <StatusChip status="not-listed">Unknown</StatusChip>
  else if (step.state === 'later')
    chip = (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="rounded-full">
            <TagChip tone="plain">{step.chip}</TagChip>
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-64">{COMPLIANCE_REASON}</TooltipContent>
      </Tooltip>
    )
  else if (step.state === 'done') chip = <StatusChip status="live">{step.chip}</StatusChip>
  else if (step.state === 'next') chip = <StatusChip status="working">{step.chip}</StatusChip>
  else chip = <StatusChip status="draft">{step.chip}</StatusChip>
  return (
    <li className="flex items-center justify-between gap-3 text-body" data-testid={`setup-${step.id}`}>
      {label}
      {chip}
    </li>
  )
}

function SetupSkeleton() {
  return (
    <div aria-busy="true">
      <div className="flex items-center gap-3.5">
        <Skeleton className="size-14 rounded-full" />
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="mt-3 flex justify-between">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-[22px] w-14 rounded-full" />
        </div>
      ))}
    </div>
  )
}
