import { Link, useNavigate } from '@tanstack/react-router'
import { Check, Copy, LogOut, Store, Users } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { isApiError } from '@/api/errors'
import { ErrorState } from '@/components/states/error-state'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { logout, switchTenant, tenantName, useMe } from '@/lib/auth'
import { useCan } from '@/lib/permissions'
import { toastError } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { initials, ROLE_INFO } from './roles'

function CopyValue({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <code className="truncate font-mono text-xs text-foreground/80" title={value}>
        {value}
      </code>
      <button
        type="button"
        aria-label={copied ? `Copied ${label}` : `Copy ${label}`}
        className="inline-flex size-6 transition-colors duration-150 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        onClick={() =>
          void navigator.clipboard
            ?.writeText(value)
            .then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            })
            .catch(() => undefined)
        }
      >
        {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
      </button>
    </span>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-1 border-t px-5 py-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-center sm:gap-4">
      <dt className="text-[0.8125rem] text-muted-foreground">{label}</dt>
      <dd className="flex min-h-6 min-w-0 items-center text-sm">{children}</dd>
    </div>
  )
}

function ProfileCard() {
  const { data: me } = useMe()
  const can = useCan()
  if (!me) {
    return (
      <Card className="gap-0 py-0" aria-busy>
        <div className="flex items-center gap-4 p-5">
          <Skeleton className="size-14 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-t px-5 py-3.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-56" />
          </div>
        ))}
      </Card>
    )
  }
  const role = ROLE_INFO[me.role]
  return (
    <Card className="gap-0 py-0">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar className="size-14">
            <AvatarFallback className="bg-brand-soft text-base font-semibold text-brand">
              {initials(me.display_name ?? me.email)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 space-y-0.5">
            <p className="truncate text-[1.0625rem] font-semibold tracking-[-0.01em]" data-testid="account-email">
              {me.display_name ?? me.email}
            </p>
            <p className="truncate text-sm text-muted-foreground">
              {me.display_name ? me.email : `Signed in to ${tenantName(me)}`}
            </p>
          </div>
        </div>
        {can('team:manage') ? (
          <Button variant="outline" size="sm" className="self-start sm:self-auto" asChild>
            <Link to="/team">
              <Users data-icon="inline-start" />
              Manage team
            </Link>
          </Button>
        ) : null}
      </div>
      <dl>
        <Field label="Email">
          <span className="block truncate">{me.email}</span>
        </Field>
        <Field label="Display name">
          {me.display_name ? <span className="block truncate">{me.display_name}</span> : <span className="text-muted-foreground">Not set</span>}
        </Field>
        <Field label="Role in this brand">
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <Badge variant="muted" data-testid="account-role">
              {role.label}
            </Badge>
            <span className="text-[0.8125rem] text-muted-foreground">{role.summary}</span>
          </span>
        </Field>
        <Field label="User ID">
          <CopyValue value={me.user_id} label="user ID" />
        </Field>
        <Field label="Brand ID">
          <CopyValue value={me.tenant_id} label="brand ID" />
        </Field>
      </dl>
    </Card>
  )
}

function BrandsCard() {
  const { data: me } = useMe()
  const navigate = useNavigate()
  const [switching, setSwitching] = useState<string | null>(null)
  const single = me ? me.memberships.length <= 1 : false
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="pt-5 pb-4">
        <CardTitle>Brands</CardTitle>
        <CardDescription>
          {single
            ? 'You belong to one brand. Brands you are added to later appear here.'
            : "Switching loads the selected brand's data; pages from the current brand close."}
        </CardDescription>
      </CardHeader>
      <ul aria-label="Brand memberships" aria-busy={!me || undefined}>
        {!me
          ? Array.from({ length: 2 }, (_, i) => (
              <li key={i} className="flex items-center gap-3 border-t px-5 py-3">
                <Skeleton className="size-9 rounded-lg" />
                <Skeleton className="h-4 w-40" />
              </li>
            ))
          : me.memberships.map((m) => {
              const current = m.tenant_id === me.tenant_id
              return (
                <li key={m.tenant_id} className="flex items-center gap-3 border-t px-5 py-3" data-testid="membership-row">
                  <span
                    className={cn(
                      'flex size-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset',
                      current ? 'bg-brand-soft text-brand ring-brand/15' : 'bg-muted text-muted-foreground ring-border',
                    )}
                    aria-hidden
                  >
                    <Store className="size-4" />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1">
                    <span className="truncate text-sm font-medium">{m.tenant_name}</span>
                    <Badge variant="muted">{ROLE_INFO[m.role].label}</Badge>
                  </div>
                  {current ? (
                    <Badge variant="brand">
                      <span className="size-1.5 rounded-full bg-current" aria-hidden />
                      Current
                    </Badge>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!!switching}
                      onClick={() => {
                        setSwitching(m.tenant_id)
                        switchTenant(m.tenant_id)
                          .then(() => navigate({ to: '/' }))
                          .catch((e: unknown) => {
                            // switchTenant already toasts 404; 401 goes through session handling.
                            if (isApiError(e) && (e.status === 404 || e.status === 401)) return
                            toastError(e, "Couldn't switch brand")
                          })
                          .finally(() => setSwitching(null))
                      }}
                    >
                      {switching === m.tenant_id ? <Spinner data-icon="inline-start" /> : null}
                      Switch
                    </Button>
                  )}
                </li>
              )
            })}
      </ul>
    </Card>
  )
}

function SessionCard() {
  const [signingOut, setSigningOut] = useState(false)
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
        <div className="min-w-0 space-y-1">
          <CardTitle>Session</CardTitle>
          <CardDescription className="max-w-[56ch]">
            Ends the session in this browser and its other tabs. Other devices stay signed in until their session
            expires.
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 self-start sm:self-auto"
          disabled={signingOut}
          onClick={() => {
            setSigningOut(true)
            void logout().finally(() => setSigningOut(false))
          }}
          data-testid="account-sign-out"
        >
          {signingOut ? <Spinner data-icon="inline-start" /> : <LogOut data-icon="inline-start" />}
          {signingOut ? 'Signing out…' : 'Sign out'}
        </Button>
      </CardContent>
    </Card>
  )
}

/** /account: profile from GET /auth/me, memberships with switch, and sign out. */
export function AccountView() {
  const me = useMe()
  if (me.error && !me.data) return <ErrorState error={me.error} onRetry={() => void me.refetch()} />
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <ProfileCard />
      <BrandsCard />
      <SessionCard />
    </div>
  )
}
