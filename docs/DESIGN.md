# Listing Agent design system

The system that screen builders work from. Source of truth:
`docs/design-reference/listing-agent-hifi-handoff.html` (tokens, components, 19 frames plus 15b, "Notes for the
build", "Not designed yet"). Screenshots of the frames are in `docs/design-reference/pdf-pages/p01..p18.png`. The
landing page takes only its structure and product truths from `ux_hi_fidelity.html` ("Aisle"), and none of its visual style.

**Product rules (non-negotiable).** Every working control calls the real API. No fake data, hardcoded counts or demo
records. Approval is always required (maker-checker). There is no autonomous or approval-off path. If the design
shows something the backend cannot do yet, render an honest state in the place the design puts it (see
"Not in the API yet"). Never add a dead button that looks live.

## Tokens (`src/index.css`)

Fixed light theme. There is no dark theme, because the hi-fi product kit has none. Never write a raw hex or px value
in a component. Use these Tailwind names:

| Token | Tailwind | Use |
|---|---|---|
| canvas `#F5F7FB` | `bg-canvas` | App background, table header, tint cards |
| surface `#FFF` | `bg-surface` | Cards, panels, inputs, sidebar, top bar |
| subtle `#EEF1F8` | `bg-subtle` | Chips, segmented track, disabled inputs |
| line / line-strong | `border-line` / `border-line-strong` | Card and row dividers / input and button borders |
| ink / ink-2 / ink-3 | `text-ink` / `text-ink-2` / `text-ink-3` | Text / secondary text / hints and placeholders only (3.7:1, never essential) |
| brand `#2D46E0`, brand-hover, brand-bg, brand-line | `bg-brand`, `hover:bg-brand-hover`, `bg-brand-bg`, `border-brand-line` | One primary action, selected state, in progress |
| success, attention, danger (+ `-bg`, `-line`, `-tint`, `-ink`) | `text-success`, `bg-attention-bg`, `border-danger-line`, `bg-attention-tint` … | Live and passed / needs you and blocked / error and destructive |

- Type: `font-display` (Bricolage Grotesque) for page and card titles, `font-sans` (DM Sans) for everything else.
  Both are self-hosted with `@fontsource-variable` (CSP `font-src 'self'`). Scale: `text-display` 34/38,
  `text-h1` 26/32, `text-h2` 20/26, `text-h3` 16/22 (all bold), `text-body` 14/20, `text-small` 13/18,
  `text-caption` 12/16. `h1`–`h4` get the display font automatically.
- Spacing: only 4, 8, 12, 16, 20, 24, 32, 48 (`1 2 3 4 5 6 8 12`). Card padding 20 (`p-5`). Page padding 28 (`p-7`,
  16 on mobile). Gap between cards 16. Gap between form fields 16.
- Radius: controls 8 (`rounded-control`/`rounded-lg`), cards 12 (`rounded-card`/`rounded-xl`), banners 10, chips
  and toggles pill.
- Elevation: `shadow-sm` on cards, `shadow-lg` (`shadow-pop`) on popovers, toasts and the bulk bar,
  `shadow-primary` on the primary button, `shadow-selected` on a selected card.
- Sizes: control 40 (`h-10`), button 36/30/44, sidebar 232/72, top bar 56.
- Focus: controls get a brand border plus `shadow-focus` (the 3px ring at 18% brand) via the `focus-ring` utility.
  Everything else gets the global 2px brand outline. Every interactive element shows one.

## Components

The shadcn kit in `src/components/ui` is restyled to the tokens. The Listing Agent pieces are in
`src/components/la` (`import { StatusChip, Banner, … } from '@/components/la'`).

| Component | Where | Notes |
|---|---|---|
| `Button` | `ui/button` | `variant`: `primary` (= `default`), `secondary` (= `outline`), `ghost`, `danger` (= `destructive`), `warn` (attention fill, e.g. "Open Inbox"), `subtle`, `link`. `size`: `md` 36, `sm` 30, `lg` 44, `xs`, `icon*`. One primary button per view. |
| `Input`, `Textarea`, `Select`, `Checkbox` | `ui/*` | 40px, line-strong border, `aria-invalid` shows the danger ring. Checkbox is 18px. |
| `LaField` | `la/field` | Label 13 bold, hint 12 ink-3, error replaces the hint. `source` puts a badge on the hint line. `needsInput` adds the attention border and tint. `critical` adds ★. `hintAction` is for the inline Confirm button. |
| `StatusChip` | `la/status-chip` | `draft working ready live partly-live needs-you blocked error paused not-listed`. Each has a glyph and a word, never colour alone. Pass `iconOnly` with `label` for dense cells (24px, tooltip). `TagChip` is for "Recommended" and "Later". |
| `listingChip(listing)` | `lib/listing-chip` | The only mapping from `ListingStatus` and `MarketplaceState` to a chip. **Live is shown only when `marketplace_state` is `live`.** |
| `SourceBadge` | `la/source-badge` | `you`, `brand-profile`, `rule`, `agent` (always shows confidence), `confirmed`, `needed`. An agent badge on a critical fact needs a Confirm action. |
| `Banner` | `la/banner` | `tone` info, success, attention, danger or neutral; optional `action`. Copy says what happened and the one next action. |
| `MarketplaceTile`, `MarketplaceName`, `MarketplaceCell`, `VariantCell`, `MARKETPLACES` | `la/marketplace` | All six marketplaces from the design. Only `supported` ones (amazon, flipkart) exist in the API. The cell is an icon-only chip with the listing id in 12px ink-3 under it. The variant cell is 34px, and "not made" cells are dashed. |
| `LaCard`, `CardHead`, `AttentionCard`, `DashedCard`, `TaskRow`, `MetricTile` | `la/cards` | `emphasis` default, attention, success, dashed, selected or tint. Never nest cards. |
| `Tabs` | `ui/tabs` | `variant="line"` is the hi-fi tabs (42px, 2px brand underline). The default variant is the segmented look. |
| `RouteTabs`, `Segmented` | `la/tabs` | Link tabs (product detail). The status filter is a radio group, and its counts come from the API and sum to the total. |
| `Stepper`, `ProgressBar`, `ProgressRing` | `la/progress` | Use the stepper only for real sequences (setup, bulk). The ring is 56px with a 7px stroke and shows "3/4". |
| `DataTable` | `components/data-table` | 38px canvas header, rows 48 or `density="tall"` 68, `bg-brand-bg` selection. `renderCard` turns rows into cards below 1024px (required for catalog tables). `bulkBar` renders a `BulkBar` (sticky, shadow-lg) while rows are selected. |
| `FooterBar` | `la/footer-bar` | Pinned footer for setup, guided and bulk screens: save state on the left, Back and the primary action on the right. |
| Toast | `lib/toast` | 360px wide, radius 12, shadow-lg, auto-dismisses after 6s. |
| `UnavailableButton`, `ComingSoon`, `UnavailableHint`, `NOT_YET` | `la/unavailable` | The honest states. They stay focusable, clicks do nothing, and the reason is the tooltip and the accessible description. Reuse the `NOT_YET` sentences. |
| `BeingBuilt` | `la/being-built` | A placeholder for an unbuilt route. Delete it when you replace the route. |
| `Icon`, `LogoMark`, `Wordmark` | `la/icons` | The hi-fi icon paths (24 grid, 1.75 stroke). Use lucide at `strokeWidth={1.75}` for anything else. |
| States | `components/states` | `ErrorState` (with reference id), `EmptyState`, `Forbidden`, `NotFound`, `RequireAction`. Loading uses skeletons shaped like the content. |

## Shell and layouts

- **App shell** (`components/app/app-shell.tsx`) covers every `/_app` route. It has a 232px sidebar with the mark,
  brand switcher (memberships from `/auth/me`, `POST /auth/switch-tenant`), nav (Home, Products, Add products,
  Inbox with an open-items count hidden at zero, Marketplaces, Activity, Settings, and Platform → Sign-up requests
  for `is_platform_admin`), an Agent card (listings in `generating` or `publishing`, otherwise "Idle") and a collapse
  control. The 56px top bar holds the page title, search (disabled because the API has no product search), the bell
  (Coming soon) and the avatar menu (Account, Diagnostics in dev, Sign out). Below 768px the sidebar becomes a drawer.
- Route metadata goes in `staticData`: `{ title }` is the top-bar title, `{ navCollapsed: true }` starts on the 72px
  rail (Products and Inbox, as in p07 and p15), and `{ solo: true }` uses the setup frame (logo header and
  "Save and exit", no sidebar).
- Pages: `<Page>` (padding 28, 16 on mobile) and `<PageHeader title description actions>` (H1 26 display, ink-2 line).
- Settings (`routes/_app/_settings.tsx`) is a pathless layout with a 200px sub-nav: Brand profile `/brand`,
  Compliance, Autonomy `/settings`, Notifications (soon), Team and brands `/team`, Marketplace rules `/rules`,
  Audit log (soon).
- Public pages use `PublicLayout` (`components/app/public-layout.tsx`): a white header with the mark, Sign in and
  one primary "Request access" (sign-up is reviewed by a person, ADR-0019), and a footer with the Privacy policy
  link.
- Responsive: no horizontal page scroll at 390px. Tables become cards below 1024px. Touch targets are 52px on
  mobile task screens.

## Route ownership

Files marked "placeholder" render `BeingBuilt` and are replaced by the owner area. The other routes are working
features. The owner restyles them to this system.

| Route | File | Owner | State |
|---|---|---|---|
| `/` landing (signed out; signed in → `/home`) | `routes/index.tsx` → `features/public/landing.tsx` | public | built |
| `/privacy` (draft, pending legal review) | `routes/privacy.tsx` → `features/public/privacy-policy.tsx` | public | built |
| `/login`, `/signup`, `/signup/status` | `routes/login.tsx`, `routes/signup*` → `features/public/*` (`AuthFrame`) | public | built (p01) |
| `/setup/brand`, `/setup/compliance`, `/setup/marketplaces` | `routes/_app/setup/*` (solo), `features/onboarding` | setup | built (step 1 saves name + tone; step 2 fields await an API) |
| `/settings/compliance` | `routes/_app/_settings/settings/compliance.tsx` | setup | built (shares `ComplianceForm`; disabled until an API exists) |
| `/home` | `routes/_app/home.tsx` → `features/home-inbox/home-page.tsx` | home-inbox | built (p05 first run when there are no listings, p06 otherwise) |
| `/analytics` (listing reports, linked from Home) | `routes/_app/analytics.tsx` | home | working |
| `/products` | `routes/_app/products/index.tsx` | products | built to p07 (`features/products-add`) |
| `/products/$productId` (tabs Overview, Variants, Media, Content, Marketplaces, Validation, Activity via `?tab=`) | `routes/_app/products/$productId.tsx` | products-detail | built to p17 (`features/products-add`) |
| `/listings/$listingId/mapping` (p18, on the listing's own marketplace) | `routes/_app/listings/$listingId/mapping.tsx` → `features/listing-flow/mapping-view.tsx` | listing-flow | built |
| `/add` (chooser) | `routes/_app/add/index.tsx` | add | built to p08 |
| `/add/guided`, `/add/variants` | `routes/_app/add/*` | add | built to p09, p10 (`/products/new` stays as the single-product form) |
| `/add/bulk` | `routes/_app/add/bulk.tsx` | add | built to p11 (`/imports/*`, `/jobs/$jobId` still work) |
| `/runs/$runId` (p12; the run id is the listing job id, GET /jobs/{id}) | `routes/_app/runs/$runId.tsx` → `features/listing-flow/agent-run.tsx` | listing-flow | built |
| `/listings/$listingId/review` (p13), `/listings/$listingId/live` (p14) | `routes/_app/listings/$listingId/*` → `features/listing-flow/review.tsx`, `live.tsx` | listing-flow | built |
| `/inbox` | `routes/_app/inbox.tsx` → `features/home-inbox/inbox-page.tsx` | home-inbox | built (p15, p15b; answering disabled, no API) |
| `/issues/$issueId` | `routes/_app/issues/$issueId.tsx` → `features/home-inbox/issue-detail-page.tsx` | home-inbox | built (p16; pass `?listing=<listing_id>` when linking, the API has no GET /issues/{id}) |
| `/marketplaces`, `/marketplaces/connected` | `routes/_app/marketplaces/*` | marketplaces | working, restyle to p04 |
| `/activity` | `routes/_app/activity.tsx` | activity | placeholder (no tenant-wide feed: per-listing history only) |
| `/settings` (Autonomy) | `routes/_app/_settings/settings/index.tsx` | settings | placeholder (approval always on) |
| `/brand`, `/team`, `/rules`, `/rules/check` | `routes/_app/_settings/*` | settings | working |
| `/account`, `/about`, `/admin/signups` | `routes/_app/*` | settings / platform | working |

## Not in the API yet (honest states)

Use `NOT_YET.*` sentences from `la/unavailable`.

- **Disabled with a reason, where the design puts the control:** Google sign-in and email code (p01), "Read my
  site" (p02), pickup locations and brand-authorisation upload (p04), photo, URL and catalog-export intake
  (p08, "PIM or ERP" shows "Later"), product search, export, pause, archive and resubmit (p07), answering tasks (p15),
  the notifications bell, and the Notifications and Audit log settings.
- **"Join waitlist" disabled, plus a Not available chip:** Myntra, AJIO, Meesho and Nykaa (p04, p06, p17). The
  waitlist API does not exist, so the waitlist cannot capture interest yet.
- **Hidden because showing it would mislead:** the autonomous or approval-mode toggle (p19 shows approval as the
  only mode with a one-line explanation), "Change in Settings" on p13, agent confidence when the API returns none,
  and "Live" without `marketplace_state: live`.
- Counts such as the segmented filters and Home tiles must come from API responses. If the API cannot give a total,
  show what is loaded and say so ("Filter loaded rows"), or omit the number.

## Rules for every frame

Status is never colour alone. Live means confirmed. Every important value has a source. Marketplace fields come from
the live schemas or rules and are never a hard-coded list. Controls are 40px high on desktop and touch targets 52px
on mobile. Essential text is at least 4.5:1. Every element has the visible focus ring. Copy is in sentence case: a
button names its action, an error names the problem and the next step, and loading text ends with "…".
