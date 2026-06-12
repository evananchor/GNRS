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

## Changes

### Backend

- `internal/handler/laporan.go` — `laporanItem` gains
  `KelompokMateri string \`json:"kelompokMateri,omitempty"\``,
  populated (trimmed, nil → "") from the materi row in the existing
  tema-grouping loop. No migration; the store already loads the column.
- `internal/handler/laporan_xlsx.go` — Kurikulum sheet gains a
  "Kelompok" column between Sub-Tema and Materi (adjust widths).

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
  if needed). Status-count labels reuse existing keys. id/en parity.

## Out of scope

- The Library section of the report (small; stays flat).
- Refactoring the Curriculum tab or extracting a shared tree component.
  Only the pure grouping helper may be shared if it extracts trivially;
  the two render paths stay separate.
- Any change to endpoint shape beyond the one additive field.

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
