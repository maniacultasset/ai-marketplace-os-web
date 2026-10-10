import { useQuery } from '@tanstack/react-query'
import { Link, useRouterState } from '@tanstack/react-router'
import { probe } from '@/api/client'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'
import { Kbd } from '@/components/ui/kbd'
import { NAV_SECTIONS, useNavItems } from '@/lib/nav'
import { cn } from '@/lib/utils'
import { BrandMark } from './brand-mark'

/** Live API readiness from GET /readyz, re-checked every minute. */
function ApiStatus() {
  const ready = useQuery({
    queryKey: ['system', 'readyz'],
    queryFn: () => probe('/readyz'),
    refetchInterval: 60_000,
    staleTime: 30_000,
  })
  const state = ready.isPending ? 'checking' : ready.data?.ok ? 'ok' : 'down'
  const label = { checking: 'Checking API…', ok: 'API connected', down: 'API not ready' }[state]
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status" aria-live="polite">
      <span className="relative flex size-2" aria-hidden>
        {state === 'ok' ? (
          <span className="absolute inset-0 animate-ping rounded-full bg-success/50 [animation-duration:2.4s] [animation-iteration-count:3]" />
        ) : null}
        <span
          className={cn(
            'relative size-2 rounded-full',
            state === 'ok' && 'bg-success',
            state === 'down' && 'bg-destructive',
            state === 'checking' && 'bg-muted-foreground/40',
          )}
        />
      </span>
      {label}
    </div>
  )
}

export function AppSidebar() {
  const items = useNavItems('main')
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const { setOpenMobile } = useSidebar()

  const sections = NAV_SECTIONS.map((section) => ({
    section,
    items: items.filter((i) => (i.section ?? 'Catalog') === section),
  })).filter((s) => s.items.length > 0)

  return (
    <Sidebar collapsible="icon" variant="inset" aria-label="Main navigation">
      <SidebarHeader className="h-14 justify-center px-3 group-data-[collapsible=icon]:px-2">
        <Link
          to="/"
          className="flex min-w-0 items-center gap-2.5 rounded-lg px-1 outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <BrandMark />
          <span className="truncate text-[0.9375rem] font-semibold tracking-tight text-sidebar-accent-foreground group-data-[collapsible=icon]:hidden">
            Marketplace OS
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent className="gap-0 pt-1" data-testid="main-nav">
        {sections.map(({ section, items: sectionItems }) => (
          <SidebarGroup key={section} className="py-1.5">
            <SidebarGroupLabel className="h-7 text-[0.6875rem] font-medium tracking-wide text-muted-foreground/80 uppercase">
              {section}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {sectionItems.map((item) => {
                  const active = pathname === item.to || pathname.startsWith(`${item.to}/`)
                  return (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                        <Link to={item.to} onClick={() => setOpenMobile(false)} data-nav-id={item.id}>
                          <item.icon />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="gap-3 px-4 pb-4 group-data-[collapsible=icon]:hidden">
        <ApiStatus />
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
          <span>to jump anywhere</span>
        </p>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
