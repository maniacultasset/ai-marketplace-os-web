/**
 * /imports/new: one CSV -> POST /products/bulk (multipart part `file`, Idempotency-Key per
 * selected file).
 */
import { Icon, IconTile } from '@/components/la/icons'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useDropzone, type FileRejection } from 'react-dropzone'
import { api, unwrap } from '@/api/client'
import { describeError, isApiError, type ApiError } from '@/api/errors'
import { idempotencyHeader, useIntentKey } from '@/api/idempotency'
import { ReferenceId } from '@/components/states/reference-id'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { KNOWN_CATEGORIES } from '@/features/products/schema'
import {
  COLUMN_ALIASES,
  COLUMN_GROUPS,
  downloadTemplate,
  formatBytes,
  FULL_HEADER,
  MAX_FILE_BYTES,
  MAX_IMPORT_ROWS,
  MINIMAL_HEADER,
  REQUIRED_COLUMNS,
} from './csv-template'
import { ErrorReportList } from './error-report-list'
import { useImportHistory } from './history'
import { markJobLive } from './use-import-job'

type Problem =
  | { kind: 'client'; message: string }
  | { kind: 'server'; message: string; error: ApiError }

const IMPORT_CAP_MESSAGE = 'Two imports are already running. Wait for one to finish.'

function serverMessage(err: ApiError): string {
  switch (err.type) {
    case 'IMPORT_FAILED':
      return 'The file was refused. Fix these problems and upload it again.'
    case 'PAYLOAD_TOO_LARGE':
      return 'File is larger than 10 MiB.'
    case 'IDEMPOTENCY_KEY_REUSED':
      return 'This upload conflicted with an earlier one. Please submit again.'
    case 'RATE_LIMITED':
      return err.retryAfter === null ? IMPORT_CAP_MESSAGE : `Too many requests. Retry in ${err.retryAfter} s.`
    case 'NETWORK':
      return "Can't reach the server. Your file was kept; upload again when you're back online."
    default:
      return describeError(err)
  }
}

export function UploadForm() {
  const navigate = useNavigate()
  const history = useImportHistory()
  const intent = useIntentKey()
  const [file, setFile] = useState<File | null>(null)
  const [problem, setProblem] = useState<Problem | null>(null)

  const upload = useMutation({
    meta: { toast: false },
    mutationFn: (f: File) => {
      const fd = new FormData()
      fd.append('file', f, f.name)
      return unwrap(
        api.POST('/products/bulk', {
          params: { header: idempotencyHeader(intent.get()) },
          body: fd as never,
        }),
      )
    },
    onSuccess: (res, f) => {
      intent.reset()
      markJobLive(res.job_id, res.import_id)
      history.add({
        import_id: res.import_id,
        job_id: res.job_id,
        filename: f.name,
        size: f.size,
        created_at: new Date().toISOString(),
      })
      void navigate({
        to: '/imports/$importId',
        params: { importId: res.import_id },
        search: { job: res.job_id },
      })
    },
    onError: (err) => {
      if (isApiError(err) && err.type === 'IDEMPOTENCY_KEY_REUSED') intent.reset()
      setProblem({ kind: 'server', message: serverMessage(err), error: err })
    },
  })

  const pick = (f: File | null) => {
    intent.reset()
    upload.reset()
    setProblem(null)
    setFile(null)
    if (!f) return
    if (f.size === 0) {
      setProblem({ kind: 'client', message: 'The file is empty.' })
      return
    }
    if (f.size > MAX_FILE_BYTES) {
      setProblem({ kind: 'client', message: `File is larger than 10 MiB (${formatBytes(f.size)}).` })
      return
    }
    setFile(f)
  }

  const onDrop = (accepted: File[], rejected: FileRejection[]) => {
    if (accepted[0]) return pick(accepted[0])
    const r = rejected[0]
    if (!r) return
    pick(null)
    const code = r.errors[0]?.code
    setProblem({
      kind: 'client',
      message:
        code === 'too-many-files'
          ? 'Upload one file at a time.'
          : code === 'file-invalid-type'
            ? 'Choose a .csv file.'
            : (r.errors[0]?.message ?? 'This file cannot be uploaded.'),
    })
  }

  const dz = useDropzone({
    onDrop,
    multiple: false,
    maxFiles: 1,
    accept: { 'text/csv': ['.csv'] },
    disabled: upload.isPending,
    noClick: !!file,
  })

  const serverErr = problem?.kind === 'server' ? problem.error : null
  const reportItems = serverErr?.type === 'IMPORT_FAILED' ? (serverErr.errorReport?.errors ?? []) : []

  const dragging = dz.isDragActive

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        <Card className="gap-0 py-0">
          <div className="p-4 sm:p-5">
            <div
              {...dz.getRootProps({
                className: cn(
                  'group relative flex min-h-60 flex-col items-center justify-center gap-4 rounded-lg border-[1.5px] border-dashed border-line-strong bg-sunken px-6 py-10 text-center shadow-inset-md outline-none',
                  'tactile',
                  'focus-visible:border-brand focus-visible:shadow-[var(--focus-ring),var(--shadow-inset-md)]',
                  !file && 'cursor-pointer hover:border-ink-3',
                  file && 'border-solid border-line bg-sunken',
                  dragging && 'border-brand bg-brand-soft hover:border-brand hover:bg-brand-soft',
                  problem?.kind === 'client' && !dragging && 'border-destructive/50',
                ),
                'aria-label': 'CSV file drop zone',
              })}
              data-testid="csv-dropzone"
              data-drag-active={dragging || undefined}
            >
              <input {...dz.getInputProps({ 'aria-label': 'CSV file' })} />
              {file ? (
                <div className="flex w-full max-w-md items-center gap-3 rounded-lg border border-line bg-card px-3 py-2.5 text-left shadow-raised-sm">
                  <IconTile icon="table" tone="ok" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" data-testid="selected-file" title={file.name}>
                      {file.name}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {formatBytes(file.size)} · {upload.isPending ? 'Uploading…' : 'Ready to import'}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remove file"
                    disabled={upload.isPending}
                    onClick={(e) => {
                      e.stopPropagation()
                      pick(null)
                    }}
                  >
                    <Icon name="x" size={16} />
                  </Button>
                </div>
              ) : (
                <>
                  <IconTile
                    icon="upload"
                    tone={dragging ? 'brand' : 'neutral'}
                    size="lg"
                    className="tactile size-12 rounded-[14px] group-hover:text-brand"
                  />
                  <div className="space-y-1.5">
                    <p className="text-sm font-medium">
                      {dragging ? (
                        'Drop the CSV to add it'
                      ) : (
                        <>
                          Drag a CSV here, or <span className="text-brand">click to choose</span>
                        </>
                      )}
                    </p>
                    <p className="text-xs text-balance text-muted-foreground tabular-nums">
                      One UTF-8 .csv file, up to 10 MiB and {MAX_IMPORT_ROWS.toLocaleString()} rows.
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>

          {problem ? (
            <div className="px-4 pb-4 sm:px-5 sm:pb-5">
              <div
                role="alert"
                data-testid="upload-problem"
                className="space-y-3 rounded-lg bg-destructive/5 p-3.5 ring-1 ring-destructive/25 dark:bg-destructive/10"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="flex items-start gap-2 text-sm font-medium text-destructive">
                    <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
                    {problem.message}
                  </p>
                  {serverErr ? <ReferenceId id={serverErr.correlationId} /> : null}
                </div>
                {reportItems.length ? <ErrorReportList items={reportItems} dense /> : null}
              </div>
            </div>
          ) : null}

          <div className="flex flex-col-reverse gap-2 border-t border-line bg-sunken px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="sm" className="self-start text-muted-foreground sm:-ml-2">
                  <Icon name="download" size={16} data-icon="inline-start" />
                  Download template
                  <Icon name="chev" size={16} data-icon="inline-end" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuItem onSelect={() => downloadTemplate('minimal')} className="flex-col items-start gap-0.5">
                  <span>Required columns</span>
                  <span className="text-xs text-muted-foreground">{MINIMAL_HEADER.length} columns, ready to fill in</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => downloadTemplate('full')} className="flex-col items-start gap-0.5">
                  <span>All columns</span>
                  <span className="text-xs text-muted-foreground">Every stored column, {FULL_HEADER.length} in all</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="flex flex-col-reverse gap-2 sm:ml-auto sm:flex-row sm:items-center">
              {file ? (
                <Button type="button" variant="ghost" onClick={dz.open} disabled={upload.isPending}>
                  Choose another file
                </Button>
              ) : null}
              <Button
                type="button"
                disabled={!file || upload.isPending}
                onClick={() => {
                  if (!file) return
                  setProblem(null)
                  upload.mutate(file)
                }}
              >
                {upload.isPending ? <Spinner data-icon="inline-start" /> : <Icon name="upload" size={16} data-icon="inline-start" />}
                {upload.isPending ? 'Uploading…' : 'Upload and import'}
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <Card className="gap-0 py-0">
        <h2 className="px-5 pt-5 pb-1 text-[0.9375rem] font-semibold tracking-tight">Before you upload</h2>

        <section className="space-y-2 px-5 pt-3 pb-5">
          <h3 className={GUIDE_HEADING}>Required columns</h3>
          <ul className="flex flex-wrap gap-1.5">
            {REQUIRED_COLUMNS.map((c) => (
              <li key={c}>
                <span className={CATEGORY_CHIP}>{c}</span>
              </li>
            ))}
          </ul>
          <p className="text-[0.8125rem] leading-relaxed text-muted-foreground">
            Every row also needs an https image URL in <code className={INLINE_CODE}>main_image</code> or{' '}
            <code className={INLINE_CODE}>additional_images</code>.
          </p>
        </section>

        <section className="space-y-2 border-t px-5 py-5" data-testid="template-categories">
          <h3 className={GUIDE_HEADING}>Categories with a marketplace template</h3>
          <ul className="flex flex-wrap gap-1.5">
            {KNOWN_CATEGORIES.map((c) => (
              <li key={c}>
                <code className={CHIP}>{c}</code>
              </li>
            ))}
          </ul>
          <p className="text-[0.8125rem] leading-relaxed text-muted-foreground">
            Rows with any other category fail with <code className={INLINE_CODE}>CATEGORY_NOT_MAPPED</code>.
          </p>
        </section>

        <section className="space-y-2 border-t px-5 py-5">
          <h3 className={GUIDE_HEADING}>How rows are handled</h3>
          <ul className="space-y-2 text-[0.8125rem] leading-relaxed text-muted-foreground">
            {ROW_RULES.map((r) => (
              <li key={r} className="flex gap-2.5">
                <span aria-hidden className="mt-[0.5625rem] size-1 shrink-0 rounded-full bg-muted-foreground/60" />
                {r}
              </li>
            ))}
          </ul>
        </section>

        <Collapsible className="border-t">
          <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 px-5 py-3.5 text-left text-sm font-medium outline-none transition-colors duration-150 hover:bg-hover focus-visible:bg-hover focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset">
            All accepted columns
            <Icon name="chev" size={16} className="text-muted-foreground transition-transform duration-150 group-data-[state=open]:rotate-180 motion-reduce:transition-none" />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 border-t border-line bg-sunken px-5 py-4">
            {COLUMN_GROUPS.map((g) => (
              <div key={g.label} className="space-y-1" data-testid="column-group">
                <h3 className="text-xs font-medium text-foreground">
                  {g.label}
                  {g.notStored ? <span className="font-normal text-muted-foreground"> · accepted, not stored (warning when filled)</span> : null}
                </h3>
                <p className={cn('font-mono text-[11px] leading-relaxed break-words', g.notStored ? 'text-muted-foreground' : 'text-foreground/80')}>
                  {g.columns.join(', ')}
                </p>
              </div>
            ))}
            <div className="space-y-1" data-testid="column-aliases">
              <h3 className="text-xs font-medium text-foreground">Aliases</h3>
              <ul className="space-y-0.5 font-mono text-[11px] leading-relaxed">
                {COLUMN_ALIASES.map((a) => (
                  <li key={a.alias} className="break-words">
                    {a.alias} <span className="text-muted-foreground">→ {a.column}</span>
                    {a.note ? <span className="font-sans text-muted-foreground"> ({a.note})</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </Card>
    </div>
  )
}

const GUIDE_HEADING = 'text-xs font-medium text-muted-foreground'
const CHIP = 'inline-block rounded-md border border-line bg-subtle px-1.5 py-0.5 font-mono text-xs text-foreground'
/** Categories are labels, not identifiers: Geist, per DESIGN.md. */
const CATEGORY_CHIP = 'inline-block rounded-md border border-line bg-subtle px-1.5 py-0.5 text-xs text-foreground'
const INLINE_CODE = 'font-mono text-xs text-foreground'
const ROW_RULES = [
  'An existing SKU is updated; new SKUs are added as drafts.',
  'Bad rows fail on their own; the rest of the file still imports.',
  'Content and marketplace columns are accepted but not stored (warning).',
]
