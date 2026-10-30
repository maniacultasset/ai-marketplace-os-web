# Listing Agent — web

The dashboard for Listing Agent. A brand's team adds products, the agent prepares Amazon and Flipkart
listings, the rules engine checks them, and a person approves them before anything is published.

Every screen reads from and writes to the backend API
([maniacultasset/ai-marketplace-os](https://github.com/maniacultasset/ai-marketplace-os)). There is no
mock layer and no demo data in the app.

## Stack

- Vite, React 19, TypeScript (strict)
- TanStack Router (file routes), TanStack Query, TanStack Table
- `openapi-fetch` with types generated from the backend's OpenAPI document
- react-hook-form and zod (limits mirror the backend; 422 details map onto fields)
- shadcn/ui on Radix, Tailwind CSS v4, Bricolage Grotesque + DM Sans (self-hosted), one light theme (docs/DESIGN.md)
- Vitest (unit) and Playwright (end to end, against a real backend)

## Getting started

Requires Node 24 and pnpm (`corepack enable`).

```sh
pnpm install
cp .env.example .env.local   # set DEV_API_PROXY_TARGET to a running backend
pnpm dev                     # http://localhost:5173
```

The dev server forwards `/api`, `/healthz` and `/readyz` to `DEV_API_PROXY_TARGET`, so the browser
talks to one origin. To run the backend itself, see its README.

## Connecting to the API

| Setting | Where | Purpose |
|---|---|---|
| `VITE_API_ORIGIN` | build time | Backend origin, e.g. `https://api.example.com`. Leave empty when the API is served on the same origin as the app, for example behind one load balancer with `/api/*` routed to the backend. |
| `DEV_API_PROXY_TARGET` | `pnpm dev` only | Backend the dev server proxies to. |

The backend must allow this app:

- `ALLOWED_ORIGINS` includes the app's origin (CORS, only needed when the origins differ).
- `DASHBOARD_BASE_URL` is the app's URL, because marketplace OAuth returns to
  `<DASHBOARD_BASE_URL>/marketplaces/connected`.

Auth uses bearer tokens. The access token is kept in memory and the refresh token in
`localStorage`. Refresh is single-flight across tabs, because the backend treats concurrent reuse of a
refresh token as theft.

## Scripts

| Command | |
|---|---|
| `pnpm dev` | Dev server |
| `pnpm build` | Type-check and production build to `dist/` |
| `pnpm preview` | Serve the production build |
| `pnpm typecheck` | `tsc -b` |
| `pnpm lint` | oxlint |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm e2e` | End-to-end tests (Playwright), see below |
| `pnpm gen:api` | Refresh `src/api/openapi.json` and `src/api/schema.d.ts` from `OPENAPI_URL` (or copy the backend's committed `packages/schemas/jsonschema/openapi.json` and run `openapi-typescript`) |

## Deploying

`pnpm build` outputs a static single-page app in `dist/`. Serve it from any static host or CDN,
for example Cloud Storage behind a load balancer or Cloud Run with nginx. Rewrite unknown paths to
`index.html` so deep links like `/products/<id>` load. Set `VITE_API_ORIGIN` at build time unless
the API shares the app's origin.

## Features

Every working control calls the real API (contract v2.0.0, `src/api/schema.d.ts`). No sample
records, no hardcoded counts: numbers on Home, Inbox and Products are counted from API pages. The
design source is `docs/design-reference/listing-agent-hifi-handoff.html` (18 screens + Autonomy).

| Area | Screens | Backed by |
|---|---|---|
| Public | Landing, sign in (with the login-code, forced enrolment, recovery codes and forced password steps), request access, request status, privacy policy; Continue with Google and its return page `/auth/google` | `/auth/login`, `/auth/login/mfa*`, `/auth/password/expired`, `/signup`, `/signup/status`, `/auth/google/*`, `/signup/google` |
| Security (DPP-1) | Settings > Security: login codes status, set up or replace the authenticator, new recovery codes, change password; the step-up dialog on every sensitive action | `/auth/security`, `/auth/mfa/*`, `/auth/password` |
| Setup (02-04) | Brand and business, compliance defaults, connect marketplaces | `PATCH /tenants/me` (If-Match), `/marketplaces/*` |
| Home and Inbox (05, 06, 11, 16) | Home (first run + working), Inbox, issue detail | `/listings`, `/tasks`, `/issues`, `/issues/{id}/dismiss`, submissions |
| Products and add (07-10, 17) | Products table/cards, product detail tabs, add chooser, guided form, bulk upload, variants and media | `/products`, `/products/bulk`, `/imports/*`, `/jobs/{id}`, `/images/*`, `POST /listings/generate` |
| Listing flow (12-15) | Agent run, review and approve, field mapping, live confirmation | `/jobs/{id}`, `/listings/{id}` (+ `/content`, `/regenerate`, `/preview`, `/history`, `/submissions`, `/status`, `/refresh-status`, `/publish/retry-fields`), `/listings/approve`, `/listings/validate`, `/listings/publish`, `/rules` |
| Marketplaces and settings (18, Autonomy) | Marketplaces, autonomy, brand profile, compliance, team, rules, imports, account, activity, sign-up requests (platform admins) | `/marketplaces/*`, `/tenants/me`, `/brand/documents`, `/members`, `/rules*`, `/admin/signup-requests*` |
| Extras | Listing reports, diagnostics | `/analytics*`, `/readyz` |

Approval is always on (maker-checker): nothing is sent to a marketplace until a person approves it.

### Routes

Public: `/`, `/login`, `/signup`, `/signup/status`, `/privacy`.
Setup frame: `/setup/brand`, `/setup/compliance`, `/setup/marketplaces`.
App: `/home`, `/inbox`, `/issues/$issueId`, `/products`, `/products/$productId`, `/products/new`,
`/add`, `/add/guided`, `/add/bulk`, `/add/variants`, `/runs/$runId`, `/listings/$listingId/review`,
`/listings/$listingId/mapping`, `/listings/$listingId/live`, `/marketplaces`, `/marketplaces/connected`,
`/activity`, `/analytics`, `/about`, `/imports`, `/imports/new`, `/imports/$importId`, `/jobs/$jobId`.
Settings: `/settings`, `/settings/compliance`, `/settings/imports`, `/brand`, `/team`, `/rules`,
`/rules/check`, `/account`, `/settings/security`, `/admin/signups`.

### Sign in with Google

"Continue with Google" on `/login` and "Sign up with Google" on `/signup` show only when
`GET /auth/google/config` answers `enabled: true` (the backend's `GOOGLE_OAUTH_ENABLED`; any other
answer hides them). Both start
the same full-page flow; the intent only picks the copy on the way back.

- Before leaving, the page keeps a random secret in `sessionStorage` (this tab only) and sends only
  the SHA-256 of its base64url text to `/api/v1/auth/google/start`. Google returns to `/auth/google?handle=…`, which strips
  the handle from the address bar, takes the secret out of storage and sends both to
  `POST /auth/google/complete`. No cookies, no Google script, no CSP change.
- Google is a first factor only. A sign-in then runs the same login-code, enrolment, recovery-code and
  password steps as a password sign-in (`SignInSteps`).
- An existing account links Google once, after its Kuinn password and then its login code.
- A Google account with no Kuinn account gets a short sign-up form, prefilled from what the API sends
  (name, verified email, `suggested_brand_name` from a company email domain). An admin still approves it.
- Settings > Security shows a linked Google account; Remove calls `POST /auth/google/unlink` behind a
  step-up, and is not offered while Google is the account's only way in.
- Every refusal reads the same, so the page never says which accounts exist.
- The button follows Google's sign-in branding: the standard multicolour mark on white, Google's
  wording, never recoloured, the 1px `#747775` outline and a medium-weight label.

### Shown but not in the API yet (honest disabled)

These appear where the design puts them, as a disabled control with a reason tooltip
(`UnavailableButton`, reasons in `NOT_YET` in `src/components/la/unavailable.tsx`), a "Coming soon"
tag, or a "Join waitlist" button that does nothing:

- Email verification codes; "What best describes you?" on sign-up
- "Read my site" (website prefill); legal name, business type, logo, description; compliance defaults (can't be saved yet)
- Myntra, AJIO, Meesho, Nykaa Fashion (Join waitlist); pickup locations, default shipping; brand authorisation upload; category/brand approvals
- Add from photos, product page URL, catalog export; PIM/ERP (Later); agent category classification
- Answering, skipping or assigning Inbox questions; "Choose category" and "Ask support" on issues
- Pause, archive, whole-product resubmit, product edit, catalog export
- Autonomous submit and every auto-fix toggle, retry limit, notification channels (Autonomy shows approval mode only)
- Brand-wide activity feed and audit log; notifications bell; top-bar product search

## End-to-end tests

The suite runs against a real backend with its demo seed loaded (`make seed` in the backend
repo). Put these in `.env.local` or the environment:

| Variable | Required | |
|---|---|---|
| `E2E_API_URL` | yes | Backend base URL |
| `E2E_FAKE_MARKETPLACE_URL` | for marketplace and journey specs | The backend's fake Amazon/Flipkart OAuth server (`make fake-marketplace`) |
| `E2E_BACKEND_DIR` | no | Path to a local backend checkout. It resets the local login rate limiter between runs and enables the token-refresh test. |
| `E2E_BASE_URL` | no | App URL, default `http://localhost:5173` |
| `E2E_WORKERS` | no | Default 1, because login is rate limited per user |
| `E2E_PASSWORD` | no | Seed users' password, default `devpassword123` |
| `E2E_RESET_RATE_LIMITS` | no | `0` skips the rate-limit reset |
| `E2E_MFA_SLOW` | no | `1` runs the login-code spec's 10-minute step-up test |

The backend's job worker must be running for the import specs.

`tests/e2e/mfa.spec.ts` (login codes, DPP-1) needs `E2E_BACKEND_DIR`: it creates its own tenant and
users through the backend's staff CLI and never touches the seed users. It probes the API's
`MFA_ENFORCEMENT`: under `off` it checks the plain login still works; under `all` (with
`MFA_GRACE_UNTIL` in the future) it covers forced enrolment, the code step, recovery codes,
step-up, the grace notice, forced password changes and the lockout. The other specs need `off`,
because the seed users have no authenticator. Run it twice, once per mode:

```sh
pnpm e2e tests/e2e/mfa.spec.ts   # backend started with MFA_ENFORCEMENT=all, MFA_GRACE_UNTIL=<future, with offset>
pnpm e2e tests/e2e/mfa.spec.ts   # backend restarted with MFA_ENFORCEMENT=off
```

Sign in with Google has unit tests for every state (`src/features/google/*.test.ts*`). A Playwright
spec needs the backend's fake Google provider (served next to the fake marketplace) and is not
added yet.

## Docs

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): structure, API client, errors, permissions, query
  keys, tables, async jobs, test fixtures.
- [docs/DESIGN.md](docs/DESIGN.md): design system and visual rules.
