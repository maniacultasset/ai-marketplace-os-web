/** Avatar menu (hi-fi top bar): 28px brand circle with the user's initial in a 36px target; account, sign out. */
import { Link } from '@tanstack/react-router'
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
import { CONCEPT_ICON } from '@/components/la/concept-icons'
import { Skeleton } from '@/components/ui/skeleton'
import { logout, useMe } from '@/lib/auth'
import { useNavItems } from '@/lib/nav'
import { cn } from '@/lib/utils'
import { NavIcon } from './nav-icon'

/** 36px hit area (40px on touch) around the 28px avatar. */
const TRIGGER_BOX = 'inline-flex size-9 shrink-0 items-center justify-center rounded-full pointer-coarse:size-10'

export function initials(text: string) {
  const base = text.split('@')[0] ?? text
  const parts = base.split(/[\s._-]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

export function UserMenu() {
  const { data: me } = useMe()
  const items = useNavItems('user')
  const [signingOut, setSigningOut] = useState(false)
  // Same 36px box as the loaded trigger, so the top bar never shifts when the user arrives.
  if (!me)
    return (
      <span className={TRIGGER_BOX} aria-hidden>
        <Skeleton className="size-7 rounded-full" />
      </span>
    )
  const name = me.display_name ?? me.email

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Open user menu" data-testid="user-menu" className={cn(TRIGGER_BOX, 'group focus-ring tactile press cursor-pointer')}>
          <span
            aria-hidden
            className="tactile inline-flex size-7 items-center justify-center rounded-full bg-brand text-caption font-bold text-white shadow-raised-brand group-active:shadow-pressed-fill"
          >
            {initials(name).slice(0, 1)}
          </span>
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
                    <NavIcon icon={item.icon} size={16} className="text-ink-3" />
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
          <NavIcon icon={CONCEPT_ICON.logOut} size={16} className="text-ink-3" />
          {signingOut ? 'Signing out…' : 'Sign out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
