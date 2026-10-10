import { useIsMutating, useMutation, useMutationState, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { api, unwrap } from '@/api/client'
import { isApiError } from '@/api/errors'
import type { Page, Schema } from '@/api/types'
import { useCursorList, PAGE_SIZE } from '@/hooks/use-cursor-list'
import { logout } from '@/lib/auth'
import { useKeys } from '@/lib/query-keys'
import { toastError } from '@/lib/toast'
import type { Member } from './roles'

export type MemberPatch = Schema<'MemberPatch'>

/** GET /members (oldest membership first, inactive included), cursor paged. */
export function useMembersList() {
  const keys = useKeys()
  return useCursorList<Member>({
    queryKey: keys.members.list(),
    fetchPage: (cursor) =>
      unwrap(api.GET('/members', { params: { query: { limit: PAGE_SIZE, cursor } } })) as Promise<Page<Member>>,
  })
}

/** Inline message for errors the row shows itself; null = handled elsewhere. */
export function inlineMemberError(error: unknown): string | null {
  if (!isApiError(error)) return null
  if (error.type === 'LAST_OWNER_REQUIRED') return 'A brand must keep at least one active owner.'
  if (error.status === 403) return "You can't change this member."
  return null
}

const memberMutationKey = (userId: string) => ['member-patch', userId] as const

/**
 * Role and status cells patch the same row through separate mutations; only the most recent
 * one on that row shows its inline error, so a row never stacks two messages.
 */
export function useIsLatestMemberMutation(userId: string, submittedAt: number) {
  const latest = useMutationState({
    filters: { mutationKey: memberMutationKey(userId) },
    select: (m) => m.state.submittedAt,
  })
  return submittedAt > 0 && submittedAt >= Math.max(0, ...latest)
}

/**
 * True while any PATCH for this row is in flight. Both the role select and the Active switch
 * are disabled on it, so one row never has two PATCHes racing (each would write its own
 * response over the other's in the cache).
 */
export function useMemberRowPending(userId: string) {
  return useIsMutating({ mutationKey: memberMutationKey(userId) }) > 0
}

/**
 * PATCH /members/{user_id} with exactly one field. No optimistic update: the row shows the
 * server's answer. Success replaces the row, invalidates the members list and, for your own
 * row, `me` (role may change and re-gate the nav). Deactivating yourself signs you out here.
 */
export function useUpdateMember(member: Member, selfId: string | undefined) {
  const keys = useKeys()
  const qc = useQueryClient()
  const isSelf = member.user_id === selfId
  return useMutation({
    mutationKey: memberMutationKey(member.user_id),
    meta: { toast: false },
    mutationFn: (body: MemberPatch) =>
      unwrap(api.PATCH('/members/{user_id}', { params: { path: { user_id: member.user_id } }, body })),
    onSuccess: async (row, body) => {
      qc.setQueryData<InfiniteData<Page<Member>>>(keys.members.list(), (old) =>
        old
          ? { ...old, pages: old.pages.map((p) => ({ ...p, data: p.data.map((m) => (m.user_id === row.user_id ? row : m)) })) }
          : old,
      )
      if (isSelf && body.is_active === false) {
        await logout()
        return
      }
      void qc.invalidateQueries({ queryKey: keys.members.list() })
      if (isSelf) void qc.invalidateQueries({ queryKey: keys.me() })
    },
    onError: (error) => {
      if (inlineMemberError(error)) {
        // 403/409 may mean the row changed on the server (e.g. promoted to owner by someone
        // else): re-read it so the row shows the server's role/status and its real locks.
        void qc.invalidateQueries({ queryKey: keys.members.list() })
        return
      }
      if (isApiError(error) && error.status === 401) return // session handling redirects
      if (isApiError(error) && error.status === 404) {
        toastError(error, 'This member is no longer in this brand.')
        void qc.invalidateQueries({ queryKey: keys.members.list() })
        return
      }
      toastError(error, "Couldn't update this member")
    },
  })
}
