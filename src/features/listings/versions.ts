/**
 * A listing's versions (item 17, client feedback 11 Nov 2026): GET /listings/{id}/versions names
 * who started, edited and approved each version (members of this brand only; the server reads the
 * names in this tenant) and marks a self-approval (ADR-0031). Kuinn is named as the writer of the
 * versions it drafted.
 */
import type { Schema } from '@/api/types'

export type ListingVersion = Schema<'ListingVersionOut'>
type Person = Schema<'VersionPersonOut'>

export interface VersionRow {
  id: string
  /** "Version 2 · Edited by Asha Mehta" */
  title: string
  /** "Started by Ravi Kumar · Approved by Priya Sharma" */
  detail: string
  selfApproved: boolean
  at: string
}

/** "you" for the signed-in person; an erased account has no name left. */
export function personName(p: Person, meId: string | null | undefined): string {
  if (meId && p.user_id === meId) return 'you'
  return p.name?.trim() || 'a former member'
}

function writer(v: ListingVersion, meId: string | null | undefined): string {
  if (v.origin === 'generation') return 'Written by Kuinn'
  if (v.origin === 'regeneration') return 'Rewritten by Kuinn'
  if (v.origin === 'edit' && v.edited_by) return `Edited by ${personName(v.edited_by, meId)}`
  if (v.origin === 'import') return `Imported by ${personName(v.generated_by, meId)}`
  return v.written_by === 'kuinn' ? 'Written by Kuinn' : 'Edited'
}

export function versionRow(v: ListingVersion, meId: string | null | undefined): VersionRow {
  const parts: string[] = []
  // An import's person is already in the title.
  if (v.origin !== 'import') parts.push(`Started by ${personName(v.generated_by, meId)}`)
  if (v.approved_by) parts.push(`Approved by ${personName(v.approved_by, meId)}`)
  return {
    id: v.id,
    title: `Version ${v.version} · ${writer(v, meId)}`,
    detail: parts.join(' · '),
    selfApproved: !!v.approved_by && v.self_approved === true,
    at: v.created_at,
  }
}
