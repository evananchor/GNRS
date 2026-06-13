# Achievement Scores (nilai) in Curriculum tab + Report

**Date:** 2026-06-13 · **Status:** Approved · **Track:** gnrs-evan

Add a numeric **score (nilai 0–100) + auto letter grade** to per-materi achievement, shown
alongside the existing completion %. The data model already has `pencapaian.nilai_angka`
(INTEGER, validated 0–100) + `nilai_huruf` (TEXT); the upsert handler/store/API client all
already accept them. So this is **surface + capture**, not a schema change.

## Rubric (angka → huruf)
`<60` → **Kurang**, `60–74` → **Cukup**, `75–89` → **Baik**, `≥90` → **Amat Baik**.
Shared helper `web/app/src/lib/nilai.ts` → `hurufFromAngka(n: number): string`.

## 1. Curriculum tab input (`Achievement.tsx`, the per-materi `PencapaianRow` cell)
- Next to the status cycle, add a small **number input (0–100)** prefilled from
  `row.pencapaian?.nilaiAngka`. On commit (blur/Enter), `upsertPencapaian({ muridUserId,
  materiAjarId, status: <current status>, nilaiAngka: n, nilaiHuruf: hurufFromAngka(n),
  tanggal })`. Empty input → clear nilai (send `nilaiAngka: null`).
- Show the letter grade badge (huruf) next to the input when set.
- Only when `canEdit`. Invalidate `['pencapaian', muridUserId]` on success (existing pattern).

## 2. Report — backend (`internal/handler/laporan.go`)
- `laporanItem`: add `NilaiAngka *int \`json:"nilaiAngka,omitempty"\`` + `NilaiHuruf string \`json:"nilaiHuruf,omitempty"\``, populated from `it.Pencapaian` (nil-safe).
- `laporanRingkasan`: add `RataNilai *float64 \`json:"rataNilai,omitempty"\`` = average of non-nil `nilaiAngka` across kurikulum items (nil when none scored). Round to 1 dp at render.

## 3. Report — frontend (`api/laporan.ts` + `LaporanRapor.tsx`)
- `LaporanItem` type: add `nilaiAngka?: number | null`, `nilaiHuruf?: string | null`.
- `LaporanResponse.ringkasan`: add `rataNilai?: number | null`.
- `LaporanRapor.tsx`: in each curriculum item row, show the nilai (`{angka} ({huruf})`) when present, beside the status chip. In the ringkasan line, show **Rata-rata nilai: {rataNilai}** alongside the existing `% tuntas`.

## i18n (id+en)
`achievement.nilai.label` ("Nilai"/"Score"), `achievement.laporan.rataNilai` ("Rata-rata nilai"/"Average score"), `achievement.laporan.nilaiCol` ("Nilai"/"Score"). Parity.

## Out of scope
Library (non-kurikulum) scoring; persisting huruf rubric server-side (huruf computed client-side on input, stored verbatim). Score input at end-of-sesi (operator chose Curriculum-tab only).

## Testing
typecheck + go test (container); rebuild :8300; browser: set a nilai on a materi in Curriculum (huruf badge appears, % unchanged); open Report → per-materi nilai + Rata-rata nilai shown.

## Commit plan (one PR)
1. backend: laporan item nilai + ringkasan rataNilai (+ api/laporan.ts types)
2. frontend: rubric helper + Curriculum nilai input (+ i18n)
3. frontend: LaporanRapor nilai display + average (+ i18n)
