# Kuinn brand theme

The brand as it is applied today, in one place. Values live in CSS custom properties; this page says
when to use each one. The typed reference is `src/brand/theme.ts`; `src/brand/brand-theme.test.ts`
fails if it drifts from the stylesheets.

| Layer | File | Used by |
|---|---|---|
| Product kit (matte light theme) | `src/index.css` `:root` | every app screen and the landing |
| Marketing layer (night bands, marquee, spotlight) | `src/styles/landing.css` | public pages only |
| Typed reference | `src/brand/theme.ts` | docs, tests, any JS that needs a value |

Components use the Tailwind names (`bg-canvas`, `text-ink-2`, `bg-night`, `text-brand-on-night`,
`rounded-panel` …), never a raw hex.

## Colour

| Role | Token | Value | Use |
|---|---|---|---|
| Canvas | `--canvas` | `#edf0f5` | page background |
| Surface | `--surface` | `#fbfcfd` | cards, raised panels |
| Ink | `--ink` / `--ink-2` / `--ink-3` | `#1b2238` / `#4a5573` / `#586280` | headings and body / secondary / captions |
| Brand (Kuinn indigo) | `--brand` | `#2f46d6` | primary buttons, links, active state, the accent phrase |
| Brand tint | `--brand-bg` / `--brand-line` / `--brand-ink` | `#e7ebfb` / `#b9c4f2` / `#1b2a8a` | chips, icon tiles, selected tabs |
| Success / attention / danger | `--success` `--attention` `--danger` (+ `-bg`, `-line`, `-ink`) | | status only, never decoration |
| Night | `--night` → `--night-2` | `#0b1028` → `#121a3d` | dark marketing bands (Why Kuinn, final CTA) |
| Night text | `--night-ink` / `--night-ink-2` | `#eef0fa` / `#a9b1d3` | text on night |
| Brand on night | `--brand-on-night` | `#8f9cff` | the accent phrase and marks on night (≥ 4.5:1) |
| Floor | `--floor` | `#070a1a` | the footer |

Night is the brand indigo taken almost to black, so a dark band still reads as Kuinn.

## Type

- Display: **Bricolage Grotesque** (variable, optical sizing), weight 700 to 800. Tracking tightens as
  size grows: about −0.035em on section titles, −0.04em on the hero and final CTA.
- UI and body: **DM Sans** (variable, optical sizing). Body 17 to 19px on the landing, line height 1.6.
- Eyebrow: 13px, weight 700, uppercase, +0.12em (`eyebrow` utility), in brand indigo (danger red on
  the problem band).
- Landing scale (`TYPE` in theme.ts): hero `clamp(2.6rem, 3.1vw + 1.4rem, 5rem)`, section titles
  `clamp(2rem, 2.4vw + 1.1rem, 3.5rem)`.

## Shape and depth

- Radii: control 8px, card 12px, stage 24px, panel 28px, pill.
- Elevation is matte: light from the top left, a soft shade down right, a hairline edge on every
  surface (`shadow-card`, `shadow-raised-md`, `shadow-raised-lg`). On night bands buttons drop the
  light highlight (`shadow-none`).
- One glow per band at most, under 20% opacity. The `edge-gradient` 1px edge marks the one card that
  leads a section.

## Motion

- Calm, no bounce: `--ease-out-calm`, reveals 320 to 440ms, 60ms stagger. Only transform and
  opacity move.
- Loops (marquee 48s, workflow connectors, slider auto-advance) pause on hover or focus and stop for
  reduced motion, where everything shows at once.

## Landing page rules

- **Copy** lives in `src/features/public/landing-content.ts`, in page order.
- **Numbers** are counted from the product, never a customer outcome: 235 rules (backend
  `rules.seed.json`), 88 attributes (`attribute_definitions`), 8 categories, 3 fix attempts
  (`llm_max_correction_attempts`). Update them there when the catalog grows. Revenue or time-saved
  figures can go in once they are measured with a customer who agrees to be quoted.
- **Customer logos**: only brands that use Kuinn and agreed to be named, in `TRUSTED_BRANDS`
  (logo files in `public/landing/brands`). Until then the band names the marketplaces Kuinn is
  built for.
- **Marketplace status** is always the honest one (`MARKET_STATUS` in `model.ts`): Amazon live,
  Flipkart next, the rest on the roadmap.
- **Amazon developer website rules**: every public page keeps the company name, a direct contact and
  a pricing note (the final CTA, `#pricing`, and the FAQ's pricing answer).
- **No em or en dashes** in public copy (tested).
