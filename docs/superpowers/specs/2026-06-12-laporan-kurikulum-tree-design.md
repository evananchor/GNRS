# Laporan Rapor — Interactive Curriculum Tree (tema → sub-tema → kelompok)

**Date:** 2026-06-12
**Status:** Approved (brainstormed with operator)
**Builds on:** `2026-06-10-laporan-rapor-design.md` (PR #8, merged `d0f8ca3`)

## Problem

The Laporan Rapor curriculum section renders every materi flat under its
tema. With umur-scoping unavailable (murid has no resolvable level) the
report shows the full curriculum — ~2,400 rows on screen at once. The
operator wants the section interactive: grouped by tema → sub-tema →
kelompok materi, collapsed by default, so the report doesn't dump every
materi immediately.

## Decisions (from brainstorm)

1. **Print = WYSIWYG.** Printing renders exactly what is expanded on
   screen. Collapsed group headers still print as one-line summaries
   (label + counts). Operator explicitly chose this over
   "always print everything".
2. **Default open = changed-in-period.** On load, every group that
   contains at least one `changedInPeriod` item starts expanded down to
   the materi level; all other groups start collapsed. Open state resets
   when the murid/period (i.e. the report data) changes.
3. **Excel stays complete.** The xlsx export is a data export, not a
   view; collapse state never affects it.
4. **Missing levels fall through.** Items with empty `subTema` list
   directly under the tema; items with a sub-tema but empty
   `kelompokMateri` list directly under the sub-tema — the same idiom
   the Curriculum tab uses (`flat` buckets).
5. **Custom letterhead in Settings.** The report "kop" is editable from
   the existing Instansi settings (Pengaturan → Instansi): institution
   name (exists), logo (exists), plus new **address** and **report
   title line** (e.g. "LAPORAN HASIL BELAJAR"). One shared letterhead,
   used by every report. Operator chose this over a per-report free-text
   header.
6. **Slim running header on page 2+.** Page 1 prints the full kop
   (logo + name + address + title + period). Pages 2 and beyond print a
   thin running line (murid name · periode) so the reader keeps context
   across pages. The full kop does NOT repeat.

## Changes

### Backend

- `internal/handler/laporan.go` — `laporanItem` gains
  `KelompokMateri string \`json:"kelompokMateri,omitempty"\``,
  populated (trimmed, nil → "") from the materi row in the existing
  tema-grouping loop. No migration; the store already loads the column.
- `internal/handler/laporan_xlsx.go` — Kurikulum sheet gains a
  "Kelompok" column between Sub-Tema and Materi (adjust widths).
- `internal/handler/laporan.go` (instansiMap) — read two more settings
  keys and add them to the `instansi` block: `instansi_alamat` →
  `alamat`, `instansi_title` → `title`. Best-effort, empty string on
  missing/err (same pattern as `instansi_name`/`instansi_logo`). The
  settings store is generic key/value with no allowlist, so no
  schema/handler change is needed for the new keys.

### Frontend

- `web/app/src/api/laporan.ts` — item type gains
  `kelompokMateri?: string`.
- `web/app/src/components/LaporanRapor.tsx` — replace the flat per-tema
  table body with a three-level collapsible tree:
  - **Grouping:** per tema, group items by `subTema` preserving
    first-seen order, then within each sub-tema by `kelompokMateri`
    (same order rule). Ungrouped items render first at their level as a
    flat list. Pure function, unit-testable, O(n).
  - **Open state:** three `Set<string>` states keyed
    `tema`, `tema::sub`, `tema::sub::kelompok`. A `useEffect` keyed on
    the report data seeds them with every key on the path to a
    `changedInPeriod` item, and clears the rest.
  - **Header rows:** always rendered (so they print when collapsed).
    Show group label, counts (tuntas / proses / belum), a `●` count of
    changed-in-period items when > 0, and a slim progress bar matching
    the Curriculum tab. Chevron icon is `print:hidden`.
  - **Children:** conditionally rendered (not in DOM when collapsed) —
    this is what makes print WYSIWYG with zero print-CSS work, and
    shrinks the DOM for large curricula.
  - **Controls:** "Buka semua" / "Tutup semua" text buttons above the
    section, `print:hidden`, so the operator can one-click a complete
    printout.
- `web/app/src/locales/{id,en}.json` — new keys under
  `achievement.laporan.*`: `bukaSemua`, `tutupSemua` (and a count label
  if needed). New keys under `instansi.*` for the two new settings
  fields (`alamatLabel`, `alamatHint`, `reportTitleLabel`,
  `reportTitleHint`). Status-count labels reuse existing keys. id/en
  parity.

### Letterhead (custom kop) in Settings

- `web/app/src/pages/sections/InstansiSection.tsx` — add two inputs to
  the existing form and include them in the single batch
  `updateSettings` call:
  - **Alamat** (`instansi_alamat`) — multiline textarea, free text.
  - **Judul laporan** (`instansi_title`) — single-line text, the title
    line printed on the report kop. Empty → kop simply omits the title
    line.
  No new API client work: `getSettings`/`updateSettings` already pass
  arbitrary keys.

### Report kop + print pagination

- `web/app/src/components/LaporanRapor.tsx` — kop renders, in order:
  logo, `GNRS {instansi.name}`, `instansi.alamat` (small, muted, only
  if present), then `instansi.title` (only if present) and the period
  label + date range. Existing layout otherwise unchanged.
- **Slim running header**: a `.laporan-running-head` element (murid name
  · periode) that is `display:none` on screen and `position: fixed;
  top: 0` only under `@media print`. Use the opaque-cover technique so
  it does not double up on page 1: the in-flow full kop has a solid
  white background and sits above the fixed running head on page 1;
  on pages 2+ (no in-flow kop) only the running head shows. Reserve top
  space on continued pages via `@page { margin-top }` / content padding
  so body text never slides under the fixed line.
- Page numbers are left to the browser's own print footer (the 🖨 Print
  button calls `window.print()`, and Chrome's CSS `counter(page)` is not
  available outside page-margin boxes). The running header carries
  context (name · periode), not a page count. Document this in the PR so
  it is a known, intentional limitation, and tune the exact print CSS
  during the browser test pass (print preview is part of the loop).
- New print CSS lives in `web/app/src/index.css` next to the existing
  `#laporan-print-area` rules.

## Out of scope

- The Library section of the report (small; stays flat).
- Refactoring the Curriculum tab or extracting a shared tree component.
  Only the pure grouping helper may be shared if it extracts trivially;
  the two render paths stay separate.
- Any change to endpoint shape beyond additive fields (`kelompokMateri`
  on items; `alamat` + `title` inside the existing `instansi` object).
- Per-report free-text header override (rejected in favor of the shared
  Settings letterhead). Printed page numbers via CSS (left to the
  browser print footer).

## Edge cases

- Group keys are composed with `::`; tema/sub/kelompok values are used
  verbatim (collisions across different parents are impossible because
  keys include the full path).
- Empty curriculum (`kurikulum: []`) keeps the existing "no data" row.
- Counts on a tema header include all descendant items regardless of
  grouping bucket.
- Excel column addition must keep the existing header-style range and
  freeze panes intact.

## Testing

- `make test` + `make typecheck` (Go build via `golang:1.25-alpine`
  container if no local Go).
- Backend: extend the laporan handler/store coverage to assert
  `kelompokMateri` round-trips into the JSON item.
- Browser pass on the rebuilt `:8300` container:
  - Reports tab → groups render collapsed except changed-in-period
    paths; counts and `●` markers visible on collapsed headers.
  - Expand/collapse at each of the three levels; Buka/Tutup semua.
  - Print preview: collapsed groups appear as single header lines;
    expanded groups print in full; chevrons/controls hidden.
  - Excel download still valid, Kurikulum sheet has the new Kelompok
    column.
  - Switching murid/period resets the open state to the new
    changed-in-period default.
  - Pengaturan → Instansi: set Alamat + Judul laporan, save, reload the
    report → kop shows the new address and title line.
  - Print preview of a multi-page report: page 1 has the full kop;
    pages 2+ show only the slim running header (murid · periode), no
    full-kop repeat and no double header on page 1.
