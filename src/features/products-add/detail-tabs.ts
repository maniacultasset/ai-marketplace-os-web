import { z } from 'zod'
/** Product detail tabs (hi-fi p17), carried in `?tab=`. */
export const DETAIL_TABS = ['overview', 'variants', 'media', 'content', 'marketplaces', 'validation', 'activity'] as const
export type DetailTab = (typeof DETAIL_TABS)[number]

/** Fields a link can open the product editor at (`?edit=barcode`, from the review screen's Identity gate). */
export const EDIT_TARGETS = ['barcode'] as const
export type EditTarget = (typeof EDIT_TARGETS)[number]

/**
 * The product page's search (`?tab=`, `?edit=`): an unknown tab falls back to Overview, never
 * elsewhere; an unknown edit target is dropped.
 */
export const detailSearch = z.object({
  tab: z.enum(DETAIL_TABS).optional().catch(undefined),
  edit: z.enum(EDIT_TARGETS).optional().catch(undefined),
})
