/**
 * Brand switcher (hi-fi sidebar "bs"): square brand initial, brand name, chevron. Memberships come
 * from GET /auth/me; switching calls POST /auth/switch-tenant (lib/auth `switchTenant`). It is the
 * brand filter for an agency: each brand's data stays in that brand. An owner of the current brand
 * can "Add another brand" here while the deployment has it on (ADR-0032). With one membership and
 * nothing to add it is a static box (no chevron). Collapsed: the initial only, the name in a
 * tooltip.
 */
import { useNavigate } from '@tanstack/react-router'
import { useRef, useState } from 'react'
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
import { AddBrandDialog } from '@/features/brand/add-brand-dialog'
import { canAddBrand, ownsAnotherBrand } from '@/features/brand/add-brand'
import { useBrandName, useBrandProfile } from '@/features/brand/api'
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
  const [adding, setAdding] = useState(false)
  // Set when "Add another brand" closes the menu: the menu then leaves focus where the dialog put
  // it (its name field). Giving it back to the trigger blurred the empty field, which showed
  // "Enter the brand name." before any typing (prod Chrome pass 12 Nov, B9).
  const toDialog = useRef(false)
  const name = useBrandName(me)
  const profile = useBrandProfile()
  const canAdd = canAddBrand(me, profile.data?.data)
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

  if (me.memberships.length <= 1 && !canAdd) {
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

  const brandCount = me.memberships.length
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={cn(box, 'focus-ring tactile cursor-pointer hover:bg-white active:shadow-pressed aria-expanded:shadow-pressed')} aria-label="Switch brand">
            {body}
            {pending ? <Spinner className="size-4" /> : <Icon name="chev" size={16} className={cn('text-ink-2', collapsed && 'hidden')} />}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          side={collapsed ? 'right' : 'bottom'}
          className="w-64"
          onCloseAutoFocus={(e) => {
            if (!toDialog.current) return
            toDialog.current = false
            e.preventDefault()
          }}
        >
          <DropdownMenuLabel className="flex items-center justify-between text-caption text-ink-3">
            <span>Brands</span>
            {brandCount > 1 ? <span className="tabular-nums" data-testid="brand-count">{brandCount}</span> : null}
          </DropdownMenuLabel>
          <div className="max-h-72 overflow-y-auto">
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
          </div>
          <DropdownMenuSeparator />
          {canAdd ? (
            <DropdownMenuItem
              disabled={!!pending}
              onSelect={() => {
                toDialog.current = true
                setAdding(true)
              }}
              data-testid="add-brand"
            >
              <span aria-hidden className="inline-flex size-6 shrink-0 items-center justify-center rounded-[7px] border border-dashed border-line text-ink-2">
                <Icon name="plus" size={14} />
              </span>
              <span className="flex-1">Add another brand</span>
            </DropdownMenuItem>
          ) : ownsAnotherBrand(me) && profile.data?.data.capabilities?.tenant_create_enabled ? (
            <p className="px-2 py-1.5 text-caption text-ink-3" data-testid="add-brand-hint">
              To add a brand, switch to one you own.
            </p>
          ) : null}
          <p className="px-2 py-1.5 text-caption text-ink-3">Each brand keeps its own products, team and marketplace accounts.</p>
        </DropdownMenuContent>
      </DropdownMenu>
      {canAdd ? <AddBrandDialog open={adding} onClose={() => setAdding(false)} /> : null}
    </>
  )
}
