/**
 * Maker-checker for small teams. The person who starts or edits a listing can never approve it
 * (backend services/maker_checker.py, MAKER_CHECKER_VIOLATION). A brand where nobody else can
 * approve (an owner or a reviewer) can make drafts but never send them, so the app says so before
 * the click: in setup, on Home and in the approve area.
 *
 * Only owners and admins can read the team (GET /members needs team:manage). Anyone else is never
 * alone: an operator or reviewer always shares the brand with an owner.
 */
import type { Role } from '@/api/types'
import { useMe } from '@/lib/auth'
import { useCan } from '@/lib/permissions'
import type { Member } from './roles'
import { useMembersList } from './use-members'

export const APPROVER_COPY = {
  title: 'Someone else must approve',
  body: 'The person who starts or edits a listing can’t approve it, and nobody else on your team can approve yet. Add a teammate as an owner or reviewer.',
} as const

/** Roles that hold listing:approve (lib/permissions MATRIX). */
export const APPROVER_ROLES: readonly Role[] = ['owner', 'reviewer']

/**
 * Whether someone other than `meId` can approve: an active owner or reviewer. `complete` is false
 * while more member pages exist: not finding one then means "don't know" (null), never "no".
 */
export function otherApproverExists(members: readonly Pick<Member, 'user_id' | 'role' | 'is_active'>[], meId: string, complete: boolean): boolean | null {
  if (members.some((m) => m.user_id !== meId && m.is_active && APPROVER_ROLES.includes(m.role))) return true
  return complete ? false : null
}

export type ApproverState =
  /** Still reading the team. */
  | 'loading'
  /** Someone else can approve, or this viewer is never alone (see above). */
  | 'ok'
  /** Nobody else can approve this brand's listings. */
  | 'alone'
  /** The team could not be read. Say nothing rather than guess. */
  | 'unknown'

/** Whether this brand has a second person who can approve. */
export function useApproverState(): ApproverState {
  const can = useCan()
  const me = useMe()
  const readsTeam = can('team:manage')
  const members = useMembersList({ enabled: readsTeam })
  if (!me.data) return me.isError ? 'unknown' : 'loading'
  if (!readsTeam) return 'ok'
  if (members.isPending) return 'loading'
  if (members.isError && !members.data) return 'unknown'
  const found = otherApproverExists(members.rows, me.data.user_id, !members.hasNextPage)
  return found === false ? 'alone' : 'ok'
}
