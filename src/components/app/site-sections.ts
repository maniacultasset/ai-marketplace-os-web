/** The landing page's sections linked from the header, in page order. */
export const SITE_SECTIONS = [
  { id: 'solution', label: 'How it works' },
  { id: 'marketplaces', label: 'Marketplaces' },
  { id: 'why', label: 'Why Kuinn' },
  { id: 'faq', label: 'FAQ' },
  { id: 'pricing', label: 'Pricing' },
] as const

export type SiteSectionId = (typeof SITE_SECTIONS)[number]['id']
