/** Product detail tabs (hi-fi p17), carried in `?tab=`. */
export const DETAIL_TABS = ['overview', 'variants', 'media', 'content', 'marketplaces', 'validation', 'activity'] as const
export type DetailTab = (typeof DETAIL_TABS)[number]
