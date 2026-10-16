/**
 * 18 Mapping and validation (/listings/$listingId/mapping), drawn on the listing's real
 * marketplace (Amazon or Flipkart; Myntra is not in the API, C-5). Reads (use-listing-checks.ts):
 * the listing, its latest validation, the adapter preview and the rules. The mapping table is
 * mapping.ts; the gates are gates.ts. "Needs human input" opens the Inbox
 * (issues view), where its open issues are; answering there is not in the API yet.
 */
import { Link } from '@tanstack/react-router'
import { isApiError, isNotFound } from '@/api/errors'
import { Page } from '@/components/app/page-header'
import { Banner, CardHead, LaCard, StatusChip, TagChip } from '@/components/la'
import { ErrorState } from '@/components/states/error-state'
import { NotFound } from '@/components/states/not-found'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { ListingDetail } from '@/features/listings/model'
import { listingChip } from '@/lib/listing-chip'
import { cn } from '@/lib/utils'
import { categoryLabel, clock, mpName } from './format'
import { plural, type ErrorItem } from './gates'
import { attrLabel, mappingRows, otherFindings, type MappingRow, type RowState } from './mapping'
import { CardSkeleton, GATE_CHIP, GateLegend, GateList, HeadSkeleton, ScreenHead } from './ui'
import { useListingChecks } from './use-listing-checks'

export function MappingScreen({ listingId }: { listingId: string }) {
  const c = useListingChecks(listingId)
  if (c.listingQ.isPending)
    return (
      <Page>
        <div aria-busy="true" aria-label="Loading the mapping">
          <HeadSkeleton />
          <Skeleton className="h-12 w-full rounded-[10px]" />
          <div className="mt-4 grid gap-4 lg:grid-cols-[1.7fr_1fr]">
            <CardSkeleton lines={7} />
            <CardSkeleton lines={9} />
          </div>
        </div>
      </Page>
    )
  if (c.listingQ.error || !c.listing) {
    if (isNotFound(c.listingQ.error) || (isApiError(c.listingQ.error) && c.listingQ.error.status === 422))
      return (
        <Page>
          <NotFound title="Listing not found" description="There is no listing with this ID in this brand." backTo="/products" backLabel="Back to products" />
        </Page>
      )
    return (
      <Page>
        <LaCard>
          <ErrorState error={c.listingQ.error} title="Couldn’t load this listing" onRetry={() => void c.listingQ.refetch()} />
        </LaCard>
      </Page>
    )
  }
  return <MappingBody checks={c} listing={c.listing} />
}

const STATE_WORD: Record<RowState, string> = { passed: 'Passed', warning: 'Warning', blocked: 'Blocked', unchecked: 'Not checked yet' }

function MappingBody({ checks, listing }: { checks: ReturnType<typeof useListingChecks>; listing: ListingDetail }) {
  const mp = mpName(listing.marketplace)
  const category = listing.category ?? listing.content?.category ?? null
  const { findings, checked, stage } = checks.current
  const previewErrors = checks.preview.data?.report.errors ?? []
  const all = [...findings, ...previewErrors]
  const payload = checks.preview.data?.items?.find((i) => i.item_role !== 'parent')?.payload ?? checks.preview.data?.items?.[0]?.payload
  const rows = mappingRows({ attributes: listing.content?.attributes, payload, rules: checks.rules ?? [], findings: all, checked })
  const others = otherFindings(all)
  const needsYou = (f: (typeof all)[number]) => f.severity === 'error' && (f.retry_class === 'user_action' || !f.auto_fixable)
  // Only validation findings become Inbox issues (services/issues.py: version validation runs and
  // publish results). The preview writes nothing, so its errors are listed apart and not counted.
  const needs = findings.filter(needsYou)
  const previewNeeds = previewErrors.filter(needsYou)
  const fieldName = (f: (typeof all)[number]) => (f.field.startsWith('attributes.') ? attrLabel(f.field.slice('attributes.'.length)) : f.field)
  const chip = listingChip(listing)

  return (
    <Page>
      <ScreenHead
        title={checks.product.data ? `${checks.product.data.title} on ${mp}` : <Skeleton className="h-7 w-72" />}
        sub={`Category: ${categoryLabel(category)}`}
        right={
          needs.length ? (
            <StatusChip status="blocked">Blocked · {needs.length} needs you</StatusChip>
          ) : (
            <StatusChip status={chip.status}>{chip.label}</StatusChip>
          )
        }
      />

      <Banner
        tone="info"
        icon="file"
        className="mb-4"
        action={
          <Button size="sm" variant="secondary" asChild>
            <Link to="/rules" search={{ marketplace: listing.marketplace, category: category ?? undefined }}>
              View rules
            </Link>
          </Button>
        }
      >
        Rules used:{' '}
        <b>
          {mp} · {categoryLabel(category)}
          {stage?.rules_version != null ? ` · rules v${stage.rules_version}` : ''}
        </b>
        {stage ? ` · checked ${clock(stage.created_at)}` : ' · this version has not been checked yet'}
        {checks.rules ? ` · ${plural(checks.rules.length, 'rule')} apply` : ''}
      </Banner>

      <div className="grid items-start gap-4 lg:grid-cols-[1.7fr_1fr]">
        <div className="flex min-w-0 flex-col gap-4">
          <MappingTable rows={rows} mp={mp} loading={!checks.rules && checks.rulesQ.isPending} />
          {others.length ? <OtherFindings items={others} /> : null}
          <p className="text-caption text-ink-3">
            {mp} field names come from the preview of what would be sent. A field the preview does not name the same way shows as not matched; nothing is guessed.
          </p>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <LaCard data-testid="gates-card">
            <h3 className="text-h3 text-ink">Quality gates</h3>
            <GateList gates={checks.gates} layout="list" />
            <GateLegend className="mt-3" />
          </LaCard>
          {needs.length || previewNeeds.length ? (
            <LaCard emphasis="attention" data-testid="needs-input">
              <b className="text-ink">Needs human input</b>
              {needs.length ? (
                <>
                  <p className="mt-1 text-small text-attention-ink">
                    {needs.slice(0, 3).map(fieldName).join(', ')}
                    {needs.length > 3 ? ` and ${needs.length - 3} more` : ''}. The open items are in your Inbox.
                  </p>
                  <Button size="sm" variant="warn" className="mt-3" asChild>
                    <Link to="/inbox" search={{ view: 'issues' }}>
                      Open Inbox
                    </Link>
                  </Button>
                </>
              ) : null}
              {previewNeeds.length ? (
                <p className="mt-2 text-small text-attention-ink" data-testid="preview-needs">
                  The preview of what would be sent also flags {previewNeeds.slice(0, 3).map(fieldName).join(', ')}
                  {previewNeeds.length > 3 ? ` and ${previewNeeds.length - 3} more` : ''}. These are not in the Inbox: fix them in the product or the listing.
                </p>
              ) : null}
            </LaCard>
          ) : null}
        </div>
      </div>
    </Page>
  )
}

function RuleTag({ row }: { row: MappingRow }) {
  return (
    <TagChip tone="tag" className={cn('self-start', row.rule === 'No rule' && 'border-dashed text-ink-3')}>
      {row.rule}
    </TagChip>
  )
}

function StateCell({ row }: { row: MappingRow }) {
  return <StatusChip status={GATE_CHIP[row.state]} iconOnly label={`${attrLabel(row.key)}: ${STATE_WORD[row.state]}`} />
}

function FieldCell({ row }: { row: MappingRow }) {
  const f = row.findings[0]
  return (
    <span className="min-w-0">
      {row.marketplaceField ? (
        <span className="break-words text-ink">
          {row.marketplaceField.name}: {row.marketplaceField.value || <span className="text-ink-3">empty</span>}
        </span>
      ) : (
        <span className="text-ink-3">Not matched in the preview</span>
      )}
      {f ? <small className="block text-caption text-ink-3">{f.suggestion ?? f.message}</small> : null}
    </span>
  )
}

function MappingTable({ rows, mp, loading }: { rows: readonly MappingRow[]; mp: string; loading: boolean }) {
  if (loading)
    return (
      <LaCard pad="none" className="p-4" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="my-3 h-6" />
        ))}
      </LaCard>
    )
  if (!rows.length)
    return (
      <LaCard data-testid="mapping-empty">
        <CardHead title="No attributes to map" sub="This listing has no attributes, and no rule for this category asks for one." />
      </LaCard>
    )
  // Tables become cards below 1024px (build notes).
  return (
    <LaCard pad="none" className="overflow-hidden" data-testid="mapping-table">
      <div className="hidden lg:block" role="table" aria-label={`Your product mapped to ${mp}`}>
        <div role="row" className="grid grid-cols-[1.1fr_1.2fr_120px_56px] items-center gap-3 border-b border-line bg-canvas px-4 py-2.5 text-caption font-bold text-ink-2">
          <span role="columnheader">Your product</span>
          <span role="columnheader">{mp} field</span>
          <span role="columnheader">Rule</span>
          <span role="columnheader">State</span>
        </div>
        {rows.map((r) => (
          <div
            role="row"
            key={r.path}
            data-row={r.key}
            data-state={r.state}
            className={cn(
              'grid min-h-12 grid-cols-[1.1fr_1.2fr_120px_56px] items-center gap-3 border-b border-line px-4 py-3 text-body last:border-b-0',
              (r.state === 'blocked' || r.state === 'warning') && 'bg-attention-tint',
            )}
          >
            <span role="cell" className="min-w-0 break-words text-ink">
              {attrLabel(r.key)}: {r.yourValue ?? <span className="text-ink-3">not provided</span>}
            </span>
            <span role="cell" className="min-w-0">
              <FieldCell row={r} />
            </span>
            <span role="cell">
              <RuleTag row={r} />
            </span>
            <span role="cell">
              <StateCell row={r} />
            </span>
          </div>
        ))}
      </div>
      <ul className="m-0 list-none p-0 lg:hidden" aria-label={`Your product mapped to ${mp}`}>
        {rows.map((r) => (
          <li key={r.path} className={cn('flex flex-col gap-2 border-b border-line p-4 last:border-b-0', (r.state === 'blocked' || r.state === 'warning') && 'bg-attention-tint')}>
            <div className="flex items-center justify-between gap-3">
              <b className="text-ink">{attrLabel(r.key)}</b>
              <StateCell row={r} />
            </div>
            <p className="text-small text-ink">Yours: {r.yourValue ?? <span className="text-ink-3">not provided</span>}</p>
            <div className="text-small">
              <FieldCell row={r} />
            </div>
            <RuleTag row={r} />
          </li>
        ))}
      </ul>
    </LaCard>
  )
}

function OtherFindings({ items }: { items: readonly ErrorItem[] }) {
  return (
    <LaCard data-testid="other-findings">
      <CardHead title="Other findings" sub="Not about one attribute: text, images or the listing as a whole." />
      <ul className="m-0 mt-3 flex list-none flex-col p-0">
        {items.map((f, i) => (
          <li key={i} className="flex items-start gap-3 border-b border-line py-3 last:border-b-0 last:pb-0">
            <StatusChip status={f.severity === 'error' ? 'blocked' : 'needs-you'} iconOnly label={f.severity === 'error' ? 'Blocking' : 'Warning'} />
            <div className="min-w-0">
              <p className="text-body text-ink">{f.message}</p>
              <p className="text-caption text-ink-3">
                <code className="font-mono">{f.field}</code>
              </p>
            </div>
          </li>
        ))}
      </ul>
    </LaCard>
  )
}
