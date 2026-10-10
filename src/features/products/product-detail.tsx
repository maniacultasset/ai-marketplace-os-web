import { Link } from '@tanstack/react-router'
import { Check, ChevronRight, Copy, ImageOff, ListChecks, Plus, Tags } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { isNotFound } from '@/api/errors'
import { Page, PageHeader } from '@/components/app/page-header'
import { EmptyState } from '@/components/states/empty-state'
import { ErrorState } from '@/components/states/error-state'
import { NotFound } from '@/components/states/not-found'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Can } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { useProduct, type Product, type ProductDetail as ProductData } from './api'
import { formatAttributeValue, RelativeTime, StatusBadge } from './format'

function CopyButton({ value, label, className }: { value: string; label: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      aria-label={copied ? 'Copied' : label}
      title={copied ? 'Copied' : label}
      className={cn(
        'inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
        className,
      )}
      onClick={() => {
        void navigator.clipboard
          ?.writeText(value)
          .then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          })
          .catch(() => undefined)
      }}
    >
      {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
    </button>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 border-b border-border/70 py-2 last:border-b-0">
      <dt className="shrink-0 text-[0.8125rem] text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 items-center justify-end gap-1 text-right text-sm">{children}</dd>
    </div>
  )
}

/** Card shell for the detail page: 15px title, hairline under the header. */
function Section({
  title,
  meta,
  children,
  className,
  ...props
}: {
  title: string
  meta?: ReactNode
  children: ReactNode
  className?: string
  'data-testid'?: string
}) {
  return (
    <Card className={cn('gap-0 py-0', className)} {...props}>
      <CardHeader className="flex h-12 flex-row items-center justify-between gap-3 border-b py-0 [.border-b]:pb-0">
        <CardTitle>{title}</CardTitle>
        {meta ? <span className="text-xs text-muted-foreground tabular-nums">{meta}</span> : null}
      </CardHeader>
      {children}
    </Card>
  )
}

function DetailSkeleton() {
  return (
    <Page>
      <div className="flex flex-col gap-4 pb-7" aria-busy="true" aria-label="Loading product">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-80 max-w-full" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-32 rounded-md" />
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-64 w-full rounded-xl lg:col-span-2" />
        <div className="flex flex-col gap-6">
          <Skeleton className="h-56 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
      </div>
    </Page>
  )
}

export function ProductDetail({ productId }: { productId: string }) {
  const q = useProduct(productId)

  if (q.isPending) return <DetailSkeleton />
  if (q.error) {
    // 404 (missing or another brand) and 422 (non-UUID id) both read as "not found".
    if (isNotFound(q.error) || q.error.status === 422)
      return (
        <Page>
          <NotFound
            title="Product not found"
            description="There is no product with this ID in this brand."
            backTo="/products"
            backLabel="Back to products"
          />
        </Page>
      )
    return (
      <Page>
        <PageHeader title="Product" breadcrumbs={[{ label: 'Products', to: '/products' }, { label: 'Product' }]} />
        <div className="rounded-xl border bg-card">
          <ErrorState error={q.error} title="Couldn't load this product" onRetry={() => void q.refetch()} />
        </div>
      </Page>
    )
  }

  const p = q.data
  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: 'Products', to: '/products' }, { label: p.sku }]}
        title={<span data-testid="product-title">{p.title}</span>}
        description={
          <span className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="inline-flex h-6 items-center gap-0.5 rounded-md bg-muted pr-0.5 pl-2 ring-1 ring-border ring-inset">
              <code className="font-mono text-xs text-foreground" data-testid="product-sku">
                {p.sku}
              </code>
              <CopyButton value={p.sku} label="Copy SKU" className="size-5" />
            </span>
            <StatusBadge status={p.status} />
            {q.isFetching ? <span className="text-xs">Refreshing…</span> : null}
          </span>
        }
        actions={
          <>
            <Can action="product:import">
              <Button variant="outline" asChild>
                <Link to="/products/new">
                  <Plus data-icon="inline-start" />
                  New product
                </Link>
              </Button>
            </Can>
            <Can action="listing:edit">
              <Button asChild>
                <Link to="/rules/check" search={{ product: p.id }} data-testid="check-rules">
                  <ListChecks data-icon="inline-start" />
                  Check against rules
                </Link>
              </Button>
            </Can>
          </>
        }
      />
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          <AttributesCard attributes={p.attributes} literals={p.attribute_literals} />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <Section title="Properties">
            <dl data-testid="product-overview" className="px-5">
              <Row label="Category">
                <span
                  className="inline-flex h-5 max-w-full items-center truncate rounded-md bg-muted px-1.5 text-xs text-muted-foreground"
                  data-testid="product-category"
                  title={p.category}
                >
                  {p.category}
                </span>
              </Row>
              <Row label="Product ID">
                <code className="truncate font-mono text-xs text-muted-foreground" title={p.id}>
                  {p.id}
                </code>
                <CopyButton value={p.id} label="Copy product ID" />
              </Row>
              <Row label="Created">
                <RelativeTime iso={p.created_at} />
              </Row>
              <Row label="Updated">
                <RelativeTime iso={p.updated_at} />
              </Row>
            </dl>
          </Section>
          <FamilyCard product={p} />
          <ImagesCard images={p.images ?? []} />
        </div>
      </div>
    </Page>
  )
}

function AttributesCard({
  attributes,
  literals,
}: {
  attributes: Product['attributes']
  literals: ProductData['attribute_literals']
}) {
  const entries = useMemo(
    () => Object.entries(attributes ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    [attributes],
  )
  return (
    <Section title="Attributes" meta={entries.length ? `${entries.length} ${entries.length === 1 ? 'fact' : 'facts'}` : undefined}>
      {entries.length === 0 ? (
        <EmptyState
          icon={Tags}
          title="No attributes"
          description="Facts such as color or fabric appear here once they are saved."
          compact
        />
      ) : (
        <Table aria-label="Attributes" data-testid="product-attributes">
          <TableHeader className="bg-muted/50">
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-9 w-[40%] pl-5 text-xs font-medium text-muted-foreground">Key</TableHead>
              <TableHead className="h-9 pr-5 text-xs font-medium text-muted-foreground">Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map(([k, v]) => (
              <TableRow key={k} data-attr-key={k} className="last:border-b-0">
                <TableCell className="py-2.5 pl-5 align-top font-mono text-xs text-muted-foreground">{k}</TableCell>
                <TableCell className="py-2.5 pr-5 text-sm whitespace-normal break-words">
                  {typeof v === 'string' ? (
                    v || <span className="text-muted-foreground italic">empty</span>
                  ) : (
                    <span className="tabular-nums">{formatAttributeValue(v, literals[k])}</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Section>
  )
}

function ImagesCard({ images }: { images: string[] }) {
  return (
    <Section title="Images" meta={images.length ? images.length : undefined}>
      {images.length === 0 ? (
        <div className="flex items-center gap-3 px-5 py-4 text-sm text-muted-foreground">
          <ImageOff className="size-4 shrink-0" aria-hidden />
          <span>No images. Image upload is not available yet.</span>
        </div>
      ) : (
        <ul className="divide-y divide-border/70" aria-label="Image storage keys">
          {images.map((key) => (
            <li key={key} className="truncate px-5 py-2.5 font-mono text-xs" title={key}>
              {key}
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

function FamilyLink({ product }: { product: Product }) {
  return (
    <Link
      to="/products/$productId"
      params={{ productId: product.id }}
      className="group/family flex min-w-0 items-center justify-between gap-3 px-5 py-3 text-sm transition-colors duration-150 hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
    >
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate font-medium">{product.title}</span>
        <code className="truncate font-mono text-xs text-muted-foreground">{product.sku}</code>
      </span>
      <ChevronRight
        className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-hover/family:translate-x-0.5"
        aria-hidden
      />
    </Link>
  )
}

/**
 * Parent link via `parent_product_id`. The API has no variants endpoint and
 * no parent filter, so variants are not listed: walking the whole catalog per detail view would
 * spend the brand's per-tenant rate limit.
 */
function FamilyCard({ product }: { product: Product }) {
  const parentId = product.parent_product_id
  const parent = useProduct(parentId)

  return (
    <Section title="Parent style" data-testid="product-family">
      {!parentId ? (
        <p className="px-5 py-4 text-sm text-muted-foreground" data-testid="no-parent">
          Not a variant. If this is a style, its variants are not listed here.
        </p>
      ) : parent.isPending ? (
        <div className="flex flex-col gap-1.5 px-5 py-3" aria-busy="true">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-28" />
        </div>
      ) : parent.error ? (
        isNotFound(parent.error) ? (
          <p className="px-5 py-4 text-sm text-muted-foreground">The parent product no longer exists.</p>
        ) : (
          <ErrorState error={parent.error} compact title="Couldn't load the parent" onRetry={() => void parent.refetch()} />
        )
      ) : (
        <div data-testid="parent-link">
          <FamilyLink product={parent.data} />
        </div>
      )}
    </Section>
  )
}
