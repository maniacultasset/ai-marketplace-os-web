/**
 * Brand API hooks. Checked against .backend apps/api/app/api/v1/routers/tenants.py and
 * routers/brand.py (surface.py ops tenants_me, tenants_me_update, brand_documents_*).
 *
 * Invalidation:
 *   PATCH /tenants/me          -> setQueryData(brand.profile()) (new ETag rides along); me() when the name changed
 *   POST/DELETE /brand/documents -> brand.documents()
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api, unwrap } from '@/api/client'
import { ifMatchHeader, unwrapVersioned, type Versioned } from '@/api/etag'
import { idempotencyHeader } from '@/api/idempotency'
import type { Me } from '@/api/types'
import { PAGE_SIZE, useCursorList } from '@/hooks/use-cursor-list'
import { tenantName } from '@/lib/auth'
import { useKeys } from '@/lib/query-keys'
import { isPendingDocument, type BrandDocument, type ChunkType } from './documents-model'
import type { TenantOut, TenantPatch } from './profile-model'

export const fetchProfile = () => unwrapVersioned(api.GET('/tenants/me'))

/** GET /tenants/me with its ETag (`Versioned<TenantOut>`). */
export function useBrandProfile() {
  const keys = useKeys()
  return useQuery({ queryKey: keys.brand.profile(), queryFn: fetchProfile })
}

/**
 * PATCH /tenants/me with If-Match = the ETag the draft was based on (never the latest cached
 * one: that would silently overwrite someone else's save). Errors are handled inline.
 */
export function useSaveProfile() {
  const keys = useKeys()
  const qc = useQueryClient()
  return useMutation({
    meta: { toast: false },
    mutationFn: ({ body, etag }: { body: TenantPatch; etag: string | null }) =>
      unwrapVersioned(api.PATCH('/tenants/me', { params: { header: ifMatchHeader(etag) }, body })),
    onSuccess: (next: Versioned<TenantOut>, { body }) => {
      qc.setQueryData(keys.brand.profile(), next)
      if (body.name !== undefined) void qc.invalidateQueries({ queryKey: keys.me() })
    },
  })
}

/** GET /brand/documents, newest first. Re-reads every 15 s while a document is queued or processing. */
export function useBrandDocuments() {
  const keys = useKeys()
  const [pending, setPending] = useState(false)
  const list = useCursorList<BrandDocument>({
    queryKey: keys.brand.documents(),
    fetchPage: (cursor) => unwrap(api.GET('/brand/documents', { params: { query: { limit: PAGE_SIZE, cursor } } })),
    refetchInterval: pending ? 15_000 : false,
  })
  const anyPending = list.rows.some(isPendingDocument)
  useEffect(() => setPending(anyPending), [anyPending])
  return { ...list, pending: anyPending }
}

/** POST /brand/documents (multipart `file` + `type`), Idempotency-Key per user intent. */
export function useUploadDocument() {
  const keys = useKeys()
  const qc = useQueryClient()
  return useMutation({
    meta: { toast: false },
    mutationFn: ({ file, type, key }: { file: File; type: ChunkType; key: string }) => {
      const fd = new FormData()
      fd.append('file', file, file.name)
      fd.append('type', type)
      return unwrap(
        api.POST('/brand/documents', {
          params: { header: idempotencyHeader(key) },
          // Multipart: the browser sets the boundary (docs/ARCHITECTURE.md "Multipart").
          body: fd as never,
        }),
      )
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.brand.documents() }),
  })
}

/** DELETE /brand/documents/{document_id} (204; an unknown or already deleted one is 404). */
export function useDeleteDocument() {
  const keys = useKeys()
  const qc = useQueryClient()
  return useMutation({
    meta: { toast: false },
    mutationFn: (documentId: string) =>
      unwrap(api.DELETE('/brand/documents/{document_id}', { params: { path: { document_id: documentId } } })),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.brand.documents() }),
  })
}

/**
 * The brand name for the shell: the cached GET /tenants/me name when this session has loaded it
 * (fresh after a rename), else the membership name from GET /auth/me. Never fetches by itself.
 */
export function useBrandName(me: Me | undefined) {
  const keys = useKeys()
  const cached = useQuery({ queryKey: keys.brand.profile(), queryFn: fetchProfile, enabled: false })
  const fromProfile = cached.data?.data.id === me?.tenant_id ? cached.data?.data.name : undefined
  return fromProfile ?? tenantName(me)
}
