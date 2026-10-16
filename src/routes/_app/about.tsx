import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { format, formatDistanceToNow } from 'date-fns'
import { BUILT, type ProbeResult } from '@/api/capabilities'
import { probe } from '@/api/client'
import { API_BASE } from '@/api/session'
import { Page, PageHeader } from '@/components/app/page-header'
import { Icon } from '@/components/la/icons'
import { Forbidden } from '@/components/states/forbidden'
import { ErrorState } from '@/components/states/error-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useCapabilityProbe } from '@/hooks/use-capabilities'
import { useCan } from '@/lib/permissions'
import { useKeys } from '@/lib/query-keys'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/_app/about')({
  staticData: { title: 'Diagnostics' },
  component: AboutPage,
})

function Dot() {
  return <span className="size-1.5 rounded-full bg-current" aria-hidden />
}

function HealthRow({ path }: { path: '/healthz' | '/readyz' }) {
  const q = useQuery({
    queryKey: ['health', path],
    queryFn: async () => ({ ...(await probe(path)), at: Date.now() }),
    refetchInterval: 15_000,
    staleTime: 0,
  })
  const checks =
    q.data?.body && typeof q.data.body === 'object' && 'checks' in q.data.body
      ? Object.entries((q.data.body as { checks: Record<string, string> }).checks)
      : []
  return (
    <li className="flex items-center gap-4 border-t px-5 py-3.5">
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="truncate font-mono text-xs">GET {path}</p>
        <p className="truncate text-xs text-muted-foreground">
          {checks.length ? checks.map(([k, v]) => `${k}: ${v}`).join(', ') : 'No dependency checks'}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {q.isPending ? (
          <Skeleton className="h-5 w-16 rounded-full" />
        ) : q.data?.ok ? (
          <Badge variant="success">
            <Dot />
            OK · {q.data.status}
          </Badge>
        ) : (
          <Badge variant="danger">
            <Dot />
            {q.data?.status ? `Unavailable · ${q.data.status}` : 'Unreachable'}
          </Badge>
        )}
        {q.data ? (
          <time
            dateTime={new Date(q.data.at).toISOString()}
            title={format(q.data.at, 'PPpp')}
            className="text-[0.6875rem] text-muted-foreground"
          >
            {formatDistanceToNow(q.data.at, { addSuffix: true })}
          </time>
        ) : null}
      </div>
    </li>
  )
}

const RESULT: Record<ProbeResult, { label: string; variant: 'success' | 'muted' | 'warning' | 'danger' }> = {
  live: { label: 'Live', variant: 'success' },
  stub: { label: 'Stub · 501', variant: 'muted' },
  unknown: { label: 'Unknown', variant: 'warning' },
  error: { label: 'Unexpected', variant: 'danger' },
}

function CapabilityProbe() {
  const keys = useKeys()
  const qc = useQueryClient()
  const probeQ = useCapabilityProbe()
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="pt-5 pb-4">
        <CardTitle>Capability probe</CardTitle>
        <CardDescription>
          Safe GETs against pending endpoints. A stub answers exactly 501; screens appear only when built and live.
        </CardDescription>
        <CardAction>
          <Button
            variant="outline"
            size="sm"
            disabled={probeQ.isFetching}
            onClick={() => void qc.invalidateQueries({ queryKey: keys.capabilities() })}
          >
            <Icon name="refresh" size={16} data-icon="inline-start" className={probeQ.isFetching ? 'motion-safe:animate-spin' : undefined} />
            Re-run
          </Button>
        </CardAction>
      </CardHeader>
      <div className="border-t">
        {probeQ.error ? (
          <ErrorState error={probeQ.error} onRetry={() => void probeQ.refetch()} compact />
        ) : (
          <Table aria-label="Capability probe results" aria-busy={probeQ.isPending || undefined}>
            <TableHeader className="bg-muted/50">
              <TableRow className="hover:bg-transparent">
                <TableHead className={cn(HEAD, 'pl-5')}>Capability</TableHead>
                <TableHead className={HEAD}>Probe</TableHead>
                <TableHead className={HEAD}>Backend</TableHead>
                <TableHead className={HEAD}>Screen</TableHead>
                <TableHead className={cn(HEAD, 'pr-5 text-right')}>Request ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {probeQ.isPending
                ? Array.from({ length: 6 }, (_, i) => (
                    <TableRow key={i} className="hover:bg-transparent">
                      <TableCell colSpan={5} className="px-5">
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                : probeQ.data.map((p) => (
                    <TableRow key={p.capability} data-testid={`probe-${p.capability}`}>
                      <TableCell className="pl-5 font-medium">{p.capability}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{p.request}</TableCell>
                      <TableCell>
                        <Badge variant={RESULT[p.result].variant} data-result={p.result}>
                          <Dot />
                          {RESULT[p.result].label}
                          {p.result === 'error' && p.status !== null ? ` · ${p.status}` : ''}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{BUILT[p.capability] ? 'Built' : 'Not built'}</TableCell>
                      <TableCell className="pr-5 text-right font-mono text-[0.6875rem] text-muted-foreground">
                        {p.requestId ?? '—'}
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        )}
      </div>
    </Card>
  )
}

const HEAD = 'h-9 text-xs font-medium text-muted-foreground'

function BuildRow({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid min-w-0 gap-1 border-t px-5 py-3 sm:grid-cols-[7rem_minmax(0,1fr)] sm:items-center sm:gap-4">
      <dt className="text-[0.8125rem] text-muted-foreground">{label}</dt>
      <dd className={cn('truncate', mono ? 'font-mono text-xs' : 'text-sm capitalize')} title={value}>
        {value}
      </dd>
    </div>
  )
}

function AboutPage() {
  const can = useCan()
  if (!can('settings:manage')) return <Page><Forbidden /></Page>
  return (
    <Page>
      <PageHeader title="Diagnostics" description="API health and which pending endpoints the backend serves." />
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
          <Card className="gap-0 py-0">
            <CardHeader className="pt-5 pb-4">
              <CardTitle>Build</CardTitle>
              <CardDescription>Where this app is running and which API it calls.</CardDescription>
            </CardHeader>
            <dl>
              <BuildRow label="Mode" value={import.meta.env.MODE} mono={false} />
              <BuildRow label="API base" value={API_BASE} />
              <BuildRow label="Origin" value={window.location.origin} />
            </dl>
          </Card>
          <Card className="gap-0 py-0">
            <CardHeader className="pt-5 pb-4">
              <CardTitle>API health</CardTitle>
              <CardDescription>Unprefixed probes, refreshed every 15 seconds.</CardDescription>
            </CardHeader>
            <ul aria-label="API health">
              <HealthRow path="/readyz" />
            </ul>
          </Card>
        </div>
        {import.meta.env.DEV ? <CapabilityProbe /> : null}
      </div>
    </Page>
  )
}
