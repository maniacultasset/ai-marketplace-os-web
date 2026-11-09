/**
 * Bulk upload (hi-fi p11) in three steps: Template → Upload → Check and send.
 *
 * Real calls:
 *   POST /products/bulk (multipart `file`, Idempotency-Key per chosen file)  → import + job
 *   GET  /jobs/{job_id} (polling), GET /imports/{id}, GET /imports/{id}/rows   → the check step
 *   POST /listings/generate per imported style/standalone x marketplace        → "Send N to the agent"
 * The import itself never starts generation (backend: T67), so sending is a separate, explicit step.
 *
 * Column matching: the API matches by header name only (no mapping endpoint), so the detected
 * columns are shown read-only with what the server will do with each (./csv-header.ts).
 * XLSX is not accepted by the API: the dropzone takes .csv only.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useMemo, useState, type ReactNode } from 'react'
import { useDropzone, type FileRejection } from 'react-dropzone'
import { api, unwrap } from '@/api/client'
import { describeError, isApiError, isNotFound } from '@/api/errors'
import { idempotencyHeader, useIntentKey } from '@/api/idempotency'
import type { Schema } from '@/api/types'
import { Page, PageHeader } from '@/components/app/page-header'
import { Banner, CardHead, CONCEPT_ICON, FooterBar, Icon, IconTile, LaCard, ProgressBar, StatusChip, Stepper, UnavailableButton } from '@/components/la'
import { ErrorState } from '@/components/states/error-state'
import { ReferenceId } from '@/components/states/reference-id'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { invalidateListingWork } from '@/features/listings/api'
import { downloadTemplate, formatBytes, MAX_FILE_BYTES, MAX_IMPORT_ROWS, REQUIRED_COLUMNS } from '@/features/imports/csv-template'
import { plainRowError, rowProblems } from '@/features/imports/row-errors'
import { sentenceCase } from '@/features/listing-flow/format'
import { useImportHistory } from '@/features/imports/history'
import { useImportReport } from '@/features/imports/import-report'
import { markJobLive, useImportJob } from '@/features/imports/use-import-job'
import { CategoryCodes } from '@/features/products/category-select'
import { useCan } from '@/lib/permissions'
import { AI_PAUSED_REASON } from '@/features/ai-credit/model'
import { useAiPaused } from '@/features/ai-credit/use-ai-paused'
import { useKeys } from '@/lib/query-keys'
import { cn } from '@/lib/utils'
import { useAllListings, useAllProducts, walkPages } from './catalog'
import type { Marketplace } from './catalog-model'
import { analyzeCsv, MATCH_COPY, type ColumnMatch, type HeaderAnalysis } from './csv-header'
import { generateMany, planGenerate, type ItemOutcome } from './generate'
import { ListOnPicker, serializeListOn, useConnectedMarketplaces } from './list-on'
import { NeedsPhotosCard } from './needs-photos-card'

type ImportRow = Schema<'ImportRowResult'>

const rowsLabel = (n: number) => `${n.toLocaleString('en-IN')} ${n === 1 ? 'row' : 'rows'}`

const STEPS = [{ label: 'Template' }, { label: 'Upload' }, { label: 'Check and send' }] as const

/** Header analysis of the file uploaded from this tab, kept for its check step. */
const analyses = new Map<string, { name: string; analysis: HeaderAnalysis }>()

const MATCH_CHIP: Record<ColumnMatch, Parameters<typeof StatusChip>[0]['status']> = {
  ok: 'live',
  alias: 'live',
  'not-stored': 'not-listed',
  'photo-link': 'not-listed',
  unknown: 'error',
  duplicate: 'error',
}

function ColumnTable({ analysis }: { analysis: HeaderAnalysis }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-small" aria-label="Column matching">
        <thead>
          <tr className="h-[38px] bg-sunken text-left text-caption font-bold text-ink-2">
            <th className="px-4">Your column</th>
            <th className="w-5" aria-hidden />
            <th className="px-2">Our field</th>
            <th className="w-[110px] px-4">Match</th>
          </tr>
        </thead>
        <tbody>
          {analysis.columns.map((c) => (
            <tr key={c.position} className="h-[46px] border-t border-line">
              <td className="max-w-48 truncate px-4 text-ink" title={c.raw}>
                {c.raw || <span className="text-ink-3">(blank)</span>}
              </td>
              <td aria-hidden className="text-ink-3">
                <Icon name="arrow" size={14} />
              </td>
              <td className="px-2 text-ink-2">{c.field ?? 'Not set'}</td>
              <td className="px-4">
                <StatusChip status={MATCH_CHIP[c.match]}>{MATCH_COPY[c.match]}</StatusChip>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {analysis.missing.length ? (
        <p className="border-t border-line px-4 py-3 text-small font-semibold text-danger">Missing required: {analysis.missing.join(', ')}</p>
      ) : null}
      {analysis.columns.some((c) => c.match === 'photo-link') ? (
        <p className="border-t border-line px-4 py-3 text-small text-ink-2" data-testid="photo-link-note">
          Not used. Clear these columns: a bad link still fails the row.
        </p>
      ) : null}
    </div>
  )
}

/* ---------------------------------------------------------------------------------------------- */
/* Steps 1 and 2                                                                                   */
/* ---------------------------------------------------------------------------------------------- */

function UploadSteps({ listOn }: { listOn: Marketplace[] }) {
  const navigate = useNavigate()
  const history = useImportHistory()
  const intent = useIntentKey()
  const [step, setStep] = useState<0 | 1>(0)
  const [file, setFile] = useState<File | null>(null)
  const [analysis, setAnalysis] = useState<HeaderAnalysis | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const products = useAllProducts()
  const brandCategories = products.data ? products.data.rows.map((p) => p.category) : products.isError ? [] : null

  const upload = useMutation({
    meta: { toast: false },
    mutationFn: (f: File) => {
      const fd = new FormData()
      fd.append('file', f, f.name)
      return unwrap(api.POST('/products/bulk', { params: { header: idempotencyHeader(intent.get()) }, body: fd as never }))
    },
    onSuccess: (res, f) => {
      intent.reset()
      markJobLive(res.job_id, res.import_id)
      if (analysis) analyses.set(res.import_id, { name: f.name, analysis })
      history.add({ import_id: res.import_id, job_id: res.job_id, filename: f.name, size: f.size, created_at: new Date().toISOString() })
      const on = serializeListOn(listOn)
      void navigate({ to: '/add/bulk', search: { import: res.import_id, job: res.job_id, ...(on ? { on } : {}) } })
    },
    onError: (err) => {
      if (isApiError(err) && err.type === 'IDEMPOTENCY_KEY_REUSED') intent.reset()
    },
  })

  const pick = async (f: File | null, rejected?: FileRejection) => {
    intent.reset()
    upload.reset()
    setProblem(null)
    setAnalysis(null)
    setFile(null)
    if (rejected) {
      setProblem(rejected.errors[0]?.code === 'file-invalid-type' ? 'Choose a .csv file. Excel files are not accepted yet: save as CSV first.' : 'Upload one file at a time.')
      return
    }
    if (!f) return
    if (f.size === 0) return setProblem('The file is empty.')
    if (f.size > MAX_FILE_BYTES) return setProblem(`The file is larger than 10 MB (${formatBytes(f.size)}).`)
    setFile(f)
    try {
      setAnalysis(analyzeCsv(await f.text()))
    } catch {
      setProblem('This file could not be read as text.')
    }
  }

  const dz = useDropzone({
    onDrop: (ok, bad) => void pick(ok[0] ?? null, ok[0] ? undefined : bad[0]),
    multiple: false,
    accept: { 'text/csv': ['.csv'] },
    disabled: upload.isPending,
  })

  const tooMany = (analysis?.rows ?? 0) > MAX_IMPORT_ROWS
  // A header and no rows: nothing to import, so the upload is never offered.
  const empty = analysis ? analysis.rows === 0 : false
  const serverErr = isApiError(upload.error) ? upload.error : null

  return (
    <div className="flex min-h-[calc(100svh-56px)] flex-col">
      <Page className="flex-1">
        <PageHeader title="Bulk upload" description={file ? `${file.name}${analysis ? ` · ${rowsLabel(analysis.rows)}` : ''}` : 'Fill the template, then upload it as a CSV file.'} />
        <Stepper steps={STEPS} current={step} className="mb-6" />

        {step === 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <LaCard>
              <CardHead title="Download the template" sub="One row per product or variant. Variants name their style in parent_style_id." />
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => downloadTemplate('minimal')}>
                  <Icon name="download" size={16} />
                  Required columns
                </Button>
                <Button variant="secondary" onClick={() => downloadTemplate('full')}>
                  <Icon name="download" size={16} />
                  All columns
                </Button>
              </div>
              <p className="mt-3 text-small text-ink-2">
                Required: {REQUIRED_COLUMNS.join(', ')}. Up to {MAX_IMPORT_ROWS.toLocaleString('en-IN')} rows and 10 MB.
              </p>
              <p className="mt-1 text-small text-ink-2" data-testid="weight-format">
                Package weight in package_weight_g is whole grams (500). A package_weight column needs a unit (450 g or 0.45 kg).
              </p>
              <h3 className="mt-4 text-small font-bold text-ink">Category column</h3>
              <p className="mt-1 text-small text-ink-2">Use one of these codes. Rows with any other category fail.</p>
              <CategoryCodes className="mt-2" brandCategories={brandCategories} />
            </LaCard>
            <LaCard emphasis="tint">
              <CardHead title="How columns are matched" icon={CONCEPT_ICON.columns} />
              <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-5 text-small text-ink-2">
                <li>By header name, exactly as in the template (any letter case).</li>
                <li>A column we don’t recognise stops the whole file, so the upload step lists every column first.</li>
                <li>A SKU that already exists updates that product.</li>
                <li>Photos are not read from the file. Add them on each product’s Media tab after the import.</li>
              </ul>
            </LaCard>
          </div>
        ) : (
          <div className="grid items-start gap-4 lg:grid-cols-[1fr_1.25fr]">
            <LaCard>
              <div
                {...dz.getRootProps({
                  className: cn(
                    'focus-ring tactile flex min-h-52 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-[1.5px] border-dashed px-6 py-8 text-center shadow-inset-md [--focus-rest:var(--shadow-inset-md)]',
                    dz.isDragActive ? 'border-brand bg-brand-bg' : 'border-line-strong bg-sunken hover:border-ink-3',
                    problem && 'border-danger-line',
                  ),
                  'aria-label': 'CSV file drop zone',
                })}
                data-testid="csv-dropzone"
              >
                <input {...dz.getInputProps({ 'aria-label': 'CSV file' })} />
                <IconTile icon={file ? 'table' : 'upload'} tone="brand" size="lg" className="mb-1" />
                <p className="font-semibold text-ink">{file ? file.name : 'Drop your CSV here, or choose a file'}</p>
                <p className="text-small text-ink-2">{file ? `${formatBytes(file.size)} · ${analysis ? rowsLabel(analysis.rows) : '…'}` : 'CSV only, up to 10 MB'}</p>
              </div>
              {problem ? (
                <p role="alert" className="mt-3 text-small font-semibold text-danger">
                  {problem}
                </p>
              ) : null}
              {tooMany ? (
                <p role="alert" className="mt-3 text-small font-semibold text-danger">
                  The file has {analysis!.rows.toLocaleString('en-IN')} rows; the limit is {MAX_IMPORT_ROWS.toLocaleString('en-IN')}.
                </p>
              ) : null}
              {empty && !analysis?.refused ? (
                <p role="alert" className="mt-3 text-small font-semibold text-danger" data-testid="csv-empty">
                  The file has no product rows. Add at least one row under the header.
                </p>
              ) : null}
            </LaCard>
            <LaCard pad="none" className="overflow-hidden">
              <div className="p-4">
                <CardHead title="Column matching" sub="What the import will do with each column. Matching is by name; it can’t be changed here." />
              </div>
              {analysis ? (
                <ColumnTable analysis={analysis} />
              ) : (
                <p className="border-t border-line px-4 py-6 text-small text-ink-2">Choose a file to see its columns.</p>
              )}
            </LaCard>
          </div>
        )}

        {step === 1 && analysis && (analysis.photoLinkRows > 0 || analysis.linkProblems.length > 0) ? (
          <Banner
            tone={analysis.linkProblems.length ? 'danger' : 'attention'}
            role="status"
            className="mt-4"
            title={
              analysis.photoLinkRows > 0
                ? `${rowsLabel(analysis.photoLinkRows)} ${analysis.photoLinkRows === 1 ? 'has' : 'have'} photo links`
                : `${rowsLabel(analysis.linkProblems.length)} with a bad link`
            }
          >
            <p>
              {analysis.photoLinkRows > 0 ? 'Photo links are not used. Clear these columns: a bad link still fails the row. ' : ''}
              Add photos on each product’s Media tab after the import.
            </p>
            {analysis.linkProblems.length ? (
              <ul className="mt-1.5 flex flex-col gap-0.5 text-small" aria-label="Rows that will fail for a link" data-testid="link-problems">
                {analysis.linkProblems.slice(0, 5).map((p) => (
                  <li key={p.row}>
                    Row {p.row}: {p.problem}
                  </li>
                ))}
                {analysis.linkProblems.length > 5 ? <li>{analysis.linkProblems.length - 5} more rows like this.</li> : null}
              </ul>
            ) : null}
          </Banner>
        ) : null}

        {serverErr ? (
          <Banner tone="danger" role="alert" className="mt-4" title="The file was refused">
            <p>
              {serverErr.type === 'IMPORT_FAILED'
                ? (serverErr.errorReport?.errors ?? []).map((e) => sentenceCase(e.message)).join(' ') || sentenceCase(serverErr.message)
                : serverErr.type === 'RATE_LIMITED'
                  ? 'Two imports are already running. Wait for one to finish.'
                  : describeError(serverErr)}
            </p>
            <div className="mt-1">
              <ReferenceId id={serverErr.correlationId} />
            </div>
          </Banner>
        ) : upload.error ? (
          <Banner tone="danger" role="alert" className="mt-4">
            {describeError(upload.error)}
          </Banner>
        ) : null}
      </Page>
      <FooterBar status={step === 0 ? 'Already have a filled file? Go straight to upload.' : 'Nothing is sent to a marketplace from here. You check the result first.'}>
        {step === 1 ? (
          <Button variant="ghost" onClick={() => setStep(0)} disabled={upload.isPending}>
            Back
          </Button>
        ) : (
          <Button variant="ghost" asChild>
            <Link to="/add">Back</Link>
          </Button>
        )}
        {step === 0 ? (
          <Button onClick={() => setStep(1)} data-testid="bulk-next">
            Next: Upload
            <Icon name="arrow" size={16} />
          </Button>
        ) : (
          <Button
            disabled={!file || !analysis || analysis.refused || tooMany || empty || upload.isPending}
            onClick={() => file && upload.mutate(file)}
            data-testid="bulk-upload"
          >
            {upload.isPending ? <Spinner data-icon="inline-start" /> : null}
            {analysis?.refused ? 'Fix the columns first' : empty ? 'No product rows' : analysis ? `Upload ${rowsLabel(analysis.rows)}` : 'Upload'}
          </Button>
        )}
      </FooterBar>
    </div>
  )
}

/* ---------------------------------------------------------------------------------------------- */
/* Step 3                                                                                          */
/* ---------------------------------------------------------------------------------------------- */

function useImportRowsAll(importId: string, status: 'failed' | 'imported', enabled: boolean) {
  const keys = useKeys()
  return useQuery({
    queryKey: [...keys.importRows.list(importId, status), 'all'] as const,
    enabled,
    queryFn: () =>
      walkPages<ImportRow>((cursor) =>
        unwrap(api.GET('/imports/{import_id}/rows', { params: { path: { import_id: importId }, query: { status, limit: 200, cursor } } })),
      ),
  })
}

const csvCell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

function downloadErrorRows(name: string, rows: readonly ImportRow[]) {
  const lines = [['row', 'seller_sku', 'field', 'problem']]
  for (const r of rows) for (const e of rowProblems(r.errors)) lines.push([String(r.row_number), r.sku ?? '', e.field, plainRowError(e)])
  const blob = new Blob([lines.map((l) => l.map(csvCell).join(',')).join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** A count tile. `pending`: the import is still running, so every tile shows the same placeholder. */
function Tile({ value, caption, tone, pending }: { value: ReactNode; caption: string; tone?: 'success' | 'attention' | 'tint'; pending?: boolean }) {
  return (
    <LaCard pad="sm" emphasis={pending ? 'default' : tone === 'success' ? 'success' : tone === 'attention' ? 'attention' : tone === 'tint' ? 'tint' : 'default'}>
      {pending ? (
        <Skeleton className="h-9 w-12" />
      ) : (
        <p className={cn('font-display text-h1 tabular-nums', tone === 'success' ? 'text-success' : tone === 'attention' ? 'text-attention' : 'text-ink')}>{value}</p>
      )}
      <p className="mt-0.5 text-small text-ink-2">{caption}</p>
    </LaCard>
  )
}

function CheckAndSend({ importId, jobId, listOn: initialListOn }: { importId: string; jobId: string | null; listOn: Marketplace[] }) {
  const keys = useKeys()
  const qc = useQueryClient()
  const can = useCan()
  const aiPaused = useAiPaused()
  const history = useImportHistory()
  const polling = useImportJob(jobId, () => importId)
  const job = polling.job
  const jobKnown = !!jobId && !isNotFound(polling.error)
  const report = useImportReport(importId, { live: job?.status === 'running', final: polling.isTerminal, watch: !jobKnown })
  const done = polling.isTerminal || (!jobKnown && report.settled)
  const failedRows = useImportRowsAll(importId, 'failed', done)
  const importedRows = useImportRowsAll(importId, 'imported', done)
  const products = useAllProducts()
  const listings = useAllListings()
  const { connected } = useConnectedMarketplaces()
  const [listOn, setListOn] = useState<Marketplace[]>(initialListOn)
  const [sending, setSending] = useState<{ done: number; total: number } | null>(null)
  const [results, setResults] = useState<ItemOutcome[] | null>(null)

  const local = analyses.get(importId)
  const entry = history.entries.find((e) => e.import_id === importId)
  const r = report.data

  const duplicates = (failedRows.data?.rows ?? []).filter((row) => (row.errors ?? []).some((e) => e.error_code === 'DUPLICATE_SKU_IN_FILE')).length
  const needValue = r ? r.failed - duplicates : 0

  /** Imported styles and standalones (variants are listed through their style). */
  const sendable = useMemo(() => {
    const ids = new Set((importedRows.data?.rows ?? []).flatMap((row) => (row.product_id ? [row.product_id] : [])))
    const byId = new Map((products.data?.rows ?? []).map((p) => [p.id, p]))
    const out = []
    const parents = new Set<string>()
    for (const id of ids) {
      const p = byId.get(id)
      if (!p) continue
      if (p.parent_product_id) parents.add(p.parent_product_id)
      else out.push(p)
    }
    for (const pid of parents) {
      const p = byId.get(pid)
      if (p && !ids.has(pid)) out.push(p)
    }
    return out
  }, [importedRows.data, products.data])

  const listingsOf = (id: string) => {
    const m: Partial<Record<Marketplace, { status: Schema<'ListingStatus'> }>> = {}
    for (const l of listings.data?.rows ?? []) if (l.product_id === id) m[l.marketplace] = l
    return m
  }
  const plan = planGenerate(sendable, listOn, listingsOf)
  const planProducts = new Set(plan.send.map((i) => i.product.id)).size

  const send = async () => {
    setSending({ done: 0, total: plan.send.length })
    const out = await generateMany(plan.send, (d) => setSending({ done: d, total: plan.send.length }))
    setSending(null)
    setResults(out)
    invalidateListingWork(qc, keys, out.flatMap((o) => (o.kind === 'accepted' && o.accepted.listing_id ? [o.accepted.listing_id] : [])))
  }

  if (report.isPending)
    return (
      <div className="flex min-h-[calc(100svh-56px)] flex-col" aria-busy="true">
        <Page className="flex-1">
          <PageHeader title="Bulk upload" description={<span aria-hidden className="skeleton inline-block h-4 w-56 max-w-full rounded-md bg-muted align-middle" />} />
          <Stepper steps={STEPS} current={2} className="mb-6" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-[88px] rounded-card" />
            ))}
          </div>
        </Page>
        <FooterBar status="Sending opens once the import has run.">
          <Button variant="ghost" asChild>
            <Link to="/products">Cancel</Link>
          </Button>
        </FooterBar>
      </div>
    )
  if (report.error && !r)
    return (
      <Page>
        <PageHeader title="Bulk upload" />
        <LaCard pad="none">
          <ErrorState error={report.error} title={isNotFound(report.error) ? 'This import no longer exists' : 'Couldn’t load this import'} onRetry={() => void report.refetch()} />
        </LaCard>
      </Page>
    )

  const accepted = results?.filter((o) => o.kind === 'accepted').length ?? 0
  const failedSends = results?.filter((o): o is Extract<ItemOutcome, { kind: 'failed' }> => o.kind === 'failed') ?? []
  const waiting = job?.status === 'queued'
  const name = local?.name ?? entry?.filename

  return (
    <div className="flex min-h-[calc(100svh-56px)] flex-col">
      <Page className="flex-1">
        <PageHeader
          title="Bulk upload"
          description={`${name ? `${name} · ` : ''}${r ? rowsLabel(r.total_rows) : ''}`}
          actions={
            <Button variant="ghost" size="sm" asChild>
              <Link to="/imports/$importId" params={{ importId }} search={jobId ? { job: jobId } : {}}>
                Full import report
              </Link>
            </Button>
          }
        />
        <Stepper steps={STEPS} current={2} className="mb-6" />

        {!done ? (
          <Banner tone={waiting ? 'neutral' : 'info'} role="status" className="mb-4" title={waiting ? 'Queued: processing starts soon' : 'Checking your rows…'}>
            {waiting
              ? 'The import is accepted and will run when processing resumes. This page updates by itself.'
              : `${job?.progress_pct ?? 0}% done. Counts show once every row is checked.`}
            {waiting ? null : <ProgressBar value={(job?.progress_pct ?? 0) / 100} label="Import progress" className="mt-2" />}
          </Banner>
        ) : job && (job.status === 'failed' || job.status === 'dead_letter' || job.status === 'cancelled') ? (
          <Banner tone="danger" role="alert" className="mb-4" title="The import did not finish">
            {job.error?.errors?.[0]?.message ?? 'Open the full report for details.'}
          </Banner>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="bulk-counts">
          <Tile pending={!done} value={r?.imported ?? 0} caption="rows imported, ready for the agent" tone="success" />
          <Tile pending={!done} value={needValue} caption="need a fix" tone={needValue ? 'attention' : undefined} />
          <Tile pending={!done} value={duplicates} caption="repeat a SKU in the file" />
          {local ? (
            <Tile pending={!done} value={local.analysis.columns.filter((c) => c.match === 'ok' || c.match === 'alias').length} caption="columns matched by name" tone="tint" />
          ) : (
            <Tile pending={!done} value={r?.total_rows ?? 0} caption="rows in the file" tone="tint" />
          )}
        </div>

        <div className={cn('mt-4 grid items-start gap-4', local && 'lg:grid-cols-[1fr_1.25fr]')}>
          {local ? (
            <LaCard pad="none" className="overflow-hidden">
              <div className="p-4">
                <CardHead title="Column matching" />
              </div>
              <ColumnTable analysis={local.analysis} />
            </LaCard>
          ) : null}
          <LaCard pad="none" className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 p-4">
              <CardHead title="Rows that need you" />
              <Button
                variant="secondary"
                size="sm"
                disabled={!failedRows.data?.rows.length}
                onClick={() => downloadErrorRows(`${name?.replace(/\.csv$/i, '') ?? 'import'}-error-rows.csv`, failedRows.data?.rows ?? [])}
              >
                <Icon name="download" size={16} />
                Error rows
              </Button>
            </div>
            {!done ? (
              <p className="border-t border-line px-4 py-6 text-small text-ink-2">Rows appear here once the import has run.</p>
            ) : failedRows.isPending ? (
              <div className="flex flex-col gap-2 border-t border-line p-4">
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-3/4" />
              </div>
            ) : failedRows.error ? (
              <ErrorState error={failedRows.error} compact onRetry={() => void failedRows.refetch()} />
            ) : failedRows.data.rows.length === 0 ? (
              <p className="border-t border-line px-4 py-6 text-small text-ink-2">Every row was imported.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-small" aria-label="Rows that need you">
                  <thead>
                    <tr className="h-[38px] bg-sunken text-left text-caption font-bold text-ink-2">
                      <th className="w-14 px-4">Row</th>
                      <th className="px-2">SKU</th>
                      <th className="px-4">What is wrong</th>
                    </tr>
                  </thead>
                  <tbody>
                    {failedRows.data.rows.slice(0, 50).map((row) => (
                      <tr key={row.row_number} className="h-[46px] border-t border-line align-middle">
                        <td className="px-4 tabular-nums">{row.row_number}</td>
                        <td className="px-2">{row.sku ?? <span className="text-ink-3">No SKU</span>}</td>
                        <td className="px-4 text-ink">{rowProblems(row.errors).map(plainRowError).join(' ') || 'Not imported'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {failedRows.data.rows.length > 50 ? (
                  <p className="border-t border-line px-4 py-3 text-small text-ink-2">
                    {failedRows.data.rows.length - 50} more in the error rows file and the full report.
                  </p>
                ) : null}
              </div>
            )}
          </LaCard>
        </div>

        {done && importedRows.data && products.data ? <NeedsPhotosCard products={sendable} /> : null}

        {done ? <ListOnPicker className="mt-6" value={listOn} onChange={setListOn} connected={connected} /> : null}

        {results ? (
          <div className="mt-4 flex flex-col gap-3">
            {accepted ? (
              <Banner tone="success" role="status" title={`${accepted} ${accepted === 1 ? 'draft' : 'drafts'} queued`}>
                The agent drafts each listing. A person approves every one before it is sent.
              </Banner>
            ) : null}
            {failedSends.length ? (
              <Banner tone="danger" role="alert" title={`${failedSends.length} not started`}>
                {failedSends.slice(0, 5).map((f) => (
                  <p key={f.item.key} className="text-small">
                    {f.item.product.sku} on {f.item.marketplace === 'amazon' ? 'Amazon' : 'Flipkart'}: {f.message}
                  </p>
                ))}
              </Banner>
            ) : null}
          </div>
        ) : null}
      </Page>
      <FooterBar
        status={
          done
            ? `${planProducts} ${planProducts === 1 ? 'product goes' : 'products go'} to the agent${
                sendable.length > planProducts && listOn.length ? ` (${sendable.length - planProducts} already drafted there)` : ''
              }. ${rowsLabel(r?.failed ?? 0)} ${r?.failed === 1 ? 'waits' : 'wait'} for you.`
            : 'Sending opens once the import has run.'
        }
      >
        {results ? (
          <Button asChild data-testid="bulk-open-products">
            <Link to="/products">Open products</Link>
          </Button>
        ) : (
          <Button variant="ghost" asChild>
            <Link to="/products">Cancel</Link>
          </Button>
        )}
        {results ? null : !can('listing:generate') ? (
          <UnavailableButton reason="Your role can’t start drafts. An owner or operator can.">Send to the agent</UnavailableButton>
        ) : aiPaused ? (
          <UnavailableButton reason={AI_PAUSED_REASON} data-testid="bulk-send">Send to the agent</UnavailableButton>
        ) : (
          <Button className="min-w-44" disabled={!done || plan.send.length === 0 || !!sending} onClick={() => void send()} data-testid="bulk-send">
            {sending ? <Spinner data-icon="inline-start" aria-hidden /> : null}
            {sending
              ? `Starting drafts ${sending.done}/${sending.total}…`
              : listOn.length === 0
                ? 'Choose where to list'
                : `Send ${planProducts} to the agent`}
          </Button>
        )}
      </FooterBar>
    </div>
  )
}

export function BulkUpload({ listOn, importId, jobId }: { listOn: Marketplace[]; importId: string | null; jobId: string | null }) {
  if (importId) return <CheckAndSend key={importId} importId={importId} jobId={jobId} listOn={listOn} />
  return <UploadSteps listOn={listOn} />
}
