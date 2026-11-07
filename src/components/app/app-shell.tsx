/**
 * App shell (hi-fi p05-p19): sidebar 232 (72 collapsed) + main column with a 56px white top bar
 * (page title and avatar) over the canvas content area. Product search and notifications have no
 * API, so the top bar does not show them. Below 768px the sidebar is a
 * drawer opened from the top bar.
 */
import { Outlet, useRouterState } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { Icon } from '@/components/la/icons'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { activeNavId, NAV_ITEMS } from '@/lib/nav'
import { useRouteMeta } from '@/lib/route-meta'
import { useScrolled } from '@/lib/use-scrolled'
import { cn } from '@/lib/utils'
import { AppSidebar } from './app-sidebar'
import { CommandPaletteProvider } from './command-palette'
import { UserMenu } from './user-menu'

const SIDEBAR_KEY = 'la.sidebar'
export type Pref = 'open' | 'collapsed' | null

/** The saved sidebar choice (also read by the first-load placeholder in routes/_app). */
export function readPref(): Pref {
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
    <header data-scrolled={scrolled || undefined} className="material-bar sticky top-[var(--banner-h,0px)] z-30 h-14 shrink-0">
      {/* Same width and gutters as <Page>, so the title lines up with the page h1 and the avatar
          with the content's right edge on wide screens. */}
      <div className="mx-auto flex h-full w-full max-w-[var(--page-max)] items-center gap-3.5 px-4 md:px-7">
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Open navigation"
          className="tactile press -ml-1 inline-flex size-10 items-center justify-center rounded-tile text-ink-2 hover:bg-hover active:shadow-pressed md:hidden md:size-9"
        >
          <Icon name="menu" size={20} />
        </button>
        {/* Not a heading: each page's outline starts at its own h1. */}
        <p className="min-w-0 truncate font-sans text-[15px] font-bold text-ink" data-testid="page-title">
          {title}
        </p>
        <div className="ml-auto flex items-center gap-2 md:gap-3.5">
          <UserMenu />
        </div>
      </div>
      {/* Screen readers hear the new page name after a route change. */}
      <p aria-live="polite" className="sr-only">
        {title}
      </p>
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
  // After a route change (path only, so filters in the URL never steal focus), move focus to the
  // content so keyboard and screen reader users start at the new page, not the old link.
  const firstPath = useRef(true)
  useEffect(() => {
    if (firstPath.current) {
      firstPath.current = false
      return
    }
    document.getElementById('main')?.focus({ preventScroll: true })
  }, [pathname])
  useEffect(() => {
    document.title = title ? `${title} · Kuinn` : 'Kuinn'
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
          'grid min-h-svh grid-cols-1 bg-canvas md:transition-[grid-template-columns] md:duration-200 md:ease-[var(--ease-tactile)] motion-reduce:transition-none',
          collapsed ? 'md:grid-cols-[72px_minmax(0,1fr)]' : 'md:grid-cols-[232px_minmax(0,1fr)]',
        )}
      >
        <aside className="sticky top-[var(--banner-h,0px)] hidden h-[calc(100svh-var(--banner-h,0px))] md:block">
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
          <SheetDescription className="sr-only">Pages in Kuinn</SheetDescription>
          <AppSidebar collapsed={false} onNavigate={() => setDrawer(false)} className="border-r-0" />
        </SheetContent>
      </Sheet>
    </CommandPaletteProvider>
  )
}
