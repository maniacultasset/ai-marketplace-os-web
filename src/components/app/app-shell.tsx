/**
 * App shell (hi-fi p05-p19): sidebar 232 (72 collapsed) + main column with a 56px white top bar
 * (page title, search, bell, avatar) over the canvas content area. Below 768px the sidebar is a
 * drawer opened from the top bar.
 */
import { Outlet, useRouterState } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Icon } from '@/components/la/icons'
import { NOT_YET } from '@/components/la/unavailable'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { activeNavId, NAV_ITEMS } from '@/lib/nav'
import { useRouteMeta } from '@/lib/route-meta'
import { useScrolled } from '@/lib/use-scrolled'
import { cn } from '@/lib/utils'
import { AppSidebar } from './app-sidebar'
import { CommandPaletteProvider } from './command-palette'
import { UserMenu } from './user-menu'

const SIDEBAR_KEY = 'la.sidebar'
type Pref = 'open' | 'collapsed' | null

function readPref(): Pref {
  try {
    const v = localStorage.getItem(SIDEBAR_KEY)
    return v === 'open' || v === 'collapsed' ? v : null
  } catch {
    return null
  }
}

function writePref(v: Pref) {
  try {
    if (v) localStorage.setItem(SIDEBAR_KEY, v)
    else localStorage.removeItem(SIDEBAR_KEY)
  } catch {
    /* storage blocked: the choice lasts for this page view */
  }
}

function TopBar({ title, onOpenMenu }: { title: string; onOpenMenu: () => void }) {
  const scrolled = useScrolled()
  return (
    <header
      data-scrolled={scrolled || undefined}
      className="material-bar sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3.5 px-4 md:px-7"
    >
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Open navigation"
        className="tactile press -ml-1 inline-flex size-9 items-center justify-center rounded-[10px] text-ink-2 hover:bg-hover active:shadow-pressed md:hidden"
      >
        <Icon name="menu" size={20} />
      </button>
      <h2 className="min-w-0 truncate font-sans text-[15px] font-bold text-ink" data-testid="page-title">
        {title}
      </h2>
      <div className="ml-auto flex items-center gap-2 md:gap-3.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              role="search"
              aria-disabled
              tabIndex={0}
              aria-label="Search products, SKUs (not available yet)"
              className="inset-field hidden h-[34px] w-60 cursor-not-allowed items-center gap-2 rounded-[10px] border px-2.5 text-small text-ink-3 sm:flex"
            >
              <Icon name="search" size={16} />
              <span className="truncate">Search products, SKUs</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>{NOT_YET.productSearch}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-disabled
              aria-label="Notifications (coming soon)"
              onClick={(e) => e.preventDefault()}
              className="inline-flex size-9 cursor-not-allowed items-center justify-center rounded-[10px] text-ink-2"
            >
              <Icon name="bell" size={20} />
            </button>
          </TooltipTrigger>
          <TooltipContent>{NOT_YET.notifications}</TooltipContent>
        </Tooltip>
        <UserMenu />
      </div>
    </header>
  )
}

export function AppShell() {
  const [pref, setPref] = useState<Pref>(readPref)
  const [drawer, setDrawer] = useState(false)
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const meta = useRouteMeta()
  const collapsed = pref ? pref === 'collapsed' : meta.navCollapsed
  const navId = activeNavId(NAV_ITEMS, pathname)
  const title = meta.title ?? NAV_ITEMS.find((i) => i.id === navId)?.label ?? ''

  useEffect(() => setDrawer(false), [pathname])
  useEffect(() => {
    document.title = title ? `${title} · Listing Agent` : 'Listing Agent'
  }, [title])

  return (
    <CommandPaletteProvider>
      <a
        href="#main"
        className="sr-only z-50 rounded-control bg-surface px-3 py-2 font-semibold text-brand focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <div
        className={cn(
          'grid min-h-svh grid-cols-1 bg-canvas',
          collapsed ? 'md:grid-cols-[72px_minmax(0,1fr)]' : 'md:grid-cols-[232px_minmax(0,1fr)]',
        )}
      >
        <aside className="sticky top-0 hidden h-svh md:block">
          <AppSidebar
            collapsed={collapsed}
            onToggleCollapsed={() => {
              const next = collapsed ? 'open' : 'collapsed'
              // Back to the route default when the choice matches it, so p07/p15 stay collapsed.
              const v: Pref = (next === 'collapsed') === meta.navCollapsed ? null : next
              setPref(v)
              writePref(v)
            }}
          />
        </aside>
        <div className="flex min-w-0 flex-col">
          <TopBar title={title} onOpenMenu={() => setDrawer(true)} />
          <main id="main" tabIndex={-1} className="min-w-0 flex-1 outline-none">
            <Outlet />
          </main>
        </div>
      </div>
      <Sheet open={drawer} onOpenChange={setDrawer}>
        <SheetContent side="left" className="w-[264px] max-w-[85vw] gap-0 p-0" showCloseButton={false}>
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">Pages in Listing Agent</SheetDescription>
          <AppSidebar collapsed={false} onNavigate={() => setDrawer(false)} className="border-r-0" />
        </SheetContent>
      </Sheet>
    </CommandPaletteProvider>
  )
}
