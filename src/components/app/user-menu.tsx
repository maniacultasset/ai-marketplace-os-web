/** Avatar menu (hi-fi top bar): 28px brand circle with the user's initial; account, sign out. */
import { Link } from '@tanstack/react-router'
import { LogOut } from 'lucide-react'
import { useState } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { logout, useMe } from '@/lib/auth'
import { useNavItems } from '@/lib/nav'
import { NavIcon } from './nav-icon'

export function initials(text: string) {
  const base = text.split('@')[0] ?? text
  const parts = base.split(/[\s._-]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

export function UserMenu() {
  const { data: me } = useMe()
  const items = useNavItems('user')
  const [signingOut, setSigningOut] = useState(false)
  if (!me) return <span className="size-7 rounded-full bg-subtle shadow-inset-sm" aria-hidden />
  const name = me.display_name ?? me.email

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Open user menu"
          data-testid="user-menu"
          className="focus-ring tactile lift inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full bg-brand text-caption font-bold text-white shadow-raised-brand [--focus-rest:var(--shadow-raised-brand)] active:shadow-pressed-fill"
        >
          {initials(name).slice(0, 1)}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex flex-col gap-0.5 font-normal">
          <span className="truncate text-body font-semibold text-ink">{name}</span>
          {me.display_name ? <span className="truncate text-caption font-normal text-ink-2">{me.email}</span> : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length ? (
          <>
            <DropdownMenuGroup>
              {items.map((item) => (
                <DropdownMenuItem key={item.id} asChild>
                  <Link to={item.to}>
                    <NavIcon icon={item.icon} size={16} />
                    {item.label}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        ) : null}
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
