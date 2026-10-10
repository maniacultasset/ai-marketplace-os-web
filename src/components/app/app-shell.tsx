import { Outlet } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { AppSidebar } from './app-sidebar'
import { CommandPaletteProvider, useCommandPalette } from './command-palette'
import { TenantSwitcher } from './tenant-switcher'
import { UserMenu } from './user-menu'

const SIDEBAR_KEY = 'mkos.sidebar'

function readSidebar() {
  try {
    return localStorage.getItem(SIDEBAR_KEY) !== 'collapsed'
  } catch {
    return true
  }
}

function TopBar() {
  const { setOpen } = useCommandPalette()
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur-md supports-[backdrop-filter]:bg-background/75 sm:px-4 md:rounded-t-xl">
      <SidebarTrigger className="-ml-1" aria-label="Toggle sidebar" />
      <div aria-hidden className="mx-1 h-4 w-px shrink-0 bg-border" />
      <TenantSwitcher />
      <div className="ml-auto flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          className="hidden h-8 w-64 justify-start gap-2 bg-muted/60 text-muted-foreground shadow-none hover:bg-muted sm:inline-flex"
          onClick={() => setOpen(true)}
        >
          <Search className="size-3.5" />
          <span className="flex-1 text-left font-normal">Search pages and actions…</span>
          <Kbd>⌘K</Kbd>
        </Button>
        <Button variant="ghost" size="icon" className="size-8 sm:hidden" aria-label="Open command palette" onClick={() => setOpen(true)}>
          <Search />
        </Button>
        <UserMenu />
      </div>
    </header>
  )
}

export function AppShell() {
  const [open, setOpen] = useState(readSidebar)
  return (
    <SidebarProvider
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        try {
          localStorage.setItem(SIDEBAR_KEY, v ? 'open' : 'collapsed')
        } catch {
          /* ignore */
        }
      }}
    >
      <CommandPaletteProvider>
        <AppSidebar />
        <SidebarInset className="min-w-0">
          <TopBar />
          <div id="main" className="min-w-0 flex-1">
            <Outlet />
          </div>
        </SidebarInset>
      </CommandPaletteProvider>
    </SidebarProvider>
  )
}
