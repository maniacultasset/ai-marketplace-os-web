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
| canvas `#EDF0F5` | `bg-canvas` | App background, sidebar, top bar, settings sub-nav, tint cards (matte tinted canvas) |
| surface `#FBFCFD` | `bg-surface` | Cards, panels, popovers, raised buttons, active nav tile (matte off-white) |
| field `#EEF1F6` | `bg-field` | Inset fields: inputs, textareas, select triggers, search, unchecked checkbox |
| sunken `#F4F6F9` | `bg-sunken` | Table header and row hover inside a raised container |
| subtle `#E8ECF3` | `bg-subtle` | Chips, inset tracks (segmented, progress), disabled inputs |
| hover / pressed | `bg-hover` / `bg-pressed` | Quiet hover and pressed fills for ghost buttons, nav rows, menu items |
| line / line-strong / edge-hover | `border-line` / `border-line-strong` / `hover:border-edge-hover` | Hairline edges (cards, rows) / field and button edges / field hover |
| ink / ink-2 / ink-3 | `text-ink` / `text-ink-2` / `text-ink-3` | Text 13.8:1 / secondary 6.5:1 / hints and placeholders `#586280` (4.9:1 or more on canvas, subtle, field and tinted chips) |
| brand `#2F46D6`, brand-hover, brand-bg, brand-line | `bg-brand`, `hover:bg-brand-hover`, `bg-brand-bg`, `border-brand-line` | One primary action, selected state, in progress |
| scrim | `bg-scrim` | Dialog, sheet and alert overlays (flat, never blurred) |
| success, attention, danger (+ `-bg`, `-line`, `-tint`, `-ink`) | `text-success`, `bg-attention-bg`, `border-danger-line`, `bg-attention-tint` … | Live and passed / needs you and blocked / error and destructive |

- Type: `font-display` (Bricolage Grotesque) for page and card titles, `font-sans` (DM Sans) for everything else.
  Both are self-hosted with `@fontsource-variable` (CSP `font-src 'self'`). Scale: `text-display` 34/38,
  `text-h1` 26/32, `text-h2` 20/26, `text-h3` 16/22 (all bold), `text-body` 14/20, `text-small` 13/18,
  `text-caption` 12/16. `h1`–`h4` get the display font automatically.
- Spacing: only 4, 8, 12, 16, 20, 24, 32, 48 (`1 2 3 4 5 6 8 12`). Card padding 20 (`p-5`). Page padding 28 (`p-7`,
  16 on mobile). Gap between cards 16. Gap between form fields 16.
- Radius: controls 8 (`rounded-control`/`rounded-lg`), cards 12 (`rounded-card`/`rounded-xl`), banners 10, chips
  and toggles pill.
- Elevation: see **Matte surfaces** below. The old names still work and map onto the matte scale:
  `shadow-sm` = `shadow-raised-sm`, `shadow-md` = `shadow-raised-md`, `shadow-lg`/`shadow-pop` =
  `shadow-raised-lg`, `shadow-primary` = `shadow-raised-brand`, `shadow-elev-1/2/3` = raised sm/md/lg.
- Sizes: control 40 (`h-10`), button 36/30/44, sidebar 232/72, top bar 56.
- Focus: controls get a brand border plus the ring (a 2px surface gap, then 2px of 60% brand) via the `focus-ring` utility, so it reads on raised, inset and brand-filled controls alike. The ring is
  drawn on top of the control's resting depth, read from `--focus-rest` (inset fields and raised buttons set
  it), so focus never flattens a control. Everything else gets the global 2px brand outline. Every interactive
  element shows one.

## Matte surfaces (soft neumorphism, accessible)

A matte layer on top of the hi-fi: soft, non-glossy surfaces lit from the top left. Layout, type, copy and
colour roles stay as in the hi-fi. Tokens live in `src/index.css`.

**No** gradients, glass (`backdrop-blur`), glow halos, gloss highlights or coloured light. **Always** a hairline
edge on every card, field and raised control (classic neumorphism's edgeless shapes fail contrast), the gap-plus-brand
focus ring, text at 4.5:1 or more, and status chips with a glyph plus a word.

| Depth | Token / utility | Use |
|---|---|---|
| Raised sm | `shadow-raised-sm` (or `raised` utility = surface + hairline + shadow) | Buttons (secondary, danger), brand switcher, active nav tile, icon tiles, monogram tiles, agent card, chips that are controls |
| Raised md | `shadow-raised-md` | Cards (`LaCard`, `Card`), DataTable container, mobile row cards |
| Raised lg | `shadow-raised-lg` | Floating things: popover, dropdown, select list, dialog, alert dialog, sheet, toast, `BulkBar`, `StickyActions` on desktop |
| Raised up | `shadow-raised-up` | Bars pinned to the bottom edge (`FooterBar`, `StickyActions` on mobile) |
| Raised brand / warn | `shadow-raised-brand`, `shadow-raised-warn` | Filled primary and warn buttons, logo mark, avatar, checked checkbox, current stepper dot |
| Inset sm / md | `shadow-inset-sm`, `shadow-inset-md`; utilities `inset-field` (field fill + strong hairline + inset) and `inset-track` | Inputs, textareas, select triggers, top-bar search, segmented and progress tracks, switch track, unchecked checkbox, todo stepper dot |
| Pressed | `shadow-pressed` (neutral), `shadow-pressed-fill` (brand/warn) | `:active` on every button and nav row, an open menu trigger (`aria-expanded`) |
| Thumb | `shadow-thumb` | The raised thumb in an inset track (segmented, tabs default variant, switch) |
| Flat | no shadow | Dashed cards (not connected, not listed), `tint` cards, banners (tinted), table rows, chips and badges, disabled controls |

Rules:

- **Raised vs inset vs flat.** Things you act on or that hold content sit raised. Things you type into or that
  show a level sit inset. Status, information and anything unavailable stays flat. A raised element never sits
  inside another raised element of the same size (no nested cards). Inside a raised card, use inset fields and
  raised-sm buttons only.
- **Canvas.** The shell (sidebar, top bar, settings sub-nav) shares the canvas tone, separated by hairlines, so
  the active nav tile and the cards read as raised. This is the one intentional change from the hi-fi's white
  sidebar and top bar.
- **Motion.** `tactile` (160ms, transform, opacity, shadow and colour only) on interactive surfaces; `lift`
  adds a 1px rise on hover to raised buttons and never applies to disabled or `aria-disabled` ones. `:active`
  sits back down and goes inset. `prefers-reduced-motion` removes the lift and all transitions.
- **Disabled is flat.** Disabled buttons drop their shadow (plus 45% opacity); disabled fields are flat with a
  dashed edge on `bg-subtle`. The honest "not available yet" controls (`UnavailableButton`) keep this look.
- **Tints.** Attention and success cards keep their tinted fill and coloured hairline and are raised like any
  card. Banners are flat tinted strips with a tone icon tile.
- **Never write a raw shadow value or hex in a component** (composing tokens, e.g.
  `shadow-[var(--focus-ring),var(--shadow-inset-sm)]`, is fine). Add a token in `index.css` if one is
  missing.

## Icons

One system, one weight: the hi-fi set (`Icon name="…"`, 24 grid, 1.75 stroke, round caps) first, then
lucide-react for anything it lacks. lucide's default stroke 2 is redrawn at 1.75 globally (`index.css`), so no
`strokeWidth` prop is needed; an explicit bolder stroke (a 2.5 check) is left alone. We kept lucide over
Phosphor: the hi-fi icon table is lucide-shaped, and one library avoids two visual dialects.

- Sizes: 14 dense cells, 16 inside controls (buttons, inputs, menu items), 18 nav rows and banners, 20 top bar.
- `IconGlyph icon={…}` renders either a hi-fi name or a lucide component. `IconSource` is the type.
- `IconTile icon tone size` (from `@/components/la`): a raised matte squircle with a tinted fill.
  `size` sm 28 (icon 16), md 36 (18), lg 44 (22). `tone` neutral, brand, ok, warn, fail. Use it for nav
  emphasis (active row), card headers (`CardHead icon=…`), empty states (`EmptyState` does it), banners
  (`Banner` does it), metric and setup cards. `flat` drops the shadow inside small raised parents.
- `MonogramTile` is the same tile with letters, only where the design uses a monogram (marketplaces via
  `MarketplaceTile`, brand initial). Never emoji, and never a letter standing in for an icon elsewhere.
- Icons are decorative (`aria-hidden`); the label next to them, or the button's `aria-label`, carries the meaning.

Mapping for area agents (use the left column; replace ad-hoc lucide imports with these where they appear):

| Meaning | Use | Instead of (lucide) |
|---|---|---|
| Home | `Icon name="home"` | `House`, `Home` |
| Product, catalog | `Icon name="box"` | `Package`, `Box` |
| Add | `Icon name="plus"` | `Plus` |
| Inbox, tasks | `Icon name="inbox"` | `Inbox` |
| Marketplace, store | `Icon name="store"` | `Store`, `ShoppingBag`, `ShoppingCart` |
| Activity, history | `Icon name="activity"` (feed) / `Icon name="clock"` (time) | `History`, `Clock`, `Hourglass` |
| Settings, rules | `Icon name="sliders"` | `Settings`, `SlidersHorizontal` |
| Done, passed | `Icon name="check"` | `Check`, `CheckIcon`, `CheckCircle2`, `CircleCheck` |
| Warning, needs you, error | `Icon name="alert"` | `AlertTriangle`, `TriangleAlert`, `AlertCircle`, `OctagonX` |
| Info | `Icon name="info"` | `Info`, `InfoIcon` |
| Close, remove | `Icon name="x"` | `X`, `XIcon` |
| Expand | `Icon name="chev"` | `ChevronDown`, `ChevronsUpDown` |
| Search | `Icon name="search"` | `Search`, `SearchIcon` |
| Upload, import | `Icon name="upload"` | `Upload`, `UploadCloud`, `FileUp` |
| Download, export | `Icon name="download"` | `Download` |
| Agent, AI | `Icon name="spark"` | `Sparkles`, `Wand2` |
| File, CSV, document | `Icon name="file"` / `Icon name="table"` (sheet) | `FileText`, `FileSpreadsheet`, `FileSearch`, `FileQuestion` |
| Image, media | `Icon name="image"` | `Image`, `ImageIcon` |
| Website, URL | `Icon name="globe"` | `Globe` |
| Variants, matrix | `Icon name="grid"` | `Grid`, `LayoutGrid`, `Rows3` |
| Compliance, trust | `Icon name="shield"` | `Shield`, `ShieldCheck`, `ShieldOff` |
| Go, next | `Icon name="arrow"` | `ArrowRight` |
| Filter | `Icon name="filter"` | `Filter`, `ListFilter` |
| Preview | `Icon name="eye"` | `Eye` |
| Retry, refresh | `Icon name="refresh"` | `RefreshCw`, `RotateCw`, `RotateCcw` |
| Pause | `Icon name="pause"` | `Pause`, `PauseCircle` |
| Connect, link | `Icon name="link"` | `Link`, `Link2` |
| Notifications | `Icon name="bell"` | `Bell` |
| Account, person | `Icon name="user"` | `User`, `UserRound` |
| Team | `Icon name="users"` | `Users` |
| Locked, permission | `Icon name="lock"` | `Lock` |
| Delete | `Icon name="trash"` | `Trash2` |
| Copy | `Icon name="copy"` | `Copy` |
| Open outside | `Icon name="external"` | `ExternalLink`, `ArrowUpRight` |
| More actions | `Icon name="more"` | `MoreHorizontal` |
| Everything else (offline, unplug, flask, gauge, log out, spinner) | lucide at its default (redrawn 1.75): `WifiOff`, `Unplug`, `FlaskConical`, `Gauge`, `LogOut`, `Loader2` | — |

## Components

The shadcn kit in `src/components/ui` is restyled to the tokens. The Listing Agent pieces are in
`src/components/la` (`import { StatusChip, Banner, … } from '@/components/la'`).

| Component | Where | Notes |
|---|---|---|
| `Button` | `ui/button` | `variant`: `primary` (= `default`), `secondary` (= `outline`), `ghost`, `danger` (= `destructive`), `warn` (attention fill, e.g. "Open Inbox"), `subtle`, `link`. `size`: `md` 36, `sm` 30, `lg` 44, `xs`, `icon*`. One primary button per view. Primary, secondary, danger and warn are raised with a 1px hover lift and press inset; ghost is quiet until pressed; disabled is flat. |
| `Input`, `Textarea`, `Select`, `Checkbox` | `ui/*` | 40px, inset (`inset-field`: field fill, line-strong hairline, inset shadow), `aria-invalid` shows the danger ring over the inset. Checkbox is 18px, inset when empty, raised brand when checked. |
| `LaField` | `la/field` | Label 13 bold, hint 12 ink-3, error replaces the hint. `source` puts a badge on the hint line. `needsInput` adds the attention border and tint. `critical` adds ★. `hintAction` is for the inline Confirm button. |
| `StatusChip` | `la/status-chip` | `draft working ready live partly-live needs-you blocked error paused not-listed`. Each has a glyph and a word, never colour alone. Pass `iconOnly` with `label` for dense cells (24px, tooltip). `TagChip` is for "Recommended" and "Later". |
| `listingChip(listing)` | `lib/listing-chip` | The only mapping from `ListingStatus` and `MarketplaceState` to a chip. **Live is shown only when `marketplace_state` is `live`.** |
| `SourceBadge` | `la/source-badge` | `you`, `brand-profile`, `rule`, `agent` (always shows confidence), `confirmed`, `needed`. An agent badge on a critical fact needs a Confirm action. |
| `Banner` | `la/banner` | `tone` info, success, attention, danger or neutral; optional `action`. Copy says what happened and the one next action. |
| `MarketplaceTile`, `MarketplaceName`, `MarketplaceCell`, `VariantCell`, `MARKETPLACES` | `la/marketplace` | All six marketplaces from the design. Only `supported` ones (amazon, flipkart) exist in the API. The cell is an icon-only chip with the listing id in 12px ink-3 under it. The variant cell is 34px, and "not made" cells are dashed. |
| `LaCard`, `CardHead`, `AttentionCard`, `DashedCard`, `TaskRow`, `MetricTile` | `la/cards` | `emphasis` default, attention, success, selected (raised md), dashed or tint (flat). `CardHead icon=… iconTone=…` adds a 36px icon tile. Never nest cards. |
| `Tabs` | `ui/tabs` | `variant="line"` is the hi-fi tabs (42px, 2px brand underline). The default variant is the segmented look. |
| `RouteTabs`, `Segmented` | `la/tabs` | Link tabs (product detail). The status filter is a radio group, and its counts come from the API and sum to the total. |
| `Stepper`, `ProgressBar`, `ProgressRing` | `la/progress` | Use the stepper only for real sequences (setup, bulk). The ring is 56px with a 7px stroke and shows "3/4". |
| `DataTable` | `components/data-table` | Raised md container, 38px sunken header (sticky), quiet rows (hairline, `bg-sunken` hover), rows 48 or `density="tall"` 68, `bg-brand-bg` selection. `renderCard` turns rows into cards below 1024px (required for catalog tables). `bulkBar` renders a `BulkBar` (sticky, raised lg, floating) while rows are selected. |
| `FooterBar` | `la/footer-bar` | Pinned footer for setup, guided and bulk screens: save state on the left, Back and the primary action on the right. |
| Toast | `lib/toast` | 360px wide, radius 12, raised lg, auto-dismisses after 6s. |
| `UnavailableButton`, `ComingSoon`, `UnavailableHint`, `NOT_YET` | `la/unavailable` | The honest states. They stay focusable, clicks do nothing, and the reason is the tooltip and the accessible description. Reuse the `NOT_YET` sentences. |
| `BeingBuilt` | `la/being-built` | A placeholder for an unbuilt route. Delete it when you replace the route. |
| `Icon`, `IconGlyph`, `IconTile`, `MonogramTile`, `LogoMark`, `Wordmark` | `la/icons` | See **Icons**. The hi-fi icon paths (24 grid, 1.75 stroke), any-source glyph, matte icon tiles and monogram tiles. |
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

`cn()` (`src/lib/utils.ts`) knows the custom type scale (`text-h3`, `text-small`, …) and matte shadows. Without that,
tailwind-merge reads `text-h3 text-ink` as two colours and drops the size. Add new `--text-*` or `--shadow-*` names there.
