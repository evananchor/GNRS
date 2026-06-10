# Design — Per-Murid Report Templates (Laporan Bulanan & Semester)

Date: 2026-06-10
Track: `gnrs-evan`
Branch: `feat/laporan-rapor`

## 1. Summary

Add a **Laporan** tab to the Achievement menu that produces a per-murid report
("rapor") for a chosen period — **monthly** (pick month) or **semester 1 / 2**
(derived from the active tahun_ajaran's `semester1_start_month` /
`semester2_start_month`). The report renders as a **print-ready page**
(browser print → PDF) and downloads as a real **Excel file (.xlsx)**, both fed
by one new backend aggregation endpoint so the two outputs can never drift.

## 2. Decisions (from brainstorming)

| # | Decision |
|---|----------|
| Output | **Print page + .xlsx download** (no server PDF, no WhatsApp in v1). |
| Scope | **Per murid** (one report per student). |
| Content | **Full rapor**: identity, kehadiran recap, kurikulum pencapaian by tema, library pencapaian. |
| Periods | Bulanan (any month) · Semester 1 · Semester 2 (per tahun_ajaran). |
| Architecture | One aggregation endpoint; `?format=xlsx` reuses the same assembly (excelize already in go.mod). |
| Period highlight | Reports show the murid's **full current standing**; items whose status changed **within the period** get a ● marker. |

### Non-goals (v1)
- Per-kelas batch reports, WhatsApp sending, server-side PDF, scheduled emails.
- New DB tables/migrations — read-only aggregation over existing data.
- Grades/scores — GNRS tracks status (belum/proses/tuntas), not numeric grades.

## 3. Backend

### Endpoint

`GET /api/laporan/murid/{id}?from=YYYY-MM-DD&to=YYYY-MM-DD[&format=xlsx]`
— registered in the authenticated group (`p`), like other reads.

**Authorization** (mirrors existing per-resource patterns): role `murid` may
only request their own id (`claims.UserID == id`); all other authenticated
roles may request any murid. 403 otherwise.

**Period resolution is frontend's job** — the API only takes `from`/`to`
dates, so "bulanan" vs "semester" is purely a UI concept (keeps the endpoint
dumb and testable).

### Response (JSON)

```jsonc
{
  "murid":   { "id", "name", "nickname", "userCode", "level", "kelompok" },
  "kelas":   { "id", "nama", "tingkat", "tahun", "waliName" } | null,   // murid's kelas (kelas_anggota), if any
  "instansi":{ "name", "logo" },                                         // from settings (instansi_name / instansi_logo)
  "periode": { "from", "to" },
  "kehadiran": { "hadir", "izinMurid", "izinGuru", "byVn", "alfa", "total", "pctHadir" }, // attendances WHERE student_id AND date BETWEEN
  "kurikulum": [                                                         // grouped by tema, scoped to murid's (umur, semester) tier — same scoping the Kurikulum tab uses
    { "tema": "ALIM", "items": [
        { "materi": "…", "status": "tuntas|proses|belum", "changedInPeriod": true|false, "tanggal": "…" }
    ]}
  ],
  "library": [                                                           // from pencapaian library rows (kind quran/hadits/tilawati/doa)
    { "kind": "quran", "aspect": "memorizing", "ref": "…", "label": "…", "status": "…", "changedInPeriod": bool }
  ],
  "ringkasan": { "tuntas", "proses", "belum", "pctTuntas" }
}
```

`changedInPeriod` = the pencapaian row's `tanggal` (fallback `updated_at`)
falls inside `[from, to]`.

### Implementation

- New `internal/handler/laporan.go` — assembles from existing stores
  (`users`, `kelas`, `attendances`, `pencapaian`, `kurikulum`, `settings`);
  add small store query helpers only where an existing one doesn't fit
  (e.g. attendance counts per status for one student+range).
- `format=xlsx` → build workbook with **excelize** (`github.com/xuri/excelize/v2`,
  already in go.mod): sheet 1 *Rapor* (identity + kehadiran + ringkasan),
  sheet 2 *Kurikulum*, sheet 3 *Library*. Respond with
  `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
  and `Content-Disposition: attachment; filename=rapor-<nickname>-<from>_<to>.xlsx`.
- No migrations. No new Go deps (excelize moves from indirect → direct).

## 4. Frontend

### Laporan tab

Third tab in `pages/Achievement.tsx`: `kurikulum | library | laporan`.

Controls row:
- **Murid picker** — same pattern as KurikulumTab (role murid → locked to self).
- **Jenis periode** — `Bulanan` / `Semester 1` / `Semester 2`.
  - Bulanan → month + year inputs (default: current month).
  - Semester → tahun_ajaran select (default: active one). Date range computed
    client-side: Sem 1 = `semester1_start_month` → month before
    `semester2_start_month` (across year boundary); Sem 2 =
    `semester2_start_month` → month before `semester1_start_month`.
- **Buttons**: `🖨 Cetak` (window.print) · `⬇ Excel` (navigates to the
  endpoint with `format=xlsx`; cookie auth rides along).

### Report layout (screen + print)

Single component `components/LaporanRapor.tsx` rendering:

1. **Kop**: instansi logo + name (from settings), title
   ("Laporan Bulanan" / "Laporan Semester 1/2"), periode dates, printed-on date.
2. **Identitas** table: nama, panggilan, kode, kelas + wali, tingkat, kelompok.
3. **Kehadiran** table: hadir / izin murid / izin guru / via VN / alfa /
   total + % hadir.
4. **Pencapaian Kurikulum**: one block per tema; rows = materi, status chip,
   ● if `changedInPeriod`; tema sub-totals; overall ringkasan (x tuntas /
   y proses / z belum, % tuntas).
5. **Library**: grouped by kind (Quran/Tilawati/Hadits/Doa) with aspect +
   ref labels, status, ● markers.
6. **Footer**: two signature boxes (Wali Kelas, Orang Tua/Wali) with dotted
   lines, place/date line.

**Print CSS**: `@media print` hides app chrome (nav, controls) and prints only
the report area; A4-friendly (`@page { size: A4; margin: 14mm }`), no shadows,
black-on-white, page-break-avoid inside tema blocks. The legend explains ●
("dicapai/berubah dalam periode ini").

### API client

`web/app/src/api/laporan.ts` — `getLaporanMurid(id, from, to)` +
`laporanXlsxUrl(id, from, to)` (plain URL for the download button).

## 5. i18n

New `achievement.laporan.*` namespace in **both** `id.json` and `en.json`:
tab label, period controls, all section headings, kehadiran/status labels,
legend, signature labels, button labels, empty/error states.

## 6. Edge cases

- Murid without kelas → kelas section shows "—"; report still renders.
- No attendance/pencapaian rows in range → zeros + empty-state rows, not errors.
- Murid without nickname → fall back to name in filename/header.
- Semester crossing year boundary (Sem 1 Jul–Dec of year N when tahun_ajaran
  spans N/N+1; Sem 2 Jan–Jun of N+1) — computed from the tahun_ajaran's
  `tanggal_mulai` year, with the month-window rule above.
- No active tahun_ajaran → semester options disabled with a hint; bulanan
  still works.

## 7. Testing

- **Go**: handler test for authorization (murid self-only, guru/admin allowed);
  store-helper test for attendance counts; xlsx response smoke test
  (status 200, content-type, non-empty body).
- **`make typecheck`** clean.
- **UI pass** on `:8300` (real data): pick a murid → bulanan current month →
  verify kehadiran counts and pencapaian listing; print preview shows only the
  report; Excel downloads and opens; semester 1/2 ranges correct vs the active
  tahun_ajaran. Documented in the PR (Chrome DevTools harness unavailable
  → manual/API verification noted explicitly).
