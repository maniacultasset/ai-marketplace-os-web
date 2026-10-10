import { Link } from '@tanstack/react-router'
import { LogOut } from 'lucide-react'
import { useState } from 'react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { logout, useMe } from '@/lib/auth'
import { useNavItems } from '@/lib/nav'
import { THEMES, useTheme } from './theme'

function initials(text: string) {
  const base = text.split('@')[0] ?? text
  const parts = base.split(/[\s._-]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

export function UserMenu() {
  const { data: me } = useMe()
  const items = useNavItems('user')
  const { theme = 'system', setTheme } = useTheme()
  const [signingOut, setSigningOut] = useState(false)
  if (!me) return null
  const name = me.display_name ?? me.email
  const ActiveIcon = THEMES.find((t) => t.value === theme)?.icon ?? THEMES[2].icon

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8 rounded-full" aria-label="Open user menu" data-testid="user-menu">
          <Avatar className="size-7">
            <AvatarFallback className="bg-brand-soft text-[11px] font-semibold text-brand ring-1 ring-brand/15">{initials(name)}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex flex-col gap-0.5 font-normal">
          <span className="truncate text-sm font-medium text-foreground">{name}</span>
          {me.display_name ? <span className="truncate text-xs text-muted-foreground">{me.email}</span> : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length ? (
          <>
            <DropdownMenuGroup>
              {items.map((item) => (
                <DropdownMenuItem key={item.id} asChild>
                  <Link to={item.to}>
                    <item.icon />
                    {item.label}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <ActiveIcon />
            Theme
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
              {THEMES.map((t) => (
                <DropdownMenuRadioItem key={t.value} value={t.value}>
                  <t.icon />
                  {t.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={signingOut}
          onSelect={(e) => {
            e.preventDefault()
            setSigningOut(true)
            void logout().finally(() => setSigningOut(false))
          }}
          data-testid="sign-out"
        >
          <LogOut />
          {signingOut ? 'Signing out…' : 'Sign out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
