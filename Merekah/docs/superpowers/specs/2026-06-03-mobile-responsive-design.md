# Mobile-Responsive Layout — Design Spec

**Date:** 2026-06-03
**Topic:** Make the Merekah web app responsive to mobile view
**Status:** Approved (design), pending implementation plan

## Goal

The app's frontend (`internal/web/app`) currently assumes a desktop viewport: the
shell is a fixed two-column grid with an always-on 250px sidebar. On a 375px phone
that sidebar leaves ~125px for content, which is unusable.

Make the app usable on phones (target 375×812) and small tablets, **without changing
the desktop appearance at all**. Every change is additive, gated behind Tailwind's
`md` breakpoint (768px). Desktop (≥768px) must remain byte-for-byte identical — the
same discipline the dark-mode work used to keep light mode unchanged.

## Decisions (locked)

- **Mobile navigation pattern:** bottom tab bar (native-app style), chosen over a
  slide-in drawer and an icon-only rail.
- **Breakpoint:** `md` (768px) is the switch. `< md` → bottom nav + mobile header;
  `≥ md` → today's sidebar layout, untouched.
- **Profile + logout on mobile:** the sidebar footer (profile/logout) is hidden on
  mobile; an avatar button in the header opens a small popover menu carrying name,
  role, and "Log out".

## Non-goals (YAGNI)

- No wiring up the header search input (it is presentational today; stays
  `hidden md:flex`).
- No new navigation destinations, no responsive data tables beyond the two targeted
  polish spots below.
- No desktop redesign. No change to routing, data fetching, or the theme system.

## Breakpoint strategy

| Viewport | Sidebar | Bottom nav | Header variant |
|----------|---------|-----------|----------------|
| `< md` (phones, small tablets portrait) | hidden | shown | mobile (logo + title, avatar menu, status dot) |
| `≥ md` | shown (today's) | hidden | desktop (today's) — unchanged |

All edits are additive `md:` variants or new `md:hidden` elements. No existing
desktop class is removed.

## Components

### 1. Layout shell — `src/components/Layout.tsx` (modify)

- Outer container: `grid-cols-[250px_1fr]` → `grid-cols-1 md:grid-cols-[250px_1fr]`.
- `<aside>` sidebar: add `hidden md:flex` (unchanged when visible).
- `<main>` inner wrapper padding: `px-[26px]` → `px-4 md:px-[26px]`.
- `<main>` scroll area: bottom padding `pb-16` → `pb-24 md:pb-16` so content clears
  the fixed bottom bar.
- Render `<BottomNav />` (new) once, inside the main column; it self-hides at `md`.

### 2. Mobile header (same `<header>`, responsive children)

Approved layout: `🌸 Dashboard … ◐ 🔔 👤`.

- **Left:** small flower logo wrapped in `md:hidden` (desktop shows it in the
  sidebar) + the existing page `title`.
- **Search box:** already `hidden md:flex` — no change.
- **Live/Offline pill:** the text label becomes `hidden md:inline` so on mobile only
  the colored status dot shows; full pill remains on desktop.
- **Theme toggle + notifications bell:** unchanged, visible on all sizes.
- **Avatar menu (`<UserMenu />`, new):** appended to the header, `md:hidden`.
- Header horizontal padding: `px-5` → `px-4 md:px-5`.

### 3. `BottomNav` — new, mobile-only

- Location: a small component co-located in `Layout.tsx` (it shares the existing
  `NAV` array — single source of truth, no duplication).
- Markup: `<nav>` with `fixed bottom-0 inset-x-0 z-20 md:hidden`, surface background
  (`bg-surface`), top border (`border-t border-line`).
- Five `NavLink`s from `NAV` (Dashboard · Projects · Composer · Clients · Analytics),
  each a vertical icon + `text-meta` label, distributed evenly (`grid grid-cols-5`).
- Active state via `NavLink`'s `isActive` → brand color (`text-brand-ink`); inactive
  `text-ink-muted`.
- iOS safe area: `paddingTop` via `pt-2`; `paddingBottom` via inline style
  `{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))' }` so the bar clears
  the home indicator. (Inline style is used rather than a Tailwind arbitrary value to
  avoid `env()`/`calc()` parsing edge cases.)
- Touch targets ≥ 44px tall.

### 4. `UserMenu` — new, mobile-only (header avatar popover)

- Purpose: replaces the sidebar footer's profile/logout on mobile.
- Trigger: `Avatar` button (reuses existing `Avatar` from `ui.tsx`).
- Popover content: user name, capitalized role, and a "Log out" button calling
  `useAuth().logout`.
- Behavior: toggles open/closed; closes on outside-click and on `Escape`; trigger has
  `aria-haspopup="menu"` + `aria-expanded`; focus returns to the trigger on close.
- Location: its own file `src/components/UserMenu.tsx` — it owns interactive state
  (open/close, outside-click, Escape), enough behavior to isolate and test
  independently. (`BottomNav`, being stateless and NAV-coupled, stays co-located in
  `Layout.tsx`.)
- Desktop unaffected — sidebar footer still renders the profile/logout at `≥ md`.

### 5. Per-page polish

Most pages already use responsive grids and only need a visual pass once the sidebar
is gone. Two spots get squeezed at ~343px content width:

- **`src/pages/Dashboard.tsx` — Project progress rows:** the progress bar wrapper
  `w-[160px]` → `w-20 sm:w-[160px]` so the truncating project name keeps breathing room.
- **`src/pages/Analytics.tsx` — "Audience by platform":** the `flex items-center gap-4`
  (180px pie + legend) stacks vertically below `sm` (`flex-col sm:flex-row`,
  `items-start sm:items-center`) so the legend has full width on phones.

Verified already-responsive (no change needed): stat grids (`grid-cols-2 lg:grid-cols-4`),
Clients cards (`sm:grid-cols-2 xl:grid-cols-3`), Composer/Dashboard two-column
(`lg:grid-cols-…`), Login (`max-w-[400px]`), Projects board (intentional
`overflow-x-auto` horizontal scroll).

### 6. iOS safe areas — `index.html` (modify)

- Viewport meta `width=device-width, initial-scale=1` →
  `width=device-width, initial-scale=1, viewport-fit=cover` so `env(safe-area-inset-*)`
  resolves under the notch/home indicator.

## Data flow

No change. Navigation continues through `react-router-dom` `NavLink`s; the bottom nav
and sidebar both read the same static `NAV` array. `UserMenu` consumes the existing
`useAuth()` context. No new state crosses component boundaries beyond `UserMenu`'s
local open/closed boolean.

## Accessibility

- Bottom nav links keep visible focus (global `:focus-visible` ring) and ≥44px targets.
- `UserMenu`: `aria-haspopup`, `aria-expanded`, Escape-to-close, outside-click close,
  focus restoration.
- Status dot on mobile keeps an accessible name (retain the text in the DOM via
  `sr-only` if the visible label is hidden, so screen readers still announce
  Live/Offline).
- Active tab conveyed by color **and** `aria-current` (NavLink default).

## Testing / verification

1. `tsc --noEmit` → 0 errors; `vite build` succeeds.
2. Drive the running app with the gstack headless browser:
   - **375×812 (iPhone):** no horizontal scroll on any page; bottom nav navigates and
     shows active state; avatar menu opens, logs out; status dot visible; content not
     hidden behind the bar (including safe-area).
   - **768px (boundary):** sidebar reappears, bottom nav gone, desktop header restored.
   - **≥768px:** spot-check Dashboard/Analytics/Projects/Clients/Composer/Login match
     pre-change desktop appearance.
3. Confirm both light and dark themes on mobile.

## Touched files

- Modify: `src/components/Layout.tsx` (incl. co-located `BottomNav`),
  `src/pages/Dashboard.tsx`, `src/pages/Analytics.tsx`, `index.html`
- New file: `src/components/UserMenu.tsx`
- Desktop visual change: none
