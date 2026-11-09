import { createFileRoute, Link, Outlet, useRouterState } from '@tanstack/react-router'
import { useLayoutEffect, useRef } from 'react'
import { CONCEPT_ICON } from '@/components/la/concept-icons'
import { IconGlyph, type IconSource } from '@/components/la/icons'
import { NOT_YET } from '@/components/la/unavailable'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useCan, type Policy } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { ScrollPane, SplitLayout } from '@/components/app/split-layout'

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
  /**
   * The group heading this item sits under (sentence case, as the sidebar's section labels). The
   * heading renders before the first visible item of each group, so a group keeps its heading
   * when a role hides one of its items.
   */
  group?: string
}

/**
 * Hi-fi items, grouped: what the brand sells by, how the agent works, the workspace, and you.
 * Within each group the hi-fi order is kept. Every item and its route stay; Soon items stay.
 */
const SETTINGS_ITEMS: readonly SubItem[] = [
  { label: 'Brand profile', icon: CONCEPT_ICON.brandProfile, to: '/brand', group: 'Brand' },
  { label: 'Compliance', icon: 'shield', to: '/settings/compliance', group: 'Brand' },
  { label: 'Marketplace rules', icon: CONCEPT_ICON.rules, to: '/rules', group: 'Brand' },
  { label: 'Autonomy', icon: 'sliders', to: '/settings', group: 'Agent' },
  { label: 'Notifications', icon: 'bell', reason: NOT_YET.notifications, group: 'Agent' },
  { label: 'Team and brands', icon: 'users', to: '/team', action: 'team:manage', group: 'Workspace' },
  { label: 'Imports history', icon: 'table', to: '/settings/imports', group: 'Workspace' },
  { label: 'Audit log', icon: CONCEPT_ICON.auditLog, reason: NOT_YET.auditLog, group: 'Workspace' },
  { label: 'Account', icon: 'user', to: '/account', group: 'You' },
  { label: 'Security', icon: 'lock', to: '/settings/security', group: 'You' },
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
    // From 1024px the sub-nav and the page scroll on their own: a long page never carries the nav
    // away, and the page starts at its top on each settings link.
    <SplitLayout className="min-h-[calc(100svh-56px)] grid-rows-[auto_1fr] lg:min-h-0 lg:grid-cols-[200px_minmax(0,1fr)] lg:grid-rows-1">
      <ScrollPane
        as="nav"
        ref={navRef}
        scrollId="settings-nav"
        aria-label="Settings"
        data-testid="settings-nav"
        className="flex scroll-pr-8 scroll-pl-3 items-start gap-0.5 self-start overflow-x-auto border-b border-line bg-canvas px-3 py-2 lg:flex-col lg:items-stretch lg:self-stretch lg:overflow-x-hidden lg:border-r lg:border-b-0 lg:py-6"
      >
        {items.map((i, n) => (
          <div key={i.label} className="contents">
            {/* Headings are for the 200px column only; the sideways scroller below 1024px stays one row. */}
            {i.group && i.group !== items[n - 1]?.group ? (
              <p className={cn('hidden px-3 pb-1 text-caption text-ink-3 lg:block', n === 0 ? 'pt-0' : 'pt-4')}>{i.group}</p>
            ) : null}
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
      </ScrollPane>
      <ScrollPane scrollId="settings-page" resetOnNavigate data-testid="settings-page">
        <Outlet />
      </ScrollPane>
    </SplitLayout>
  )
}
