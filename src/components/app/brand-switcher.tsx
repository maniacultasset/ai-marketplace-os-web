/**
 * Brand switcher (hi-fi sidebar "bs"): square brand initial, brand name, chevron. Memberships come
 * from GET /auth/me; switching calls POST /auth/switch-tenant (lib/auth `switchTenant`). With a
 * single membership it is a static box (nothing to switch to, so no chevron). Collapsed: the
 * initial only, the name in a tooltip.
 */
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Icon } from '@/components/la/icons'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Spinner } from '@/components/ui/spinner'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useBrandName } from '@/features/brand/api'
import { switchTenant, useMe } from '@/lib/auth'
import { cn } from '@/lib/utils'

export function initialOf(text: string) {
  return (text.trim()[0] ?? '?').toUpperCase()
}

function BrandInitial({ name }: { name: string }) {
  return (
    <span aria-hidden className="inline-flex size-6 shrink-0 items-center justify-center rounded-[7px] bg-brand font-display text-[11px] font-bold text-white shadow-raised-brand">
      {initialOf(name)}
    </span>
  )
}

export function BrandSwitcher({ collapsed }: { collapsed?: boolean }) {
  const { data: me } = useMe()
  const navigate = useNavigate()
  const [pending, setPending] = useState<string | null>(null)
  const name = useBrandName(me)
  if (!me) return <div className="mb-3.5 h-[46px] rounded-[12px] border border-line shadow-inset-sm" aria-hidden />

  const body = (
    <>
      <BrandInitial name={name} />
      <span className={cn('min-w-0 flex-1 text-left', collapsed && 'sr-only')}>
        <span className="block truncate text-small font-semibold text-ink" data-testid="tenant-name">
          {name}
        </span>
        <span className="block truncate text-[11px] leading-[14px] text-ink-3 capitalize" data-testid="role-badge">
          {me.role}
        </span>
      </span>
    </>
  )
  const box = cn(
    'mb-3.5 flex w-full items-center gap-2 rounded-[12px] border border-line bg-surface px-2.5 py-2 shadow-raised-sm [--focus-rest:var(--shadow-raised-sm)]',
    collapsed && 'justify-center px-0',
  )

  if (me.memberships.length <= 1) {
    return collapsed ? (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={box} tabIndex={0}>
            {body}
          </div>
        </TooltipTrigger>
        <TooltipContent side="right">{name}</TooltipContent>
      </Tooltip>
    ) : (
      <div className={box}>{body}</div>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={cn(box, 'focus-ring tactile cursor-pointer hover:bg-white active:shadow-pressed aria-expanded:shadow-pressed')} aria-label="Switch brand">
          {body}
          {pending ? <Spinner className="size-4" /> : <Icon name="chev" size={16} className={cn('text-ink-2', collapsed && 'hidden')} />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side={collapsed ? 'right' : 'bottom'} className="w-64">
        <DropdownMenuLabel className="text-caption text-ink-3">Brands</DropdownMenuLabel>
        {me.memberships.map((m) => {
          const current = m.tenant_id === me.tenant_id
          return (
            <DropdownMenuItem
              key={m.tenant_id}
              disabled={current || !!pending}
              onSelect={() => {
                setPending(m.tenant_id)
                switchTenant(m.tenant_id)
                  .then(() => navigate({ to: '/home' }))
                  .catch(() => undefined)
                  .finally(() => setPending(null))
              }}
            >
              <BrandInitial name={m.tenant_name} />
              <span className="flex-1 truncate">{m.tenant_name}</span>
              <span className="text-caption text-ink-3 capitalize">{m.role}</span>
              {current ? <Icon name="check" size={14} className="text-brand" /> : null}
            </DropdownMenuItem>
          )
        })}
        <DropdownMenuSeparator />
        <p className="px-2 py-1.5 text-caption text-ink-3">Each brand keeps its own profile and marketplace accounts.</p>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
