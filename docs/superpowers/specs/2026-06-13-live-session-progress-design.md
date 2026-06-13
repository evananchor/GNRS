# Live-stage Session-End & Progress (B + C + D)

**Date:** 2026-06-13
**Status:** Approved (brainstormed with operator)
**Track:** gnrs-evan

Three related improvements to the live-stage flow. The data model already
supports most of this (`sesi_materi_diajarkan.completed`, `ref` range encoding,
and a `DELETE …/diajarkan/{itemId}` endpoint all exist).

## C — Done vs not-done signs + removable (`EndSesiSummaryDialog.tsx`)

Each taught-materi row currently shows no completion status and can't be removed.

- **Status sign** per row from `it.completed`: `✓ Selesai` (emerald) vs
  `○ Belum selesai` (amber).
- **Remove** button on **not-completed** rows → `deleteDiajarkan(sesiId, it.id)`
  (endpoint exists) + invalidate `['diajarkan', sesiId]`. Inline confirm.
  Effect (per decision): the item is dropped from the sesi record and therefore
  from the WhatsApp summary.
- Summary text annotates any remaining not-completed item with
  `(belum selesai)` so the recap is honest.

## D — Confirm/edit session duration (`EndSesiSummaryDialog.tsx`)

Duration is auto-computed by `fmtDuration(startedAt, endedAt)` and only shown.

- Add an editable **Durasi (menit)** number input, defaulting to the computed
  minutes. The summary uses the (possibly edited) value.
- **No schema change / not persisted** — this confirms/adjusts the figure for
  the summary only (operator confirmed display-only is fine).

## B — Confirm start→end on mark-done (`LiveSesi.tsx` + small backend)

The stage "Selesai" button calls `markComplete.mutate(current.id)` →
`updateDiajarkan(id, {completed:true})`. For progressable kinds it should first
confirm the range covered.

- On "Selesai", if `current.kind` ∈ {`quran`,`hadits`,`tilawati`}: open a small
  **dari–sampai** confirm dialog, pre-filled by parsing the item's current
  `ref` (auto from what's queued/shown on stage), editable.
  - Quran `ref` = `"surah"` | `"surah:ayat"` | `"surah:from-to"` → prefill
    from/to (whole-surah → from `1`).
  - Tilawati `ref` = `"jilid/halaman"` → prefill halaman as the point reached.
  - Hadits → free dari–sampai text.
  - On confirm → `updateDiajarkan(id, {completed:true, ref:"<surah>:<from>-<to>"})`.
- Non-progressable kinds (`kurikulum`,`doa`) keep the current one-click complete.

### Backend tweak (B)
`updateDiajarkan` must accept `ref`:
- `internal/handler/diajarkan.go` `diajarkanUpdateBody`: add `Ref *string \`json:"ref,omitempty"\`` and pass `Ref: trimPtr(b.Ref)` into `store.MateriDiajarkanUpdate` (store struct already has `Ref`; verify `Update` applies it — add to the SET builder if missing).
- `web/app/src/api/diajarkan.ts` `MateriDiajarkanUpdate`: add `ref?: string | null`.

## Out of scope
- Persisting an edited duration to the sesi (display-only for now).
- PPT/Video library (separate, queued).
- Reading live DOM scroll position for B (we prefill from the item's `ref`, which already reflects what's shown — reliable, no fragile DOM reads).

## Testing
- `make typecheck` + `go test ./internal/...` (container).
- Rebuild `:8300`; browser pass:
  - End dialog shows ✓/○ signs; removing a not-done item drops it from the list + summary.
  - Editable duration flows into the summary text.
  - (B) marking a Quran item done prompts dari–sampai prefilled from ref, editable; saved into ref; non-progressable kinds skip the prompt. (If a live sesi can't be driven this session, verify the dialog component + API in isolation and say so in the PR.)

## Commit plan (one PR, step commits)
1. backend: diajarkan update accepts `ref` (+ API type)
2. C: done/not-done signs + remove button + summary annotation
3. D: editable duration
4. B: mark-done range confirm dialog + wire into LiveSesi
