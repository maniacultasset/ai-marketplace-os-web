import { createFileRoute, Link, Outlet, useRouterState } from '@tanstack/react-router'
import { useLayoutEffect, useRef } from 'react'
import { CONCEPT_ICON } from '@/components/la/concept-icons'
import { IconGlyph, type IconSource } from '@/components/la/icons'
import { NOT_YET } from '@/components/la/unavailable'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useCan, type Policy } from '@/lib/permissions'

/**
 * Settings area (hi-fi 19): a 200px sub-nav beside the page from 1024px, a horizontal scroller
 * above it below that. Pathless, so the existing /brand, /team, /rules and /account URLs keep
 * working inside it. Sign-up requests is a platform page in the main nav, not a setting.
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

interface SubItem {
  label: string
  icon: IconSource
  to?: SubPath
  action?: Policy
  /** Not available yet: shown disabled with this reason. */
  reason?: string
  /** Starts a new group with this heading (sentence case, as the sidebar's section labels). */
  group?: string
}

/** Hi-fi order (Brand profile … Audit log), then this build's extra pages. */
const SETTINGS_ITEMS: readonly SubItem[] = [
  { label: 'Brand profile', icon: CONCEPT_ICON.brandProfile, to: '/brand' },
  { label: 'Compliance', icon: 'shield', to: '/settings/compliance' },
  { label: 'Autonomy', icon: 'sliders', to: '/settings' },
  { label: 'Notifications', icon: 'bell', reason: NOT_YET.notifications },
  { label: 'Team and brands', icon: 'users', to: '/team', action: 'team:manage' },
  { label: 'Marketplace rules', icon: CONCEPT_ICON.rules, to: '/rules' },
  { label: 'Imports history', icon: 'table', to: '/settings/imports' },
  { label: 'Audit log', icon: CONCEPT_ICON.auditLog, reason: NOT_YET.auditLog },
  { label: 'Account', icon: 'user', to: '/account' },
  { label: 'Security', icon: 'lock', to: '/settings/security' },
]

/** Shared by links and the disabled "Soon" rows, so both sit on the same box and line up. */
const ROW = 'flex shrink-0 items-center gap-2.5 rounded-tile border border-transparent px-3 py-2 whitespace-nowrap max-lg:min-h-11'

const LINK = `tactile ${ROW} text-ink-2 hover:bg-hover hover:text-ink active:shadow-pressed [&_svg]:text-ink-3 [&[data-status=active]_svg]:text-brand data-[status=active]:border-line data-[status=active]:bg-surface data-[status=active]:font-bold data-[status=active]:text-brand data-[status=active]:shadow-raised-sm`

function SettingsLayout() {
  const can = useCan()
  const items = SETTINGS_ITEMS.filter((i) => !i.action || can(i.action))
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const navRef = useRef<HTMLElement>(null)
  // Below 1024px the nav scrolls sideways: keep the active item in view after each navigation.
  useLayoutEffect(() => {
    const active = navRef.current?.querySelector<HTMLElement>('[data-status="active"]')
    active?.scrollIntoView?.({ inline: 'center', block: 'nearest' })
  }, [pathname])
  return (
    <div className="grid min-h-[calc(100svh-56px)] grid-cols-1 grid-rows-[auto_1fr] lg:grid-cols-[200px_minmax(0,1fr)] lg:grid-rows-1">
      <nav
        ref={navRef}
        aria-label="Settings"
        data-testid="settings-nav"
        className="flex scroll-pr-8 scroll-pl-3 items-start gap-0.5 self-start overflow-x-auto border-b border-line bg-canvas px-3 py-2 lg:flex-col lg:items-stretch lg:self-stretch lg:overflow-visible lg:border-r lg:border-b-0 lg:py-6"
      >
        {items.map((i) => (
          <div key={i.label} className="contents">
            {i.group ? <p className="hidden px-3 pt-4 pb-1 text-caption text-ink-3 lg:block">{i.group}</p> : null}
            {i.to ? (
              <Link to={i.to} activeOptions={{ exact: i.to === '/settings', includeSearch: false }} className={LINK}>
                <IconGlyph icon={i.icon} size={16} />
                {i.label}
              </Link>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0} aria-disabled className={`focus-ring ${ROW} cursor-not-allowed text-ink-3`}>
                    <IconGlyph icon={i.icon} size={16} className="text-ink-3" />
                    {i.label}
                    <span className="text-caption font-semibold">Soon</span>
                  </span>
                </TooltipTrigger>
                <TooltipContent>{i.reason}</TooltipContent>
              </Tooltip>
            )}
          </div>
        ))}
        {/* Right-edge cue that more items scroll in (horizontal layout only). */}
        <span aria-hidden className="pointer-events-none sticky right-0 w-6 shrink-0 self-stretch bg-linear-to-l from-canvas lg:hidden" />
      </nav>
      <div className="min-w-0">
        <Outlet />
      </div>
    </div>
  )
}
