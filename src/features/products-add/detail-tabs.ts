import { z } from 'zod'
/** Product detail tabs (hi-fi p17), carried in `?tab=`. */
export const DETAIL_TABS = ['overview', 'variants', 'media', 'content', 'marketplaces', 'validation', 'activity'] as const
export type DetailTab = (typeof DETAIL_TABS)[number]

/** Fields a link can open the product editor at (`?edit=barcode`, from the review screen's Identity gate). */
export const EDIT_TARGETS = ['barcode'] as const
export type EditTarget = (typeof EDIT_TARGETS)[number]

export function isEditTarget(edit: string): edit is EditTarget {
  return (EDIT_TARGETS as readonly string[]).includes(edit)
}

/**
 * The product page's search (`?tab=`, `?edit=`): an unknown tab falls back to Overview, never
 * elsewhere. `?edit=` is an edit target (`barcode`) or an attribute key (Review's "Add on the
 * product", client feedback item 10) that opens the editor on that field once; a malformed value
 * is dropped.
 */
export const detailSearch = z.object({
  tab: z.enum(DETAIL_TABS).optional().catch(undefined),
  edit: z
    .string()
    .regex(/^[a-z][a-z0-9_]{1,63}$/)
    .optional()
    .catch(undefined),
})
