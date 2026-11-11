/**
 * 05 Home, first run: shown while the brand has no listings. The checklist comes from the API:
 *   Brand profile               GET /tenants/me (tone, guidelines or glossary saved)
 *   Brand manufacturer          GET /brand-profile (default_manufacturer set)
 *   Connect a marketplace       GET /marketplaces/accounts (active accounts, of the 2 the API supports)
 *   Add a teammate who approves GET /members (someone else can approve: maker-checker); opens Invite on /team
 *     For an owner who works alone, or once owner approval is on (ADR-0031), the step is "Choose who
 *     approves": it opens the setting on Settings, with Invite as a second way, and is done once
 *     the setting is on or someone else can approve.
 *   Add your first product      GET /products?limit=1
 * The route cards open the V1 add screens (guided form, its photo-first start, bulk spreadsheet),
 * with the brand's connected marketplaces chosen.
 */
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Page, PageHeader } from '@/components/app/page-header'
import { CardHead, LaCard } from '@/components/la/cards'
import { CONCEPT_ICON } from '@/components/la/concept-icons'
import { IconTile, type IconSource } from '@/components/la/icons'
import { ProgressRing, Stepper } from '@/components/la/progress'
import { StatusChip } from '@/components/la/status-chip'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useBrandProfile } from '@/features/brand/api'
import { useCurrentMarketplaceAccounts } from '@/features/marketplaces/api'
import { useBrandManufacturer } from '@/features/products/api'
import { serializeListOn } from '@/features/products-add/list-on'
import { OWNER_APPROVAL_HASH, useApproverState } from '@/features/team-account/approver'
import { useCan } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { useHasProducts } from './api'
import { API_MARKETPLACES, brandProfileDone, setupProgress, setupSteps, type SetupStep } from './model'

type StepLink = '/setup/brand' | '/setup/manufacturer' | '/marketplaces' | '/team' | '/add'
const STEP_LINK: Record<SetupStep['id'], StepLink> = {
  brand: '/setup/brand',
  manufacturer: '/setup/manufacturer',
  marketplace: '/marketplaces',
  approver: '/team',
  product: '/add',
}

type RouteId = 'guided' | 'photos' | 'bulk'
const ROUTES: readonly { id: RouteId; icon: IconSource; title: string; sub: string; cta: string }[] = [
  { id: 'guided', icon: CONCEPT_ICON.guidedForm, title: 'Guided form', sub: 'One product, step by step.', cta: 'Start guided form' },
  { id: 'photos', icon: 'image', title: 'Photos and basics', sub: 'Start from photos. The agent reads the rest.', cta: 'Start with photos' },
  { id: 'bulk', icon: 'table', title: 'Import spreadsheet', sub: 'Many products at once.', cta: 'Upload spreadsheet' },
]

const afterSteps = (selfApproval: boolean) =>
  [
    { label: 'You add it' },
    { label: 'The agent prepares listings' },
    { label: selfApproval ? 'A person approves, then it is sent' : 'A teammate approves, then it is sent' },
    { label: 'We confirm it is live' },
  ] as const

/** The approver step's label when the owner can settle it with the owner approval setting. */
const CHOOSE_APPROVER_LABEL = 'Choose who approves'

export function FirstRun({ brand }: { brand: string }) {
  const can = useCan()
  const navigate = useNavigate()
  const profile = useBrandProfile()
  const manufacturer = useBrandManufacturer()
  const accounts = useCurrentMarketplaceAccounts()
  const products = useHasProducts()
  const approver = useApproverState()
  const [route, setRoute] = useState<RouteId>('guided')

  const loading = profile.isPending || manufacturer.isPending || accounts.isPending || products.isPending || approver === 'loading'
  const failed = profile.isError || manufacturer.isError || accounts.isError || products.isError
  // GET /members failing leaves only the teammate step unknown.
  const approverUnknown = approver === 'unknown'
  const connected = accounts.data ? API_MARKETPLACES.filter((m) => accounts.data.live[m]?.status === 'active') : []
  const selfApproval = profile.data?.data.owner_self_approval === true
  // An owner alone (setting off) or a brand with the setting on: the setting is the way forward,
  // so the step never asks only for a teammate invite.
  const chooseApprover = approver === 'owner_alone' || (selfApproval && approver === 'ok')
  const steps = setupSteps({
    brandDone: brandProfileDone(profile.data?.data),
    manufacturerDone: !!manufacturer.data?.data.default_manufacturer,
    activeAccounts: connected.length,
    approverDone: approver === 'ok',
    hasProducts: !!products.data,
  }).map((st) => (st.id === 'approver' && chooseApprover ? { ...st, label: CHOOSE_APPROVER_LABEL } : st))
  const progress = setupProgress(steps)
  const setupDone = !loading && !failed && !approverUnknown && steps.every((s) => s.id === 'product' || s.state === 'done')
  const canAdd = can('product:import')
  const selected = ROUTES.find((r) => r.id === route)!
  const on = serializeListOn(connected)
  const go = () => {
    if (route === 'bulk') void navigate({ to: '/add/bulk', search: on ? { on } : {} })
    else void navigate({ to: '/add/guided', search: { ...(on ? { on } : {}), ...(route === 'photos' ? { start: 'photos' as const } : {}) } })
  }

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
                    {failed || approverUnknown ? 'Some steps could not be checked.' : progress.line}
                  </p>
                </div>
              </div>
              <ul className="mt-4 flex flex-col gap-3">
                {steps.map((s) => (
                  <SetupRow
                    key={s.id}
                    step={s}
                    unknown={failed || (approverUnknown && s.id === 'approver')}
                    chooseApprover={chooseApprover}
                  />
                ))}
              </ul>
            </>
          )}
        </LaCard>

        <LaCard emphasis="selected" data-testid="routes-card">
          <h3 className="text-h3 text-ink">Fastest ways to your first listing</h3>
          <div role="radiogroup" aria-label="How to add your first product" className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {ROUTES.map((r) => {
              const checked = route === r.id
              return (
                <button
                  key={r.id}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  onClick={() => setRoute(r.id)}
                  data-testid={`route-${r.id}`}
                  className={cn(
                    'focus-ring tactile rounded-card border p-4 text-left',
                    checked
                      ? 'border-brand bg-brand-bg/60 shadow-selected-inset'
                      : 'lift border-line bg-surface shadow-raised-sm hover:border-line-strong active:shadow-pressed',
                  )}
                >
                  <IconTile icon={r.icon} tone="brand" size="lg" className="size-10 rounded-tile" />
                  <h4 className="mt-3 text-h3 text-ink">{r.title}</h4>
                  <p className="mt-1 text-small text-ink-2">{r.sub}</p>
                </button>
              )
            })}
          </div>
          {canAdd ? (
            <Button className="mt-4" onClick={go} disabled={accounts.isPending} data-testid="first-run-add">
              {selected.cta}
            </Button>
          ) : (
            <p className="mt-4 text-small text-ink-2">Your role cannot add products. Ask an owner or operator to add the first one.</p>
          )}
        </LaCard>
      </div>

      <LaCard className="mt-4">
        <CardHead title="What happens after you add a product" />
        <Stepper steps={afterSteps(selfApproval)} current={0} className="mt-4 max-md:flex-col" />
        <p className="mt-3 text-small text-ink-2" data-testid="after-steps-rule">
          {selfApproval
            ? 'You hear from us only if a fact is missing. Every listing waits for a person’s approval before it is sent. Owner approval is on, so an owner can approve their own listings, and each one is recorded.'
            : 'You hear from us only if a fact is missing. Every listing waits for a person’s approval before it is sent, and the person who starts a listing can’t approve it.'}
        </p>
      </LaCard>
    </Page>
  )
}

function SetupRow({ step, unknown, chooseApprover }: { step: SetupStep; unknown: boolean; chooseApprover: boolean }) {
  const to = STEP_LINK[step.id]
  const linkClass = cn('rounded-sm underline-offset-4 hover:underline', step.state === 'next' ? 'font-bold text-ink' : 'text-ink')
  const label =
    step.state !== 'done' ? (
      step.id === 'approver' && chooseApprover ? (
        // Opens the owner approval setting; inviting a reviewer is the other way.
        <span className="flex flex-wrap items-baseline gap-x-2">
          <Link to="/settings" hash={OWNER_APPROVAL_HASH} className={linkClass}>
            {step.label}
          </Link>
          <Link to="/team" search={{ invite: 1 }} className="rounded-sm text-small text-ink-2 underline-offset-4 hover:underline">
            or invite a reviewer
          </Link>
        </span>
      ) : step.id === 'approver' ? (
        // Opens "Invite a teammate" on the Team page.
        <Link to="/team" search={{ invite: 1 }} className={linkClass}>
          {step.label}
        </Link>
      ) : (
        <Link to={to} className={linkClass}>
          {step.label}
        </Link>
      )
    ) : (
      <span className="text-ink">{step.label}</span>
    )
  let chip
  if (unknown) chip = <StatusChip status="not-listed">Unknown</StatusChip>
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
      <div className="mt-4 flex flex-col gap-3">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center justify-between">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-[22px] w-14 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
