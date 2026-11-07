/**
 * Team access rules for invites and reset links (backend services/invites.py and
 * password_reset_links.py, PLAN SI5 D5-D8). The server enforces every rule; this only hides or
 * disables what would fail, and says why.
 *
 * A link is `<app>/invite#token=…` or `<app>/reset-password#token=…`. The token sits after `#`,
 * so it never reaches a server log or a Referer. The pages read it once, take it out of the
 * address bar and keep it in this tab only.
 */
import { format } from 'date-fns'
import type { Me, Role } from '@/api/types'
import { ROLE_ORDER, type Member } from './roles'

/** Invite links work for 7 days, reset links for 24 hours (PLAN D5). */
export const INVITE_DAYS = 7
export const RESET_HOURS = 24

/** 32 random bytes, base64url without padding (the contract's `^[A-Za-z0-9_-]{43}$`). */
export const LINK_TOKEN = /^[A-Za-z0-9_-]{43}$/

export type LinkToken = { kind: 'ok'; token: string } | { kind: 'missing' } | { kind: 'malformed' }

/** The `token` in a `#token=…` fragment. Other fragment parts are ignored. */
export function readLinkToken(hash: string): LinkToken {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  if (!raw) return { kind: 'missing' }
  let value: string | null
  try {
    value = new URLSearchParams(raw).get('token')
  } catch {
    return { kind: 'malformed' }
  }
  if (value === null || value === '') return { kind: 'missing' }
  const token = value.trim()
  return LINK_TOKEN.test(token) ? { kind: 'ok', token } : { kind: 'malformed' }
}

/**
 * Where a link token waits in this tab (sessionStorage) while the person signs in or goes to
 * Google and back. It is removed once the link is used or refused.
 */
export function linkStash(key: string) {
  return {
    put(token: string) {
      try {
        sessionStorage.setItem(key, token)
      } catch {
        /* storage blocked: the page still works until it is reloaded */
      }
    },
    peek(): string | null {
      try {
        const v = sessionStorage.getItem(key)
        return v && LINK_TOKEN.test(v) ? v : null
      } catch {
        return null
      }
    },
    clear() {
      try {
        sessionStorage.removeItem(key)
      } catch {
        /* nothing to clear */
      }
    },
  }
}

export const inviteStash = linkStash('mkos.invite')
export const resetStash = linkStash('mkos.reset')

/**
 * Read the token from the address bar (then remove the fragment) or, after a reload or a sign-in
 * round trip, from this tab's stash.
 */
export function takeLinkToken(stash: ReturnType<typeof linkStash>, loc: Pick<Location, 'hash' | 'pathname' | 'search'> = window.location): LinkToken {
  const fromUrl = readLinkToken(loc.hash)
  if (loc.hash) {
    try {
      window.history.replaceState(window.history.state, '', `${loc.pathname}${loc.search}`)
    } catch {
      /* the fragment stays; the token still only lives in this tab */
    }
  }
  if (fromUrl.kind === 'ok') {
    stash.put(fromUrl.token)
    return fromUrl
  }
  if (fromUrl.kind === 'malformed') return fromUrl
  const kept = stash.peek()
  return kept ? { kind: 'ok', token: kept } : { kind: 'missing' }
}

/** Roles the caller may invite: only an owner invites an owner. */
export function inviteRoleOptions(myRole: Role | null | undefined): readonly Role[] {
  if (myRole === 'owner') return ROLE_ORDER
  if (myRole === 'admin') return ROLE_ORDER.filter((r) => r !== 'owner')
  return []
}

/** Why the caller cannot revoke this invite, or null when they can. */
export function revokeLockedReason(myRole: Role | null | undefined, inviteRole: Role): string | null {
  if (inviteRole === 'owner' && myRole !== 'owner') return 'Only an owner can cancel an owner invite.'
  return null
}

export type Enforcement = 'off' | 'all'

/**
 * Whether a reset link can be made for this member, and why not. What the browser can see:
 * yourself, an inactive member, an owner (for an admin) and sign-in codes being off. What it cannot
 * see (another brand, no authenticator, a platform admin) comes back from the server as a 403,
 * shown in the dialog.
 */
export function resetLinkReason(
  me: Pick<Me, 'user_id' | 'role'>,
  member: Pick<Member, 'user_id' | 'role' | 'is_active'>,
  enforcement: Enforcement | undefined,
): string | null {
  if (member.user_id === me.user_id) return 'Change your own password in Settings > Security.'
  if (member.role === 'owner' && me.role !== 'owner') return 'Only an owner can make a reset link for an owner.'
  if (!member.is_active) return 'Turn their access back on first.'
  if (enforcement === 'off') return 'Reset links work only when everyone signs in with a login code. Kuinn support can reset this password.'
  return null
}

/** "in 6 days", "in 5 hours", "in 12 minutes", or "now" once it has passed. */
export function untilLabel(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const mins = Math.floor((t - now) / 60_000)
  if (mins < 1) return 'now'
  if (mins < 60) return `in ${mins} minute${mins === 1 ? '' : 's'}`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `in ${hours} hour${hours === 1 ? '' : 's'}`
  const days = Math.floor(hours / 24)
  return `in ${days} day${days === 1 ? '' : 's'}`
}

/** "9 Nov, 14:05" in the viewer's time zone. */
export function shortDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return format(d, 'd MMM, HH:mm')
}

/** Emails compare as the backend stores them: trimmed, lower case. */
export const sameEmail = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase()
