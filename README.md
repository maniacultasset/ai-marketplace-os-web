# AI Marketplace OS — web

The dashboard for AI Marketplace OS. A brand's team manages its product catalog, bulk CSV imports,
Amazon and Flipkart seller connections, marketplace listing rules, and team access.

Every screen reads from and writes to the backend API
([maniacultasset/ai-marketplace-os](https://github.com/maniacultasset/ai-marketplace-os)). There is no
mock layer and no demo data in the app.

## Stack

- Vite, React 19, TypeScript (strict)
- TanStack Router (file routes), TanStack Query, TanStack Table
- `openapi-fetch` with types generated from the backend's OpenAPI document
- react-hook-form and zod (limits mirror the backend; 422 details map onto fields)
- shadcn/ui on Radix, Tailwind CSS v4, Geist (bundled), light and dark themes
- Vitest (unit) and Playwright (end to end, against a real backend)

## Getting started

Requires Node 24+ and pnpm (`corepack enable`).

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
| `pnpm gen:api` | Refresh `src/api/openapi.json` and `src/api/schema.d.ts` from `OPENAPI_URL` |

## Deploying

`pnpm build` outputs a static single-page app in `dist/`. Serve it from any static host or CDN,
for example Cloud Storage behind a load balancer or Cloud Run with nginx. Rewrite unknown paths to
`index.html` so deep links like `/products/<id>` load. Set `VITE_API_ORIGIN` at build time unless
the API shares the app's origin.

## Features

The screens cover the endpoints in the committed API contract (`src/api/openapi.json`). Areas
without a screen stay out of the nav; their flags live in `src/api/capabilities.ts`.

| Area | Status |
|---|---|
| Sign in, session, brand switch | Live |
| Products: list, create, detail | Live |
| CSV import: upload, job progress, row report, retry failed rows | Live |
| Marketplace connections: Amazon and Flipkart OAuth, history, revoke | Live |
| Rules: list, filters, dry-run check of a draft | Live |
| Team: roles and active status; account | Live |
| Brand profile and documents | No screen yet |
| Images | No screen yet |
| Listing generation, review and approval, publishing | No screen yet |
| Analytics | No screen yet |

To add one once its endpoints are live on the backend:

1. Run `OPENAPI_URL=<backend>/openapi.json pnpm gen:api`. `pnpm typecheck` then flags every call
   site whose shape changed.
2. Build the screens under `src/routes/_app/` and `src/features/<name>/`.
3. Flip the capability in `src/api/capabilities.ts` and add its nav entry in `src/lib/nav.ts`.

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

The backend's job worker must be running for the import specs.

## Docs

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): structure, API client, errors, permissions, query
  keys, tables, async jobs, test fixtures.
- [docs/DESIGN.md](docs/DESIGN.md): design system and visual rules.
