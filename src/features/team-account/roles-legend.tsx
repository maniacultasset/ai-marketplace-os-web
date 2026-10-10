import { Info } from 'lucide-react'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { ROLE_INFO, ROLE_ORDER } from './roles'

/** What each role can do, plus the approvals note. */
export function RolesLegend({ className }: { className?: string }) {
  return (
    <Card role="region" aria-labelledby="roles-heading" className={cn('gap-0 py-0', className)}>
      <CardHeader className="pt-5 pb-4">
        <CardTitle id="roles-heading" role="heading" aria-level={2}>
          Roles
        </CardTitle>
        <CardDescription>What each role can do in this brand.</CardDescription>
      </CardHeader>
      <dl className="grid sm:grid-cols-2 xl:grid-cols-1">
        {ROLE_ORDER.map((r) => (
          <div
            key={r}
            className="space-y-0.5 border-t px-5 py-3.5 sm:odd:border-r xl:odd:border-r-0"
          >
            <dt className="text-sm font-medium">{ROLE_INFO[r].label}</dt>
            <dd className="text-[0.8125rem] leading-snug text-muted-foreground">{ROLE_INFO[r].summary}</dd>
          </div>
        ))}
      </dl>
      <p
        className="flex items-start gap-2 border-t bg-muted/40 px-5 py-3.5 text-xs leading-relaxed text-muted-foreground"
        data-testid="approvals-note"
      >
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Approvals need a second person: the person who generated or edited a listing cannot approve it.
      </p>
    </Card>
  )
}
