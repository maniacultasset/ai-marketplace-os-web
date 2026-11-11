/**
 * "What the checks found" on Review, in three groups (client feedback item 10): what must be
 * fixed before approval, the recommended attributes to add, and the other warnings. Each group
 * shows a few rows and opens the rest on request.
 */
import { Link } from '@tanstack/react-router'
import { useState, type ReactNode } from 'react'
import { CardHead, LaCard, StatusChip } from '@/components/la'
import { Button } from '@/components/ui/button'
import { fieldLabel, findingText, sellerFinding } from './format'
import { plural, type ErrorItem } from './gates'
import { addOnProductLink, groupFindings, recommendedHelp, recommendedKey } from './recommended'

/** Rows each group shows before "Show N more". */
export const GROUP_SHOWN = 3

/** One finding in seller words: plain message, the field, the value, a suggestion meant for them. */
export function FindingBody({ f }: { f: ErrorItem }) {
  // Seller words (labels, no agent guidance) with the value line that says "sent" only for a
  // marketplace's answer.
  const s = sellerFinding(f)
  const t = findingText(f)
  return (
    <div className="min-w-0 flex-1">
      <p className="text-body text-ink">{s.message}</p>
      <p className="text-caption text-ink-3">
        <span title={f.field}>{fieldLabel(f.field)}</span>
        {t.value ? ` · ${t.value}` : ''}
      </p>
      {s.action ? <p className="mt-0.5 text-small text-ink-2">{s.action}</p> : null}
    </div>
  )
}

function Group<F>({
  title,
  sub,
  items,
  more,
  testId,
  children,
}: {
  title: string
  sub?: string
  items: readonly F[]
  more: string
  testId: string
  children: (f: F) => ReactNode
}) {
  const [all, setAll] = useState(false)
  const hidden = Math.max(0, items.length - GROUP_SHOWN)
  const shown = all ? items : items.slice(0, GROUP_SHOWN)
  return (
    <section className="mt-4 first:mt-3" data-testid={testId} aria-label={title}>
      <h4 className="text-small font-semibold text-ink">
        {title} <span className="font-normal text-ink-3 tabular-nums">· {items.length}</span>
      </h4>
      {sub ? <p className="text-caption text-ink-3">{sub}</p> : null}
      <ul className="m-0 mt-1 flex list-none flex-col p-0">
        {shown.map((f, i) => (
          <li key={i} className="flex items-start gap-3 border-b border-line py-3 last:border-b-0 last:pb-0">
            {children(f)}
          </li>
        ))}
      </ul>
      {hidden ? (
        <Button variant="ghost" size="sm" className="mt-1 -ml-2" aria-expanded={all} onClick={() => setAll((o) => !o)}>
          {all ? 'Show fewer' : `Show ${plural(hidden, more)}`}
        </Button>
      ) : null}
    </section>
  )
}

export function FindingsCard({ findings, productId }: { findings: readonly ErrorItem[]; productId: string | null | undefined }) {
  const { blocking, recommended, warnings } = groupFindings(findings)
  return (
    <LaCard data-testid="findings" id="findings" className="scroll-mt-20 md:scroll-mt-4">
      <CardHead title="What the checks found" />
      {blocking.length ? (
        <Group title="Must fix before approval" items={blocking} more="more to fix" testId="findings-blocking">
          {(f) => (
            <>
              <StatusChip status="blocked" iconOnly label="Blocking" />
              <FindingBody f={f} />
            </>
          )}
        </Group>
      ) : null}
      {recommended.length ? (
        <Group
          title="Recommended to add"
          sub="Not needed for approval. Add one only if you know it; Kuinn never guesses. Generate again to use it."
          items={recommended}
          more="more recommendation"
          testId="findings-recommended"
        >
          {(f) => {
            const key = recommendedKey(f)
            return (
              <>
                <StatusChip status="draft" iconOnly label="Recommended" />
                <div className="min-w-0 flex-1">
                  <p className="text-body text-ink">{fieldLabel(f.field)}</p>
                  <p className="text-small text-ink-2">{recommendedHelp(key)}</p>
                  {productId ? (
                    <Link
                      {...addOnProductLink(productId, key)}
                      className="focus-ring mt-0.5 inline-block rounded-sm text-small font-semibold text-brand hover:underline"
                      data-testid={`recommended-add-${key}`}
                    >
                      Add on the product
                    </Link>
                  ) : null}
                </div>
              </>
            )
          }}
        </Group>
      ) : null}
      {warnings.length ? (
        <Group title={blocking.length || recommended.length ? 'Other warnings' : 'Warnings'} items={warnings} more="more warning" testId="findings-warnings">
          {(f) => (
            <>
              <StatusChip status="needs-you" iconOnly label="Warning" />
              <FindingBody f={f} />
            </>
          )}
        </Group>
      ) : null}
    </LaCard>
  )
}
