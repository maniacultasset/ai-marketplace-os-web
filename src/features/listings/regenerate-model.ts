/** Which listings of a product get a Regenerate control after a seller answer, and its label. */
import { MARKETPLACES } from '@/components/la/marketplace'
import type { Listing } from './model'

/** The listings of a product that have a version to regenerate (not `created`). */
export function regenerable<L extends Pick<Listing, 'status' | 'current_version_id'>>(rows: readonly L[]): L[] {
  return rows.filter((l) => l.status !== 'created' && !!l.current_version_id)
}

/** "Regenerate listing", or "Regenerate the Amazon listing" when the product has several. */
export function regenerateLabel(marketplace: string, several: boolean): string {
  if (!several) return 'Regenerate listing'
  const name = MARKETPLACES.find((m) => m.id === marketplace)?.name ?? marketplace
  return `Regenerate the ${name} listing`
}
