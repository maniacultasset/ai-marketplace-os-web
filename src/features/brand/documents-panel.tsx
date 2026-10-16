/**
 * Brand documents: GET /brand/documents (list, Load more), POST /brand/documents (multipart,
 * Idempotency-Key, 202 + job polling), DELETE /brand/documents/{id} (confirm).
 */
import { useQueryClient } from '@tanstack/react-query'
import { AlertCircle, FileText, Trash2, UploadCloud, X } from 'lucide-react'
import { useState, type MouseEvent } from 'react'
import { useDropzone, type FileRejection } from 'react-dropzone'
import { isApiError, isNotFound, type ApiError } from '@/api/errors'
import { useIntentKey } from '@/api/idempotency'
import { JobStatusBadge } from '@/components/app/job-status-badge'
import { EmptyState } from '@/components/states/empty-state'
import { ErrorState } from '@/components/states/error-state'
import { ReferenceId } from '@/components/states/reference-id'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { useJobPolling } from '@/hooks/use-job-polling'
import { useKeys } from '@/lib/query-keys'
import { toast, toastError } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { formatDateTime, formatRelative } from '@/features/marketplaces/format'
import { useBrandDocuments, useDeleteDocument, useUploadDocument } from './api'
import {
  CHUNK_TYPES,
  checkDocumentFile,
  chunkTypeLabel,
  DOCUMENT_ACCEPT,
  documentStatusMeta,
  formatBytes,
  uploadErrorMessage,
  type BrandDocument,
  type ChunkType,
} from './documents-model'

export function DocumentsPanel({ canManage }: { canManage: boolean }) {
  const list = useBrandDocuments()
  const count = list.rows.length
  return (
    <Card className="gap-0 py-0" data-testid="brand-documents">
      <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4">
        <div className="space-y-1">
          <h2 className="text-[0.9375rem] font-semibold tracking-tight">Documents</h2>
          <p className="text-sm text-muted-foreground">Style guides and word lists the AI reads when it writes listings.</p>
        </div>
        {count ? (
          <span className="mt-0.5 shrink-0 text-xs text-muted-foreground tabular-nums" data-testid="documents-count">
            {count}
            {list.hasNextPage ? '+' : ''}
          </span>
        ) : null}
      </div>

      {canManage ? <UploadArea /> : null}

      <div className={cn('border-t', list.isPlaceholderData && 'opacity-60')}>
        {list.isPending ? (
          <DocumentsSkeleton />
        ) : list.isError && !count ? (
          <ErrorState compact error={list.error} onRetry={() => void list.refetch()} title="Couldn’t load documents" />
        ) : !count ? (
          <EmptyState
            compact
            icon={FileText}
            title="No documents yet"
            description={
              canManage
                ? 'Upload a style guide, glossary or compliance list as a .txt or .md file.'
                : 'Owners and admins can upload style guides here.'
            }
          />
        ) : (
          <>
            <ul className="divide-y" aria-label="Brand documents">
              {list.rows.map((d) => (
                <DocumentRow key={d.id} doc={d} canManage={canManage} />
              ))}
            </ul>
            {list.hasNextPage || list.isFetchNextPageError ? (
              <div className="flex flex-col items-center gap-1 border-t px-5 py-3">
                <Button
                  variant="ghost"
                  size="sm"
                  data-testid="load-more"
                  disabled={list.isFetchingNextPage}
                  onClick={() => void list.fetchNextPage()}
                >
                  {list.isFetchingNextPage ? <Spinner data-icon="inline-start" /> : null}
                  {list.isFetchingNextPage ? 'Loading…' : 'Load more'}
                </Button>
                {list.isFetchNextPageError ? (
                  <p className="text-xs text-destructive">Couldn’t load more. Try again.</p>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>
    </Card>
  )
}

function DocumentsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading documents" className="divide-y">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-5 py-3">
          <Skeleton className="size-8 rounded-lg" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  )
}

type Problem = { message: string; error?: ApiError }

function UploadArea() {
  const keys = useKeys()
  const qc = useQueryClient()
  const intent = useIntentKey()
  const upload = useUploadDocument()
  const [file, setFile] = useState<File | null>(null)
  const [type, setType] = useState<ChunkType>('tone_rule')
  const [problem, setProblem] = useState<Problem | null>(null)
  const [last, setLast] = useState<{ jobId: string; filename: string } | null>(null)

  const pick = (f: File | null) => {
    intent.reset()
    upload.reset()
    setProblem(null)
    setFile(null)
    if (!f) return
    const issue = checkDocumentFile(f)
    if (issue) {
      setProblem({ message: issue })
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
      message:
        code === 'too-many-files'
          ? 'Upload one file at a time.'
          : code === 'file-invalid-type'
            ? 'Choose a .txt or .md file.'
            : (r.errors[0]?.message ?? 'This file can’t be uploaded.'),
    })
  }

  const dz = useDropzone({
    onDrop,
    multiple: false,
    maxFiles: 1,
    accept: DOCUMENT_ACCEPT,
    disabled: upload.isPending,
    noClick: !!file,
    noKeyboard: !!file,
  })

  const submit = () => {
    if (!file) return
    setProblem(null)
    upload.mutate(
      { file, type, key: intent.get() },
      {
        onSuccess: (res) => {
          intent.reset()
          setLast({ jobId: res.job_id, filename: file.name })
          setFile(null)
          toast.success(`Uploaded ${file.name}`, {
            description: res.status === 'queued' ? 'Queued: processing starts soon.' : undefined,
          })
        },
        onError: (err) => {
          if (isApiError(err) && err.type === 'IDEMPOTENCY_KEY_REUSED') intent.reset()
          if (isApiError(err)) setProblem({ message: uploadErrorMessage(err), error: err })
          else setProblem({ message: 'Something went wrong. Try again.' })
        },
      },
    )
  }

  return (
    <div className="space-y-3 px-5 pb-5">
      <div
        {...dz.getRootProps({
          className: cn(
            'group flex min-h-24 flex-col items-center justify-center gap-2 rounded-lg border-[1.5px] border-dashed border-foreground/15 bg-muted/40 px-4 py-4 text-center outline-none',
            'transition-[border-color,background-color,box-shadow] duration-150',
            'focus-visible:border-brand focus-visible:ring-[3px] focus-visible:ring-brand/20',
            !file && 'cursor-pointer hover:border-foreground/30 hover:bg-muted/70',
            file && 'border-solid border-border bg-muted/20',
            dz.isDragActive && 'border-brand bg-brand-soft hover:border-brand hover:bg-brand-soft',
            problem && !problem.error && !dz.isDragActive && 'border-destructive/50',
          ),
          'aria-label': 'Brand document drop zone',
        })}
        data-testid="document-dropzone"
      >
        <input {...dz.getInputProps({ 'aria-label': 'Brand document file' })} />
        {file ? (
          <div className="flex w-full items-center gap-3 rounded-lg bg-card px-3 py-2 text-left shadow-elev-1 ring-1 ring-border">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
              <FileText className="size-4" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium" title={file.name} data-testid="selected-document">
                {file.name}
              </p>
              <p className="text-xs text-muted-foreground tabular-nums">{formatBytes(file.size)}</p>
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
              <X />
            </Button>
          </div>
        ) : (
          <>
            <UploadCloud
              className={cn('size-5 text-muted-foreground transition-colors duration-150 group-hover:text-foreground', dz.isDragActive && 'text-brand')}
              aria-hidden
            />
            <p className="text-sm font-medium">
              {dz.isDragActive ? 'Drop the file to add it' : (
                <>
                  Drop a file, or <span className="text-brand">choose one</span>
                </>
              )}
            </p>
            <p className="text-xs text-muted-foreground">UTF-8 .txt or .md, up to 10 MiB</p>
          </>
        )}
      </div>

      {file ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label htmlFor="document-type" className="sr-only">
            Document type
          </label>
          <Select value={type} onValueChange={(v) => {
            const next = CHUNK_TYPES.find((c) => c.value === v)
            if (next) {
              setType(next.value)
              intent.reset()
            }
          }}>
            <SelectTrigger id="document-type" className="w-full sm:flex-1" data-testid="document-type">
              <SelectValue>{chunkTypeLabel(type)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {CHUNK_TYPES.map((c) => (
                <SelectItem key={c.value} value={c.value} className="flex-col items-start gap-0.5">
                  <span>{c.label}</span>
                  <span className="text-xs text-muted-foreground">{c.description}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" onClick={submit} disabled={upload.isPending} data-testid="upload-document">
            {upload.isPending ? <Spinner data-icon="inline-start" /> : null}
            {upload.isPending ? 'Uploading…' : 'Upload'}
          </Button>
        </div>
      ) : null}

      {problem ? (
        <div role="alert" data-testid="document-problem" className="space-y-1.5 rounded-lg bg-destructive/5 p-3 ring-1 ring-destructive/25 dark:bg-destructive/10">
          <p className="flex items-start gap-2 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {problem.message}
          </p>
          {problem.error ? <ReferenceId id={problem.error.correlationId} className="pl-6" /> : null}
        </div>
      ) : null}

      {last ? (
        <LastUpload
          key={last.jobId}
          jobId={last.jobId}
          filename={last.filename}
          onTerminal={() => void qc.invalidateQueries({ queryKey: keys.brand.documents() })}
          onDismiss={() => setLast(null)}
        />
      ) : null}
    </div>
  )
}

/** The receipt for the latest upload: its job, polled until it ends. */
function LastUpload({
  jobId,
  filename,
  onTerminal,
  onDismiss,
}: {
  jobId: string
  filename: string
  onTerminal: () => void
  onDismiss: () => void
}) {
  const { job, isError, error, rateLimitedFor } = useJobPolling(jobId, { onTerminal })
  const status = job?.status
  const text =
    rateLimitedFor !== null
      ? `Checking again in ${rateLimitedFor} s`
      : status === 'queued'
        ? 'Queued: processing starts soon'
        : status === 'running'
          ? 'Processing…'
          : status === 'succeeded'
            ? 'Ready to use'
            : status === 'failed' || status === 'dead_letter' || status === 'cancelled'
              ? 'See the document below'
              : isError
                ? 'Status unavailable'
                : 'Checking status…'
  return (
    <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 ring-1 ring-border" data-testid="last-upload" aria-live="polite">
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium" title={filename}>
          {filename}
        </p>
        <p className="text-xs text-muted-foreground">{text}</p>
        {isError && isApiError(error) ? <ReferenceId id={error.correlationId} /> : null}
      </div>
      <JobStatusBadge status={status} />
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Dismiss" onClick={onDismiss}>
        <X />
      </Button>
    </div>
  )
}

function DocumentRow({ doc, canManage }: { doc: BrandDocument; canManage: boolean }) {
  const [confirm, setConfirm] = useState(false)
  const meta = documentStatusMeta(doc)
  return (
    <li className="flex items-start gap-3 px-5 py-3" data-testid="document-row" data-status={doc.status}>
      <div
        className={cn(
          'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg',
          doc.status === 'failed' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground',
        )}
      >
        <FileText className="size-4" aria-hidden />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="truncate text-sm font-medium" title={doc.filename} data-testid="document-name">
          {doc.filename}
        </p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <Badge variant={meta.variant} data-testid="document-status">
            <span aria-hidden className={cn('size-1.5 rounded-full bg-current', meta.live && 'motion-safe:animate-pulse')} />
            {meta.label}
          </Badge>
          <span>{meta.hint}</span>
          <span aria-hidden>·</span>
          <time dateTime={doc.created_at} title={formatDateTime(doc.created_at)}>
            {formatRelative(doc.created_at)}
          </time>
        </div>
        {doc.status === 'failed' && doc.error ? (
          <div className="space-y-0.5 text-xs">
            {doc.error.errors?.[0]?.message ? <p className="text-destructive">{doc.error.errors[0].message}</p> : null}
            {doc.error.error_code ? (
              <p className="text-muted-foreground">
                Code <code className="font-mono text-[11px]">{doc.error.error_code}</code>
              </p>
            ) : null}
            <ReferenceId id={doc.error.request_id} />
          </div>
        ) : null}
      </div>
      {canManage ? (
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-destructive"
            aria-label={`Delete ${doc.filename}`}
            onClick={() => setConfirm(true)}
          >
            <Trash2 />
          </Button>
          <DeleteDialog doc={doc} open={confirm} onOpenChange={setConfirm} />
        </>
      ) : null}
    </li>
  )
}

function DeleteDialog({ doc, open, onOpenChange }: { doc: BrandDocument; open: boolean; onOpenChange: (o: boolean) => void }) {
  const del = useDeleteDocument()
  const onConfirm = (e: MouseEvent) => {
    e.preventDefault()
    del.mutate(doc.id, {
      onSuccess: () => {
        toast.success(`Deleted ${doc.filename}`)
        onOpenChange(false)
      },
      onError: (err) => {
        if (isNotFound(err)) toast.info(`${doc.filename} was already deleted`)
        else toastError(err, 'Couldn’t delete the document')
        onOpenChange(false)
      },
    })
  }
  return (
    <AlertDialog open={open} onOpenChange={(o) => !del.isPending && onOpenChange(o)}>
      <AlertDialogContent data-testid="delete-document-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this document?</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-medium break-all text-foreground">{doc.filename}</span> stops being used for new listings
            right away. This can’t be undone; upload the file again to bring it back.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={del.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm} disabled={del.isPending}>
            {del.isPending ? <Spinner data-icon="inline-start" /> : null}
            {del.isPending ? 'Deleting…' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
