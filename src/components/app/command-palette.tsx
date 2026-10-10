import { useNavigate } from '@tanstack/react-router'
import { Building2, LogOut, Monitor, Moon, Sun } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command'
import { logout, switchTenant, useMe } from '@/lib/auth'
import { useNavItems } from '@/lib/nav'
import { useTheme } from './theme'

const Ctx = createContext<{ open: boolean; setOpen: (v: boolean) => void } | null>(null)

export function useCommandPalette() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useCommandPalette outside CommandPaletteProvider')
  return ctx
}

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const value = useMemo(() => ({ open, setOpen }), [open])
  return (
    <Ctx.Provider value={value}>
      {children}
      <CommandPalette open={open} setOpen={setOpen} />
    </Ctx.Provider>
  )
}

function CommandPalette({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const navigate = useNavigate()
  const items = useNavItems()
  const { data: me } = useMe()
  const { setTheme } = useTheme()
  const run = useCallback(
    (fn: () => void) => {
      setOpen(false)
      fn()
    },
    [setOpen],
  )
  const otherTenants = me ? me.memberships.filter((m) => m.tenant_id !== me.tenant_id) : []

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Command palette" description="Jump to a page or run a command">
      <CommandInput placeholder="Go to page or run a command…" />
      <CommandList>
        <CommandEmpty>No matches.</CommandEmpty>
        <CommandGroup heading="Go to">
          {items.map((item) => (
            <CommandItem
              key={item.id}
              value={`${item.label} ${item.keywords?.join(' ') ?? ''}`}
              onSelect={() => run(() => void navigate({ to: item.to }))}
            >
              <item.icon />
              {item.label}
              <span className="ml-2 truncate text-xs text-muted-foreground">{item.description}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        {otherTenants.length ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="Switch brand">
              {otherTenants.map((m) => (
                <CommandItem
                  key={m.tenant_id}
                  value={`switch brand ${m.tenant_name}`}
                  onSelect={() =>
                    run(() => void switchTenant(m.tenant_id).then(() => navigate({ to: '/' }), () => undefined))
                  }
                >
                  <Building2 />
                  {m.tenant_name}
                  <CommandShortcut>{m.role}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        ) : null}
        <CommandSeparator />
        <CommandGroup heading="Theme">
          <CommandItem value="theme light" onSelect={() => run(() => setTheme('light'))}>
            <Sun /> Light theme
          </CommandItem>
          <CommandItem value="theme dark" onSelect={() => run(() => setTheme('dark'))}>
            <Moon /> Dark theme
          </CommandItem>
          <CommandItem value="theme system" onSelect={() => run(() => setTheme('system'))}>
            <Monitor /> System theme
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Session">
          <CommandItem value="sign out log out" onSelect={() => run(() => void logout())}>
            <LogOut /> Sign out
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
