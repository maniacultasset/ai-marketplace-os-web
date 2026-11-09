/**
 * Myntra, AJIO, Meesho and Nykaa: one wording and one action on every screen, matching the
 * landing page ("On the roadmap"). Prod QA 9 Nov found three wordings ("Coming soon", "Not
 * available", "Not supported yet" / "API access needed"). RoadmapChip and WaitlistButton
 * (./unavailable) render it.
 */
export const ROADMAP = {
  label: 'On the roadmap',
  action: 'Join waitlist',
  reason: 'On the roadmap, with no date yet. The waitlist is not open yet.',
} as const
