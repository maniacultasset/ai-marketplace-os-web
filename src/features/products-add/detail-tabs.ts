import { z } from 'zod'
/** Product detail tabs (hi-fi p17), carried in `?tab=`. */
export const DETAIL_TABS = ['overview', 'variants', 'media', 'content', 'marketplaces', 'validation', 'activity'] as const
export type DetailTab = (typeof DETAIL_TABS)[number]

/** The product page's search (`?tab=`): an unknown tab falls back to Overview, never elsewhere. */
export const detailSearch = z.object({
  tab: z.enum(DETAIL_TABS).optional().catch(undefined),
})
