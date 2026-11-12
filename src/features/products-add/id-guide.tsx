/** The "Which IDs go to the marketplace" disclosure (client feedback 11 Nov, item 3); copy in ./identifiers.ts. */
import { cn } from '@/lib/utils'
import { ID_HINT, idRows, type IdRow } from './identifiers'

/** A quiet disclosure: one line per identifier, saying where it goes. */
export function IdGuide({ values, variant, className }: { values?: Partial<Record<IdRow['key'], string | null>>; variant?: boolean; className?: string }) {
  return (
    <details className={cn('group text-small', className)} data-testid="id-guide">
      <summary className="focus-ring w-fit cursor-pointer rounded-sm font-semibold text-brand marker:content-none">Which IDs go to the marketplace</summary>
      <ul className="mt-1.5 flex flex-col gap-1">
        {idRows(values, { variant }).map((r) => (
          <li key={r.key} className="text-caption text-ink-2" data-testid={`id-guide-${r.key}`}>
            <b className="text-ink">{r.name}</b>
            {r.value ? <span className="ml-1 font-mono text-ink">{r.value}</span> : null} · {ID_HINT[r.key]}
          </li>
        ))}
      </ul>
    </details>
  )
}
