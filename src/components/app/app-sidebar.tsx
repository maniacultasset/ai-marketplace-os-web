/**
 * Sidebar (hi-fi app shell): 232px white column (72px icon rail when collapsed), Kuinn
 * mark, brand switcher, nav (38px rows, 40px on touch; active = brand label on one raised tile
 * that slides between rows), Platform section for platform admins, Agent status card at the
 * bottom, collapse control.
 */
import { Link, useRouterState } from '@tanstack/react-router'
import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { Icon, LogoMark } from '@/components/la/icons'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { InboxNavBadge } from '@/features/inbox/inbox-nav-badge'
import { useInboxBadgeLabel } from '@/features/inbox/use-inbox-badge'
import { activeNavId, NAV_SECTIONS, useNavItems, type NavItem } from '@/lib/nav'
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
  const navRef = useRef<HTMLDivElement>(null)
  const indicatorY = useActiveRowOffset(navRef, activeId, collapsed)

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
        aria-label="Kuinn home"
      >
        <LogoMark />
        <span className={cn(collapsed && 'sr-only')}>Kuinn</span>
      </Link>
      <BrandSwitcher collapsed={collapsed} />
      <div ref={navRef} data-testid="main-nav" className="relative flex flex-col gap-0.5">
        {/* One raised tile under the active row; it slides to the new row on navigation. */}
        {indicatorY === null ? null : (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-11 rounded-tile border border-line bg-surface shadow-raised-sm transition-transform duration-[var(--dur-spring)] ease-[var(--ease-spring)] motion-reduce:transition-none md:h-[38px]"
            style={{ transform: `translateY(${indicatorY}px)` }}
          />
        )}
        {sections.map(({ section, items: sectionItems }) => (
          <div key={section} className="flex flex-col gap-0.5" role="group" aria-label={section === 'Main' ? undefined : section}>
            {section !== 'Main' ? (
              <p className={cn('mt-4 mb-1 px-2.5 text-caption text-ink-3', collapsed && 'sr-only')}>{section}</p>
            ) : null}
            {sectionItems.map((item) =>
              item.id === 'inbox' ? (
                <InboxNavRow key={item.id} item={item} active={item.id === activeId} collapsed={collapsed} onNavigate={onNavigate} />
              ) : (
                <NavRow key={item.id} item={item} active={item.id === activeId} collapsed={collapsed} onNavigate={onNavigate} />
              ),
            )}
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
            'tactile press mt-2 flex h-10 items-center gap-2.5 rounded-tile px-2.5 text-caption font-semibold text-ink-3 hover:bg-hover hover:text-ink active:shadow-pressed',
            'md:h-8',
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

interface RowProps {
  item: NavItem
  active: boolean
  collapsed: boolean
  onNavigate?: () => void
}

/** Inbox row: carries the open count, as a pill (expanded) or a corner badge on the icon (rail). */
function InboxNavRow(props: RowProps) {
  const label = useInboxBadgeLabel()
  return <NavRow {...props} badge={label} />
}

function NavRow({ item, active, collapsed, onNavigate, badge = null }: RowProps & { badge?: string | null }) {
  // In the rail the label is visually hidden, so the count goes into the name and the tooltip.
  const name = collapsed && badge ? `${item.label}, ${badge} open` : undefined
  const link = (
    <Link
      to={item.to}
      onClick={onNavigate}
      data-nav-id={item.id}
      aria-current={active ? 'page' : undefined}
      aria-label={name}
      className={cn(
        'tactile press relative z-10 flex h-11 items-center gap-2.5 rounded-tile border border-transparent px-2.5 font-semibold text-ink-2 hover:bg-hover hover:text-ink active:shadow-pressed md:h-[38px]',
        // Active: the brand label over the sliding tile, the icon in a brand tint. Only the
        // colour changes, so the label never reflows.
        active && 'text-brand hover:bg-transparent hover:text-brand',
        collapsed && 'justify-center px-0',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'tactile relative -ml-1 inline-flex size-7 shrink-0 items-center justify-center rounded-lg',
          active && 'bg-brand-bg text-brand',
          collapsed && 'ml-0',
        )}
      >
        <NavIcon icon={item.icon} />
        {collapsed ? <InboxNavBadge label={badge} compact /> : null}
      </span>
      <span className={cn('truncate', collapsed && 'sr-only')}>{item.label}</span>
      {collapsed ? null : <InboxNavBadge label={badge} />}
    </Link>
  )
  return collapsed ? (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{name ?? item.label}</TooltipContent>
    </Tooltip>
  ) : (
    <div>{link}</div>
  )
}

/**
 * offsetTop of the active row inside the nav list (null when no row is active). Re-read after
 * route changes, collapse and resize (row heights change at md, sections can wrap).
 */
function useActiveRowOffset(listRef: RefObject<HTMLDivElement | null>, activeId: string | null, collapsed: boolean) {
  const [y, setY] = useState<number | null>(null)
  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    const measure = () => {
      const row = activeId ? list.querySelector<HTMLElement>(`[data-nav-id="${CSS.escape(activeId)}"]`) : null
      setY(row ? offsetWithin(row, list) : null)
    }
    measure()
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    ro?.observe(list)
    window.addEventListener('resize', measure)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [listRef, activeId, collapsed])
  return y
}

/** offsetTop summed up to `ancestor` (rows sit inside section groups and tooltip wrappers). */
function offsetWithin(el: HTMLElement, ancestor: HTMLElement) {
  let top = 0
  let node: HTMLElement | null = el
  while (node && node !== ancestor) {
    top += node.offsetTop
    node = node.offsetParent as HTMLElement | null
  }
  return top
}
