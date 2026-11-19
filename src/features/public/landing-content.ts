/**
 * The landing page's copy, in page order (Kuinn Landing Page Implementation Brief, Nov 2026, and the
 * founder's voice note). Section headlines and bodies are the brief's own words. Where the brief's
 * reference images carried another product's claims (a free trial, seller counts, customer logos,
 * marketplaces we do not publish to yet), the copy here says what Kuinn really does today.
 *
 * Numbers: every figure on the page is counted from the product itself (backend seed and catalog
 * tables, Nov 2026), never a customer outcome:
 *  - 235 marketplace rules: rules.seed.json, 139 Amazon + 97 Flipkart, 8 categories.
 *  - 88 product attributes: attribute_definitions.
 *  - 3 fix attempts: the backend's llm_max_correction_attempts.
 *  - 100%: approval is enforced by the API; nothing is sent without a person's approval.
 * Update them here if the catalog grows (docs/BRAND.md, Numbers).
 */
import type { MarketplaceId } from '@/components/la/marketplace'

export const HERO = {
  eyebrow: 'AI listing agent for Indian fashion brands',
  title: 'Automate your marketplace listing operations, end to end.',
  body: 'Kuinn turns product images and basic information into marketplace-ready listings. Kuinn creates, validates and publishes your listings, then diagnoses and resolves supported errors through resubmission.',
  live: 'Live on Amazon today. Flipkart is next.',
} as const

/** The three numbers under the hero body. Each is true of the product, not of a customer. */
export const HERO_STATS: readonly { value: string; label: string }[] = [
  { value: '235', label: 'Marketplace rules checked on every draft' },
  { value: '88', label: 'Product attributes Kuinn understands' },
  { value: '100%', label: 'Listings approved by your team before they go live' },
]

export const PROBLEM = {
  eyebrow: 'The problem',
  title: 'Listing a product shouldn’t take hours of manual work.',
  body: 'Listing products across marketplaces is a repetitive, time-consuming process. Every SKU requires manual data entry, marketplace-specific adjustments, multiple checks and repeated error corrections.',
  cardTitle: 'Manual listing workflow',
  note: 'Hours of repetitive work for every SKU',
  steps: [
    { title: 'Research product and keywords', detail: 'Search terms, competitors, category trends' },
    { title: 'Find the correct category', detail: 'A different tree on every marketplace' },
    { title: 'Fill marketplace attributes', detail: 'Fabric, fit, neckline, sleeve, care, size chart' },
    { title: 'Write the listing', detail: 'Title, bullets and description, per marketplace' },
    { title: 'Check requirements', detail: 'Limits, banned words, required fields' },
    { title: 'Submit and wait', detail: 'Hours, sometimes days, for a response' },
    { title: 'Fix errors and resubmit', detail: 'Decode the rejection, edit, send again' },
    { title: 'Repeat for the next SKU', detail: 'Then again for every size and colour' },
  ],
} as const

/**
 * The trusted-by band. The brief's reference showed another product's customer logos; Kuinn may
 * only show brands that use it and agreed to be named. Until that list exists the band names the
 * marketplaces Kuinn is built for, which is true. Add customers to TRUSTED_BRANDS (name + logo
 * file in public/landing/brands) and the band switches to them on its own.
 */
export const TRUSTED_BRANDS: readonly { name: string; logo: string }[] = []

export const TRUSTED = {
  brandsTitle: 'Trusted by leading e-commerce brands',
  marketplacesTitle: 'Built for the marketplaces India shops on',
} as const

export const SOLUTION = {
  eyebrow: 'The solution',
  title: 'Turn product images into structured marketplace-ready data.',
  body: 'Kuinn’s AI understands your products and automatically extracts essential attributes such as colour, fabric, fit, pattern, neckline and more. It converts product images and basic information into structured data, ready for marketplace-specific listing requirements.',
  kicker: 'Less manual data entry. More intelligent product onboarding.',
} as const

/** The seven cards of the Solution slider, one product (the maroon block print shirt) the whole way. */
export const SOLUTION_STEPS = [
  { id: 'input', short: 'Input', label: 'Product input', caption: 'Photos, details or a CSV row' },
  { id: 'agent', short: 'AI agent', label: 'AI agent working', caption: 'Understands the product' },
  { id: 'attributes', short: 'Attributes', label: 'Attributes extracted', caption: 'Read from the photos' },
  { id: 'listing', short: 'Listing', label: 'Optimised listing', caption: 'Written in your brand’s voice' },
  { id: 'rules', short: 'Rules', label: 'Rules checked', caption: 'Every field, every marketplace' },
  { id: 'approval', short: 'Approval', label: 'Approved by your team', caption: 'A person signs off' },
  { id: 'live', short: 'Live', label: 'Live on the marketplace', caption: 'Published, then watched' },
] as const

export type SolutionStepId = (typeof SOLUTION_STEPS)[number]['id']

export const SHIRT = {
  name: 'Maroon block print shirt',
  photo: '/landing/printed-shirt-420.webp',
  photo2x: '/landing/printed-shirt-840.webp',
  title: 'Men’s Maroon Block Print Cotton Shirt, Band Collar, Full Sleeves, Regular Fit, Festive and Casual Wear',
  bullets: ['Hand block print on soft cotton', 'Band collar with a short button placket', 'Full sleeves, easy to roll up', 'Pairs with jeans or chinos'],
  keywords: ['block print shirt men', 'maroon cotton shirt', 'band collar shirt', 'festive shirt'],
  attributes: [
    { label: 'Colour', value: 'Maroon', confidence: 97 },
    { label: 'Fabric', value: 'Cotton', confidence: 90 },
    { label: 'Pattern', value: 'Block print', confidence: 94 },
    { label: 'Collar', value: 'Band', confidence: 92 },
    { label: 'Sleeve', value: 'Full', confidence: 96 },
    { label: 'Fit', value: 'Regular', confidence: 87 },
  ],
  price: '1,299',
  mrp: '2,299',
} as const

export const WORKFLOW = {
  eyebrow: 'One workflow. Multiple marketplaces.',
  title: 'Understand once. Adapt to every marketplace.',
  body: 'Kuinn reads your product once, then writes and checks a version for each marketplace’s own categories, fields and limits. Your catalog stays in one place.',
} as const

/** The fan-out diagram's marketplaces, left to right. Stage comes from model.ts MARKET_STATUS. */
export const WORKFLOW_MARKETS: readonly MarketplaceId[] = ['amazon', 'flipkart', 'myntra', 'ajio', 'meesho', 'nykaa']

export const WHY = {
  eyebrow: 'Why Kuinn',
  titleLead: 'We don’t just create listings.',
  titleAccent: 'We get them live.',
  body: 'Unlike traditional tools that stop at listing creation, Kuinn takes your products all the way to live listings. It validates, detects errors, automatically fixes supported issues and resubmits, eliminating repetitive manual work.',
  columns: ['Kuinn', 'Manual work and spreadsheets', 'Other listing tools'] as const,
} as const

export type Support = 'yes' | 'partial' | 'no'

/** The comparison. "Other listing tools" means content generators and listing managers in general. */
export const WHY_ROWS: readonly { capability: string; cells: readonly [Support, Support, Support] }[] = [
  { capability: 'Reads product attributes from your photos', cells: ['yes', 'no', 'partial'] },
  { capability: 'Writes every listing in your brand’s voice', cells: ['yes', 'no', 'partial'] },
  { capability: 'Checks every field against each marketplace’s rules', cells: ['yes', 'no', 'partial'] },
  { capability: 'Publishes straight to the marketplace', cells: ['yes', 'no', 'partial'] },
  { capability: 'Diagnoses errors, fixes supported ones and resubmits', cells: ['yes', 'no', 'no'] },
  { capability: 'A person approves before anything goes live', cells: ['yes', 'partial', 'no'] },
  { capability: 'One catalog for every marketplace', cells: ['yes', 'no', 'partial'] },
]

export const DEMO = {
  eyebrow: 'See it work',
  title: 'From a CSV row to a live listing.',
  body: 'Follow one kurta set through the steps your whole catalog takes, exactly as your team sees them in Kuinn.',
} as const

export const AUDIENCE = {
  eyebrow: 'Who it is for',
  title: 'Built for your business.',
  body: 'Whether you’re a brand, a retailer or an agency, Kuinn adapts to your workflow and speeds up your product content operations.',
  cards: [
    {
      id: 'brands',
      title: 'For brands',
      body: 'Launch collections faster with listings written in your brand’s voice and checked against every marketplace’s rules.',
      points: ['Your tone and glossary on every listing', 'Photos read into product details'],
      cta: 'Explore for brands',
    },
    {
      id: 'retailers',
      title: 'For retailers',
      body: 'Onboard supplier catalogues from one CSV, enrich thin listings from product photos and keep every marketplace in step.',
      points: ['A report for every row', 'Rerun only the rows that failed'],
      cta: 'Explore for retailers',
    },
    {
      id: 'agencies',
      title: 'For agencies',
      body: 'Run listings for many brands from one login, each with its own voice, team and approvals, and turn work around faster.',
      points: ['One workspace per brand', 'Separate approvers for each client'],
      cta: 'Explore for agencies',
    },
  ],
} as const

export const CAPABILITIES = {
  eyebrow: 'Product capabilities',
  title: 'An agent that knows the marketplaces’ rules.',
  body: 'Every check runs as code against each marketplace’s own rulebook. The AI drafts and fixes; fixed rules judge; your team approves.',
  numbers: [
    { value: '235', label: 'Marketplace rules', detail: 'Amazon and Flipkart, enforced as code' },
    { value: '88', label: 'Product attributes', detail: 'From fabric and fit to neckline and care' },
    { value: '8', label: 'Fashion and home categories', detail: 'Kurta sets, jeans, tees, lamps and more' },
    { value: '3', label: 'Fix attempts', detail: 'Then the agent stops and shows you why' },
  ],
} as const

export const FAQ = {
  eyebrow: 'FAQ',
  title: 'Questions, answered.',
  aside: 'Still have questions? Our team replies within one working day.',
  items: [
    {
      q: 'What exactly is Kuinn?',
      a: 'Kuinn is an AI-powered marketplace operations platform designed to automate product listing workflows, help resolve listing issues and improve ongoing marketplace operations.',
    },
    {
      q: 'How is Kuinn different from Amazon Seller Central or Flipkart Seller Hub?',
      a: 'Marketplace seller portals provide essential marketplace-specific tools and information. Kuinn aims to bring operational workflows across marketplaces together, adding AI-powered diagnosis, automation and execution.',
    },
    {
      q: 'Can Kuinn create listings across multiple marketplaces?',
      a: 'Kuinn is designed to support marketplace-specific listing creation through connected integrations. Availability depends on the marketplaces currently supported: Amazon is live today and Flipkart is next.',
    },
    {
      q: 'Can Kuinn automatically fix listing errors?',
      a: 'Kuinn is designed to identify errors, diagnose their causes and automate corrections where the marketplace API and account permissions allow it. Some cases may still require seller approval or manual intervention.',
    },
    {
      q: 'Does Kuinn monitor listings after they go live?',
      a: 'Continuous listing monitoring is part of the V2 product direction. The exact monitoring signals depend on available marketplace data and integrations.',
    },
    {
      q: 'Which marketplaces does Kuinn support?',
      a: 'Amazon is live today. Flipkart is built and switches on next. Myntra, AJIO, Meesho and Nykaa Fashion are on the roadmap. The marketplaces section above always shows the latest status.',
    },
    {
      q: 'Do I need technical knowledge to use Kuinn?',
      a: 'No. Kuinn is being designed for marketplace sellers and operations teams, not just technical users.',
    },
    {
      q: 'Is my marketplace account data secure?',
      a: 'Kuinn connects through authorised marketplace integrations, such as Amazon’s Selling Partner API. It never asks for your marketplace password, and access tokens are encrypted and never reach the AI agent.',
    },
    {
      q: 'Can I manage multiple brands and accounts?',
      a: 'Yes. The platform supports multi-brand and multi-marketplace operations: each brand keeps its own catalog, team and approvals, and an owner can add brands from the brand switcher.',
    },
    {
      q: 'Does Kuinn replace my marketplace operations team?',
      a: 'No. Kuinn aims to reduce repetitive operational work and help teams focus on decisions, exceptions and business growth.',
    },
    {
      q: 'How is Kuinn priced?',
      a: 'Pricing is quote based. Your quote depends on how many products you list and where you sell. Requesting access is free.',
    },
  ],
} as const

export const FINAL_CTA = {
  pill: 'Live on Amazon. Flipkart is next.',
  titleLead: 'Stop juggling marketplaces.',
  titleAccent: 'Start scaling revenue.',
  body: 'Add your catalog once and let Kuinn handle the operational heavy lifting: drafting, rule checks, publishing and fixes. Your team approves every listing before it goes live.',
  primary: 'Request access',
  secondary: 'Book a demo',
  checks: ['Nothing goes live without your approval', 'Quote-based pricing for your catalog', 'Onboarding with our team', 'We never ask for your marketplace password'],
} as const

export const FOOTER = {
  contactTitle: 'We’ve got you.',
  contactBody: 'Questions about Kuinn, your catalog or your data? Reach out anytime. We are here to make listing easy.',
  tagline: 'The AI listing agent for Indian fashion brands. Every listing is checked against the marketplace’s rules and approved by your team.',
} as const
