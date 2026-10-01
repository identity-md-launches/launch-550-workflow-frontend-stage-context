# SevenDay interface design

## Overview

SevenDay is a one-page interface for a Sepolia staking vault. The primary task is staking SEVEN with an explicit seven-day lock. The page introduces that time commitment, shows live vault totals, then groups the staking form beside the connected wallet's position. Swapping and community funding follow below. These are inferred design choices for this implementation, not additional branding supplied by the requester.

The visual character uses warm paper, restrained green, serif display typography, generous spacing and flat panels. A CSS orbit illustration makes the seven-day duration recognizable without a bitmap or external asset. On small screens it yields space to the controls. The implemented source of truth is `web/src/styles.css`; component patterns are in `web/src/App.tsx`.

This document is in `docs/` because the assignment's overriding write budget prohibits a repository-root `DESIGN.md`.

## Colors

The stylesheet uses exact sRGB hex values, with hue primitives and role tokens. It intentionally ships a light theme (`color-scheme: light`), without a theme switch.

| Role | Token/value | Use |
| --- | --- | --- |
| Page | `--color-page: --sage-50`, `#f5f5ee` | Canvas and amount fields |
| Surface | `--color-surface: --paper`, `#fffefa` | Panels, buttons, dialog |
| Primary text | `--color-text: --sage-950`, `#20372b` | Headings, values, labels |
| Secondary text | `--color-muted`, `#596353` | Help, explanations, timestamps |
| Structural line | `--color-line: --sage-200`, `#d9dfcc` | Dividers, input borders |
| Secondary surface | `--color-soft: --sage-100`, `#ebede2` | Segments, quote summary, disabled controls |
| Main action | `--color-accent: --sage-950`, `#20372b` | Primary button and logo |
| Action text | `--color-on-accent: --paper`, `#fffefa` | Text on primary button |
| Illustration | `--color-highlight: --lime-300`, `#d1e6a3` | Seven-day stamp |
| Error | `--color-error: --red-800`, `#8b3127` | Persistent error text |
| Error surface | `--color-error-bg: --red-50`, `#fff0e8` | Transaction and network warnings |
| Keyboard focus | `--color-focus`, `#315daf` | 3px focus perimeter |

The position panel uses `#eef0e5`; success/pending notices use `--lime-100` (`#eaf1d5`). Hero emphasis uses `--sage-500` (`#66705f`). Hovering a primary button uses `--sage-800` (`#344738`). Status copy accompanies color; color alone never identifies success, pending or failure.

Measured rendered pairs are recorded in `frontend-evidence/rendered-checks.json`: body help on the canvas 5.75:1, primary text on the canvas 11.67:1, and primary-button text 12.67:1. These numbers refer to the tested opaque pairs, not a blanket contrast certification of every state.

## Typography

`--font-body` is `Arial, Helvetica, sans-serif`; `--font-display` is `Georgia, 'Times New Roman', serif`. These are system stacks, with no downloaded fonts or network dependency. Exact native font availability varies by host. Body copy uses regular weight; labels and buttons request 600; display headings use 400, with genuine system italic where available for emphasis. No variable-font axes or custom font loading are implemented.

Body size is 1rem with unitless 1.55 line height. Most panel copy is .875rem; help text uses `--text-small: .8125rem`. Eyebrows are .6875rem with .12em tracking and uppercase presentation. Small network badges and decoration are subordinate. Inputs stay at least 1rem on mobile; amount inputs are 1.75rem, reduced to 1.5rem at the narrowest breakpoint. The hero ranges from 3rem to 4.2rem on desktop with 1.08 line height and −.06em tracking; the narrow mobile hero uses a 2.75rem–3.5rem clamp. Section headings use the display family at 1.75rem; the editorial explanation heading reaches 2.6rem. All remain subordinate to the main heading.

Changing balances, APR, inputs and quote values use tabular numerals. Long identifiers remain accessible through a checksummed explorer URL, title and copy control. Prose uses `text-wrap: pretty`, headings use `balance`, and potentially long numbers/identifiers can wrap. Explanatory measures are generally limited to 56–75 characters.

## Layout

`.wrap` has a maximum width of 1184px, centered with 48px desktop gutters. The main grids use a 24px gap; panels start with 32px padding. Related controls use 8–12px spacing and separate sections use 24px or more. Desktop overview statistics occupy three columns. The staking grid is 1.14:1; secondary swap/funding panels are equal columns. Document order matches visual and keyboard reading order.

Breakpoints in `web/src/styles.css`:

- At 68rem: 32px gutters, smaller illustration and 24px panel padding; the duplicate header testnet badge is hidden, while the main live-state line still names Sepolia.
- At 48rem: 20px gutters, navigation wraps below the header, staking and secondary panels stack, and the explanatory section becomes one column.
- At 34rem: the decorative orbit is hidden, stats become horizontal rows, panels use 20px padding and buttons may wrap. The amount, unit and optional Max control remain together.

Observed production-export reflow: 1440, 768, 390 and 320 CSS pixels, with no horizontal page overflow. At 768px, a 200% root font-size test also reflowed without overflow. This was text enlargement, not native browser zoom. No fixed bottom action bar or sticky obstruction is present.

## Elevation & depth

The interface is mainly flat. Panels use a subtle `0 2px 3px #20372b03` shadow and `0 0 0 1px #20372b0d` edge; separators communicate structure. The selected segment adds `0 1px 3px #20372b14`. A modal uses `0 20px 70px #20372b30` and a dark translucent `#14241cc2` native backdrop. No continuous animation or parallax is present.

## Shapes

Panels and dialogs use `--radius: 1.5rem`, reduced to 1.25rem for narrow panels. Buttons use .75rem, amount fields .8rem, and the 12px segment container surrounds an 8px child with 4px padding. Wallet buttons and small badges use pill shapes. The logo and orbital stamp are decorative geometry; their shapes do not introduce additional navigation.

## Components

These are local component patterns, not a published component library:

| Pattern | Source | Behavior |
| --- | --- | --- |
| `Field` | `web/src/App.tsx` | Persistent label, decimal input, token unit, optional Max, described help/error and `aria-invalid` |
| `Stat` | `web/src/App.tsx` | Label, live numeric value, optional token unit and contextual footnote |
| `AddressLink` | `web/src/App.tsx` | Short visible address, full checksum in title/accessibility name, explorer destination and copy feedback |
| `ReviewDialog` | `web/src/App.tsx` | Native modal; consequence before signing; Cancel initially focused; Escape closes; browser manages inert background and focus return |
| `Swap` | `web/src/App.tsx` | Buy/sell toggle, input and slippage, expiring quote, minimum receive, approval steps and persistent error |
| `.segmented` | `web/src/styles.css` | Native buttons with `aria-pressed`; selected surface is visible; these are action toggles rather than ARIA tabs |
| `.primary`, `.wide`, `.button-row` | `web/src/styles.css` | Main staking action, full-width actions and wrapping peer buttons; other actions use neutral surfaces |
| `.notice`, `.warning` | `web/src/styles.css` | Visible status copy, receipt link and confirmation recovery; no disappearing errors |

Loading and stale/unverified-state handling is explicit. Unavailable transaction controls use native disabled state with nearby explanation. Review, simulation, wallet signing, pending receipt, success and error states have distinct text. Fields remain editable outside the native confirmation dialog; transaction handlers verify current state and wallet before signing.

A skip link precedes the header. Focus uses a 3px outline with a 4px offset (2px input offset), with system `Highlight` in forced colors. Controls generally target 44px; compact copy and Max controls remain at least 32px/36px. Button transitions last 120ms and a .96 press scale is enabled only with `prefers-reduced-motion: no-preference`. Reduced-motion tests confirmed zero transition duration.

## Do's and don'ts

Use `.wrap` and the existing panel/grid patterns for a new section. Reuse `Field` for token amounts, and always obtain units and balances from live state. Keep consequence copy near the action and preserve the single primary emphasis in the staking area. Use semantic role tokens for new component styling; do not repurpose a border token as text.

Keep all writes behind network/state eligibility and simulation, including any added action. Never replace unavailable data with illustrative returns or a fabricated USD price. Keep native buttons, labels and dialogs. Do not add external font/image services or animation to reproduce the existing design.

## Attribution

Design review applied the supplied Better Interface guide, adapted from Jakub Krehel at `267330e1adfc66a718fb65fa6918c1f06d0a689e` (MIT). Documentation method is adapted from Paul Bakaus's Impeccable at `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8` (Apache-2.0). Ethereum interaction guidance is adapted from Austin Griffith's ethskills at `06ea4efa08076ff04f6ca4945ef4a2ca881115b0` (MIT). See the adjacent `BETTER-INTERFACE-LICENSE.txt` and `ETH-FRONTEND-UX-LICENSE.txt`. The original guides were supplied as pinned inputs; no live guide was fetched.
