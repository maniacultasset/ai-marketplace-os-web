import { createFileRoute, Link, Outlet } from '@tanstack/react-router'
import { NOT_YET } from '@/components/la/unavailable'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useCan, type Policy } from '@/lib/permissions'

/**
 * Settings area (hi-fi 19): a 200px sub-nav beside the page. Pathless, so the existing
 * /brand, /team, /rules, /account and /admin/signups URLs keep working inside it.
 */
export const Route = createFileRoute('/_app/_settings')({
  staticData: { title: 'Settings' },
  component: SettingsLayout,
})

type SubPath =
  | '/brand'
  | '/settings/compliance'
  | '/settings'
  | '/team'
  | '/rules'
  | '/settings/imports'
  | '/account'
  | '/settings/security'
  | '/admin/signups'

interface SubItem {
  label: string
  to?: SubPath
  action?: Policy
  /** Not available yet: shown disabled with this reason. */
  reason?: string
  /** Starts a new group with this heading. */
  group?: string
}

/** Hi-fi order (Brand profile … Audit log), then this build's extra pages, then Platform. */
const SETTINGS_ITEMS: readonly SubItem[] = [
  { label: 'Brand profile', to: '/brand' },
  { label: 'Compliance', to: '/settings/compliance' },
  { label: 'Autonomy', to: '/settings' },
  { label: 'Notifications', reason: NOT_YET.notifications },
  { label: 'Team and brands', to: '/team', action: 'team:manage' },
  { label: 'Marketplace rules', to: '/rules' },
  { label: 'Imports history', to: '/settings/imports' },
  { label: 'Audit log', reason: NOT_YET.auditLog },
  { label: 'Account', to: '/account' },
  { label: 'Security', to: '/settings/security' },
  { label: 'Sign-up requests', to: '/admin/signups', action: 'platform:admin', group: 'Platform' },
]

const LINK =
  'tactile shrink-0 rounded-[10px] border border-transparent px-3 py-2 whitespace-nowrap text-ink-2 hover:bg-hover hover:text-ink active:shadow-pressed data-[status=active]:border-line data-[status=active]:bg-surface data-[status=active]:font-bold data-[status=active]:text-brand data-[status=active]:shadow-raised-sm'

function SettingsLayout() {
  const can = useCan()
  const items = SETTINGS_ITEMS.filter((i) => !i.action || can(i.action))
  return (
    <div className="grid min-h-[calc(100svh-56px)] grid-cols-1 grid-rows-[auto_1fr] md:grid-cols-[200px_minmax(0,1fr)] md:grid-rows-1">
      <nav
        aria-label="Settings"
        data-testid="settings-nav"
        className="flex items-start gap-0.5 self-start overflow-x-auto border-b border-line bg-canvas px-3 py-2 md:flex-col md:items-stretch md:self-stretch md:overflow-visible md:border-r md:border-b-0 md:py-6"
      >
        {items.map((i) => (
          <div key={i.label} className="contents">
            {i.group ? (
              <p className="hidden px-3 pt-4 pb-1 text-caption font-semibold tracking-wide text-ink-3 uppercase md:block">
                {i.group}
              </p>
            ) : null}
            {i.to ? (
              <Link to={i.to} activeOptions={{ exact: i.to === '/settings', includeSearch: false }} className={LINK}>
                {i.label}
              </Link>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    tabIndex={0}
                    aria-disabled
                    className="focus-ring flex shrink-0 cursor-not-allowed items-center gap-2 rounded-control px-3 py-2 whitespace-nowrap text-ink-3"
                  >
                    {i.label}
                    <span className="text-caption font-semibold">Soon</span>
                  </span>
                </TooltipTrigger>
                <TooltipContent>{i.reason}</TooltipContent>
              </Tooltip>
            )}
          </div>
        ))}
      </nav>
      <div className="min-w-0">
        <Outlet />
      </div>
    </div>
  )
}
