/**
 * Sidebar (hi-fi app shell): 232px white column (72px icon rail when collapsed), Listing Agent
 * mark, brand switcher, nav (38px rows, active = brand tint), Platform section for platform
 * admins, Agent status card at the bottom, collapse control.
 */
import { Link, useRouterState } from '@tanstack/react-router'
import { Icon, LogoMark } from '@/components/la/icons'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { InboxNavBadge } from '@/features/inbox/inbox-nav-badge'
import { activeNavId, NAV_SECTIONS, useNavItems } from '@/lib/nav'
import { cn } from '@/lib/utils'
import { AgentStatusCard } from './agent-status'
import { BrandSwitcher } from './brand-switcher'
import { NavIcon } from './nav-icon'

export function AppSidebar({
  collapsed,
  onToggleCollapsed,
  onNavigate,
  className,
}: {
  collapsed: boolean
  /** Omit to hide the collapse control (mobile drawer). */
  onToggleCollapsed?: () => void
  onNavigate?: () => void
  className?: string
}) {
  const items = useNavItems('main')
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const activeId = activeNavId(items, pathname)
  const sections = NAV_SECTIONS.map((section) => ({ section, items: items.filter((i) => (i.section ?? 'Main') === section) })).filter(
    (s) => s.items.length > 0,
  )

  return (
    <nav
      aria-label="Main navigation"
      data-collapsed={collapsed || undefined}
      className={cn('flex h-full flex-col gap-0.5 border-r border-line bg-canvas px-3 py-4', className)}
    >
      <Link
        to="/home"
        onClick={onNavigate}
        className={cn('mb-3.5 flex items-center gap-2.5 rounded-control px-1.5 font-display text-[15px] font-bold text-ink', collapsed && 'justify-center px-0')}
        aria-label="Listing Agent home"
      >
        <LogoMark />
        <span className={cn(collapsed && 'sr-only')}>Listing Agent</span>
      </Link>
      <BrandSwitcher collapsed={collapsed} />
      <div data-testid="main-nav" className="flex flex-col gap-0.5">
        {sections.map(({ section, items: sectionItems }) => (
          <div key={section} className="flex flex-col gap-0.5" role="group" aria-label={section === 'Main' ? undefined : section}>
            {section !== 'Main' ? (
              <p className={cn('mt-4 mb-1 px-2.5 text-caption text-ink-3', collapsed && 'sr-only')}>{section}</p>
            ) : null}
            {sectionItems.map((item) => {
              const active = item.id === activeId
              const link = (
                <Link
                  to={item.to}
                  onClick={onNavigate}
                  data-nav-id={item.id}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'tactile press flex h-[38px] items-center gap-2.5 rounded-[10px] border border-transparent px-2.5 font-medium text-ink-2 hover:bg-hover hover:text-ink active:shadow-pressed',
                    // Active: a raised matte tile with the brand label, the icon in a brand tint.
                    active && 'border-line bg-surface font-bold text-brand shadow-raised-sm hover:bg-surface hover:text-brand',
                    collapsed && 'justify-center px-0',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'tactile -ml-1 inline-flex size-7 shrink-0 items-center justify-center rounded-[8px]',
                      active && 'bg-brand-bg text-brand',
                      collapsed && 'ml-0',
                    )}
                  >
                    <NavIcon icon={item.icon} />
                  </span>
                  <span className={cn('truncate', collapsed && 'sr-only')}>{item.label}</span>
                  {item.id === 'inbox' && !collapsed ? <InboxNavBadge /> : null}
                </Link>
              )
              return collapsed ? (
                <Tooltip key={item.id}>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              ) : (
                <div key={item.id}>{link}</div>
              )
            })}
          </div>
        ))}
      </div>
      {collapsed ? <div className="mt-auto" /> : <AgentStatusCard />}
      {onToggleCollapsed ? (
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          className={cn(
            'tactile press mt-2 flex h-8 items-center gap-2.5 rounded-[10px] px-2.5 text-caption font-semibold text-ink-3 hover:bg-hover hover:text-ink active:shadow-pressed',
            collapsed && 'justify-center px-0',
          )}
        >
          <Icon name="panel" size={16} />
          <span className={cn(collapsed && 'sr-only')}>{collapsed ? 'Expand' : 'Collapse'}</span>
        </button>
      ) : null}
    </nav>
  )
}
