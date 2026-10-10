import { useNavigate } from '@tanstack/react-router'
import { Check, ChevronsUpDown } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Spinner } from '@/components/ui/spinner'
import { switchTenant, tenantName, useMe } from '@/lib/auth'

/** Brand name + role. A dropdown switcher only when the user has more than one membership. */
export function TenantSwitcher() {
  const { data: me } = useMe()
  const navigate = useNavigate()
  const [pending, setPending] = useState<string | null>(null)
  if (!me) return null
  const name = tenantName(me)
  const role = (
    <Badge variant="muted" className="capitalize" data-testid="role-badge">
      {me.role}
    </Badge>
  )

  if (me.memberships.length <= 1) {
    return (
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm font-medium" data-testid="tenant-name">
          {name}
        </span>
        {role}
      </div>
    )
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="min-w-0 gap-1.5 px-2 font-medium" aria-label="Switch brand">
            <span className="truncate" data-testid="tenant-name">
              {name}
            </span>
            {pending ? <Spinner className="size-3.5" /> : <ChevronsUpDown className="size-3.5 opacity-60" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Brands</DropdownMenuLabel>
          {me.memberships.map((m) => {
            const current = m.tenant_id === me.tenant_id
            return (
              <DropdownMenuItem
                key={m.tenant_id}
                disabled={current || !!pending}
                onSelect={() => {
                  setPending(m.tenant_id)
                  switchTenant(m.tenant_id)
                    .then(() => navigate({ to: '/' }))
                    .catch(() => undefined)
                    .finally(() => setPending(null))
                }}
              >
                <span className="flex-1 truncate">{m.tenant_name}</span>
                <span className="text-xs text-muted-foreground capitalize">{m.role}</span>
                {current ? <Check className="size-3.5" /> : null}
              </DropdownMenuItem>
            )
          })}
          <DropdownMenuSeparator />
          <p className="px-2 py-1.5 text-xs text-muted-foreground">Switching reloads data for the selected brand.</p>
        </DropdownMenuContent>
      </DropdownMenu>
      {role}
    </div>
  )
}
