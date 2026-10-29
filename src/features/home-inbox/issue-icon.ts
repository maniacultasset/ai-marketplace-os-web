import { CONCEPT_ICON } from '@/components/la/concept-icons'
import type { IconSource } from '@/components/la/icons'
import type { Issue } from '@/features/inbox/model'

const MISSING_DATA: ReadonlySet<Issue['error_code']> = new Set([
  'REQUIRED_FIELD_MISSING',
  'MISSING_ATTRIBUTE',
  'CRITICAL_FACT_MISSING',
  'IDENTIFIER_MISSING',
])

/**
 * One glyph per kind of problem, shared by Home "Waiting for you" and the Inbox list: image
 * problems get `image`, data the seller has not given yet gets FileWarning, anything else (a rule
 * or compliance violation, a rejected value) the alert triangle. A finding from the rules engine
 * is a rule violation even when the rule checks for a missing value, so it never takes the
 * missing-data glyph. The tile's tone (from severity) carries how bad it is.
 */
export function issueIcon(issue: Pick<Issue, 'field_path' | 'error_code'> & Partial<Pick<Issue, 'error_class' | 'source'>>): IconSource {
  const path = issue.field_path ?? ''
  if (path === 'images' || path.startsWith('images.') || issue.error_code === 'IMAGE_NON_COMPLIANT') return CONCEPT_ICON.imageProblem
  if (issue.source === 'rules_engine' || issue.error_class === 'compliance_error') return 'alert'
  if (MISSING_DATA.has(issue.error_code) || issue.error_class === 'missing_data') return CONCEPT_ICON.missingData
  return 'alert'
}
