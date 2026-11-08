/** The landing page's sections, in page order. */
export const SITE_SECTIONS = [
  { id: 'how', label: 'How it works' },
  { id: 'catalogs', label: 'Catalogs' },
  { id: 'marketplaces', label: 'Marketplaces' },
  { id: 'pricing', label: 'Pricing' },
] as const

export type SiteSectionId = (typeof SITE_SECTIONS)[number]['id']
