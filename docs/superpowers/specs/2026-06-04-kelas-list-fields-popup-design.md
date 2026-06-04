# Kelas List redesign — two searchable fields + session popup

Date: 2026-06-04
Status: Approved (design)
Area: `web/app/src/pages/sections/KelasListSection.tsx` (List tab of the Kelas page)

## Problem

The Kelas **List** tab currently:

- Always shows **"Kelas Saya"** (my classes) as accordion cards.
- Hides **"Semua Kelas"** (other classes) behind a collapse/expand **dropdown toggle**
  (`showAll` state with a Chevron button).
- Expands each card **inline** to reveal its sessions, grouped by status
  (ongoing / upcoming / missed / completed).

The desired model removes the dropdown, surfaces both groups as always-visible
searchable "fields", and moves session detail into a popup.

## Goals

1. Replace the dropdown mechanism with two always-visible **fields**:
   **My Class** (top) and **Other Class** (below).
2. Each field is a **bounded, independently-scrollable** panel with a **sticky
   search bar** pinned at its top; cards scroll beneath it.
3. Each field has its **own search box** filtering its cards.
4. Clicking a class card opens a **centered modal popup** showing that class's
   sessions grouped into **In Progress · Upcoming · Missed · Done**.

Non-goals: no API/backend changes; no change to `KelasFormDialog`; no change to
the Kalender or Rencana sub-tabs; the `statusOf` bucketing logic is reused as-is.

## Layout

The List tab body becomes a vertical flex (`flex h-full min-h-0 flex-col`) of two
fields, each `flex-1 min-h-0` so they split the available height and scroll
independently:

```
┌─ List tab body (flex-col, min-h-0) ──────────┐
│ [Add Kelas]                      (admin, top) │
│ ┌ MY CLASS (flex-1, min-h-0) ──────────────┐ │
│ │ label + count                            │ │
│ │ [🔍 search my classes...]   ← sticky top │ │
│ │ ┌─────────┐┌─────────┐┌─────────┐  scroll│ │
│ │ │🏫 tile  ││🏫 tile  ││🏫 tile  │  ↕      │ │
│ │ └─────────┘└─────────┘└─────────┘         │ │
│ └──────────────────────────────────────────┘ │
│ ┌ OTHER CLASS (flex-1, min-h-0) ───────────┐ │
│ │ label + count                            │ │
│ │ [🔍 search other classes...] ← sticky top │ │
│ │ ┌─────────┐┌─────────┐  scroll ↕          │ │
│ │ │🏫 tile  ││🏫 tile  │                     │ │
│ └──────────────────────────────────────────┘ │
└───────────────────────────────────────────────┘
```

- Each field: a header row (translated label + count badge), a **sticky** search
  `Input` (`sticky top-0 z-10` with a solid background so cards scroll under it),
  then a responsive **card grid** (`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3`)
  inside an `overflow-y-auto` container.
- The old "Semua Kelas" collapse toggle (`showAll`, Chevron button) is **removed**;
  Other Class is always rendered as its own field.
- "Add Kelas" button (admin only) stays above both fields.
- Per-field empty state ("no classes") and no-match state ("no results for query").

## Card → tile (`KelasCard`)

- The card body (🏫 icon, name, subtitle `tingkat · tahun · wali`, plus a small
  `N sesi` count) becomes a single click target (`<button>` / clickable div) that
  opens the session popup for that class.
- Admin icon buttons (👥 manage members, ✎ edit, 🗑 delete) remain top-right on
  the card. Each handler calls `e.stopPropagation()` so clicking an icon does not
  also open the popup.
- The inline accordion expansion is removed entirely (no `open`/`onToggle`).

## Search

- Each field owns a `useState<string>` search value.
- Filtering is **client-side** over the already-loaded `listKelas({})` result —
  no new query. Match is case-insensitive against **name + guru name + tingkat**.
- `myKelas` / `otherKelas` split is unchanged (`isMine` via `guruUserIds`); the
  search filter applies on top of each split.

## Session popup (`KelasSesiDialog`, new file)

- Built on the existing `Dialog` component (centered modal, overlay) for
  consistency with the rest of the app.
- Props: `{ kelas: Kelas; onClose: () => void }`.
- Header: 🏫 name + subtitle (`tingkat · tahun`, wali if present).
- Lazily fetches `listSesi({ kelasId: kelas.id })` (the same query used today,
  moved into the dialog; runs only while the dialog is open).
- Body groups sessions via the existing `statusOf` + `buckets` logic into four
  groups rendered in order **In Progress (ongoing) · Upcoming · Missed · Done
  (completed)**, each with its colored status dot and a count badge. (Decision:
  keep `missed` as its own group rather than folding/dropping.)
- **Add Sesi** button (admin) lives in the dialog (header action).
- Per-session row actions are lifted verbatim from today's expanded view:
  start, Live link, end, reschedule, edit, delete, and the click-to-review
  summary for ended sessions.
- The nested sub-dialogs (RescheduleSesiDialog, SesiFormDialog,
  EndSesiSummaryDialog) open layered above the popup, as they do today, with the
  same query invalidation (`['kelas-sesi', kelasId]`, `['sesi']`).

## Refactor note

`KelasListSection.tsx` is ~900 lines. The session rows + bucket logic + the
session sub-dialog wiring move out of `KelasCard` into the new `KelasSesiDialog`
file. This shrinks the list file, slims `KelasCard` to a tile, and gives the
popup a single clear home. `KelasFormDialog` and the tingkat-matching helpers
stay where they are.

## i18n

New keys in `en.json` + `id.json`:

- `kelasSection.list.searchMyKelas` — placeholder for the My Class search box.
- `kelasSection.list.searchOtherKelas` — placeholder for the Other Class box.
- `kelasSection.list.noMatch` — no-results state for a field's search.
- Popup title/subtitle keys as needed (reuse `cardSubtitle` / `cardSubtitleWithWali`).

Existing status labels (`kelasSection.status.*`) and all action keys
(`kelasSection.list.*`) are reused unchanged.

## Testing

1. `make typecheck` and `make test`.
2. Rebuild the `gnrs` container (`docker-compose up -d --build`) per operator
   preference; smoke-test `GET /healthz`.
3. Chrome DevTools flow (TEST.md) against the running app:
   - Both fields render; each scrolls independently; the search bar stays
     pinned (sticky) while cards scroll.
   - Typing in My Class search filters only My Class cards; same for Other Class.
   - No-match state appears for a query with no results.
   - Clicking a card opens the centered popup; the four buckets render with
     correct counts.
   - Admin card icons (members / edit / delete) work and do **not** open the
     popup.
   - Inside the popup, Add Sesi + per-session actions (start, Live, end,
     reschedule, edit, delete, review) all work and refresh correctly.
   - Mobile width: fields stack and stay usable; grid collapses to one column.
