# Marketplace OS design system

Calm, precise and finished. Every value below lives in `src/index.css`. Use the tokens and never invent a hex or an
oklch value in a component.

## Surfaces

- `bg-canvas` is the app background and the sidebar.
- The work area is the inset panel (`SidebarInset`): white or `--background`, `rounded-xl`,
  `shadow-elev-2`, 1px ring.
- Cards are `Card` (`shadow-elev-1`, `ring-border`, `rounded-xl`, 20px padding). Never nest cards.
  Inside a card, separate groups with `border-t` and spacing.
- Depth comes from `shadow-elev-1`, `shadow-elev-2` and `shadow-elev-3` (popovers and dialogs) only.
  Never use a zero-offset coloured glow or a hard offset shadow.

## Colour

- `brand` (indigo) is the one accent. It carries the primary button (`Button` default), focus rings,
  the active nav icon, links and selection. Use `bg-brand-soft` for quiet brand tints, such as a
  selected row or an info callout.
- Status uses `Badge` variants `success`, `warning`, `danger`, `brand` and `muted`. Give a status
  badge a leading 6px dot (`<span className="size-1.5 rounded-full bg-current" />`), never an emoji
  or a glyph.
- Text: `text-foreground` for content and `text-muted-foreground` for secondary. Body text never
  goes below 4.5:1 contrast.

## Type

- Geist Variable, tracking `-0.02em` on headings.
- Page title: 26px, semibold, via `PageHeader`. Card title: 15px, semibold.
- Body is 14px. Meta and table headers are 12px.
- Monospace only for identifiers people copy (SKU, seller id, ids, JSON). Never for categories,
  dates or labels.
- Numbers use tabular figures (`tabular-nums`; tables already do).

## Layout

- `Page` gives max-w-6xl and generous padding. `PageHeader` holds the title, one short fact line
  (under ~90 characters) and the actions on the right.
- Show a fact once per screen. Don't repeat the brand name, a count or a date in two places.
- Put a toolbar (search, filters) directly above the table it controls, with result meta on the
  right in muted 12px.
- Detail pages: a main column (2/3) and a side column (1/3) at lg. Use a definition list for
  properties: label in muted 13px on the left and value on the right, with rows separated by
  hairlines.
- Mobile at 390px: no horizontal page scroll. Tables scroll inside their frame. Actions wrap.

## Components and patterns

- Empty states (`EmptyState`) have a raised icon tile, a title, one sentence and one primary action.
- Loading: skeletons shaped like the real content, never a page spinner.
- Integration and marketplace identity uses a drawn lucide icon (`ShoppingBag`, `Store` and so on)
  in a tinted tile. Never use letters, emoji or third-party logos.
- Avatars show initials on `bg-brand-soft text-brand`.
- Relative time ("5 minutes ago") always has the exact time in a tooltip or `title`, inside a
  `<time dateTime>`.

## Motion

- `animate-page-in` on page content: 260ms rise plus fade, transform and opacity only.
- Hover and press transitions run 150ms on colour, background, border and shadow. Never use
  `transition: all`.
- Everything collapses under `prefers-reduced-motion`.

## Copy

Use sentence case and active voice. A button names its action. An error names the problem and the
next step. Loading text ends with "…".
