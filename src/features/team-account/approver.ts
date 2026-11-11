/**
 * Maker-checker for small teams. The person who starts or edits a listing can never approve it
 * (backend services/maker_checker.py, MAKER_CHECKER_VIOLATION); it blocks only the maker. So a
 * brand is fine as soon as one other active person can make drafts (owner, operator) or approve
 * them (owner, reviewer): an owner with an operator works, the operator drafts and the owner
 * approves. A brand with nobody else (or only admins) can make drafts but never send them, so the
 * app says so before the click: in setup, on Home and in the approve area.
 *
 * Only owners and admins can read the team (GET /members needs team:manage). Anyone else is never
 * alone: an operator or reviewer always shares the brand with an owner.
 *
 * Owner approval (ADR-0031): a brand can let its owners approve their own work
 * (TenantOut.owner_self_approval, off by default; Settings > Autonomy). With it on, a solo owner is
 * not blocked. Reviewers never approve their own work, and operators and admins never approve.
 * Where the server answers for one listing (ListingDetail.can_approve / approve_hint), that answer
 * wins over this team read (approverNoticeFor).
 */
import type { Role } from '@/api/types'
import type { ListingDetail } from '@/features/listings/model'
import { useBrandProfile } from '@/features/brand/api'
import { useMe } from '@/lib/auth'
import { useCan } from '@/lib/permissions'
import type { Member } from './roles'
import { useMembersList } from './use-members'

export const APPROVER_COPY = {
  title: 'Someone else must approve',
  body: 'The person who starts or edits a listing can’t approve it, and nobody else on your team can approve yet. Add a teammate as an owner or reviewer.',
} as const

/** Shown to an owner who is alone while owner approval is off: two ways forward. */
export const OWNER_APPROVAL_COPY = {
  title: 'Two-person approval is on',
  body: 'The person who makes or edits a listing can’t approve it. If you work alone, turn on owner approval. Or invite a reviewer.',
  enable: 'Turn on owner approval',
  invite: 'Invite a reviewer',
} as const

/** The brand setting (PATCH /tenants/me `owner_self_approval`). */
export const OWNER_APPROVAL_SETTING = {
  label: 'Owners may approve their own listings',
  help: 'Turn this on if you work alone. Every approval of your own work is recorded in the listing history.',
} as const

/** Next to Approve when the server says this approval is a self-approval (ListingDetail.self_approval). */
export const SELF_APPROVAL_NOTE = 'You’re approving your own work. This is recorded.'

/** The setting's anchor on Settings > Autonomy: link with `to="/settings" hash={OWNER_APPROVAL_HASH}`. */
export const OWNER_APPROVAL_HASH = 'owner-approval'

/** Roles that make drafts (listing:generate) or approve them (listing:approve), lib/permissions MATRIX. */
export const TEAMMATE_ROLES: readonly Role[] = ['owner', 'operator', 'reviewer']

/**
 * Whether someone other than `meId` makes or approves drafts: an active owner, operator or
 * reviewer. `complete` is false while more member pages exist: not finding one then means
 * "don't know" (null), never "no".
 */
export function otherApproverExists(members: readonly Pick<Member, 'user_id' | 'role' | 'is_active'>[], meId: string, complete: boolean): boolean | null {
  if (members.some((m) => m.user_id !== meId && m.is_active && TEAMMATE_ROLES.includes(m.role))) return true
  return complete ? false : null
}

export type ApproverState =
  /** Still reading the team. */
  | 'loading'
  /** Someone else makes or approves drafts, or this viewer is never alone (see above). */
  | 'ok'
  /** Nobody else makes or approves this brand's drafts. */
  | 'alone'
  /** As `alone`, and the viewer is an owner while owner approval is off: they can turn it on. */
  | 'owner_alone'
  /** The team could not be read. Say nothing rather than guess. */
  | 'unknown'

/**
 * The state of a viewer nobody else approves for. An owner is fine once owner approval is on, and
 * can turn it on while it is off. `ownerSelfApproval` is undefined while the brand is unread; a
 * failed read says nothing rather than offer a setting that may already be on.
 */
export function soloState(role: Role | null | undefined, ownerSelfApproval: boolean | undefined, readFailed = false): ApproverState {
  if (role !== 'owner') return 'alone'
  if (ownerSelfApproval === undefined) return readFailed ? 'unknown' : 'loading'
  return ownerSelfApproval ? 'ok' : 'owner_alone'
}

/**
 * Whether this viewer may approve their own edits: an owner while the brand's owner approval is on
 * (ADR-0031). Copy written before the server answers for a version (the edit dialog, its toast)
 * uses it so it never says a teammate must approve when the owner can. The server still decides.
 */
export function useOwnerMayApproveOwn(): boolean {
  const me = useMe()
  const profile = useBrandProfile()
  return me.data?.role === 'owner' && profile.data?.data.owner_self_approval === true
}

/** The edit dialog's line and the save toast for an owner who may approve their own edit. */
export const OWN_EDIT_COPY = {
  dialog: 'Saving creates a new version and runs the checks on it again. Owner approval is on, so you can approve it yourself. This is recorded.',
  dialogResend: (mp: string) =>
    `Saving creates a new version and runs the checks on it again. Owner approval is on, so you can approve it yourself and send it to ${mp} again. This is recorded.`,
  toast: 'The checks ran again. You can approve it yourself.',
  toastResend: (mp: string) => `The checks ran again. You can approve it yourself and send it to ${mp} again.`,
} as const

/** Whether this brand has a second person who can approve, or lets its owner approve alone. */
export function useApproverState(): ApproverState {
  const can = useCan()
  const me = useMe()
  const profile = useBrandProfile()
  const readsTeam = can('team:manage')
  const members = useMembersList({ enabled: readsTeam })
  if (!me.data) return me.isError ? 'unknown' : 'loading'
  if (!readsTeam) return 'ok'
  if (members.isPending) return 'loading'
  if (members.isError && !members.data) return 'unknown'
  const found = otherApproverExists(members.rows, me.data.user_id, !members.hasNextPage)
  if (found !== false) return 'ok'
  return soloState(me.data.role, profile.data?.data.owner_self_approval, profile.isError && !profile.data)
}

export type ApproverNoticeKind = 'alone' | 'owner_alone'

/**
 * Which approver notice one listing's Review shows. The server's answer for this caller and
 * version wins (`approve_hint`: `owner_can_enable` for an owner who can turn on owner approval,
 * `no_other_approver` for anyone else); once it answered `can_approve` the team read is not used.
 * Older backends send no answer: then the team read decides.
 */
export function approverNoticeFor(
  listing: Pick<ListingDetail, 'can_approve' | 'approve_hint'>,
  team: ApproverState,
): ApproverNoticeKind | null {
  if (listing.approve_hint === 'owner_can_enable') return 'owner_alone'
  if (listing.approve_hint === 'no_other_approver') return 'alone'
  if (listing.can_approve === true || listing.can_approve === false) return null
  return team === 'alone' || team === 'owner_alone' ? team : null
}
