# Laporan Rapor (Monthly & Semester Reports) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Laporan" tab in the Achievement menu producing a per-murid monthly/semester report as a print-ready page and an .xlsx download, fed by one backend aggregation endpoint.

**Architecture:** New `GET /api/laporan/murid/{id}?from&to[&format=xlsx][&fromUmur…]` assembles identity + kehadiran counts + kurikulum pencapaian (grouped by tema) + library pencapaian from existing stores (two tiny store helpers added). The frontend computes the period (month or semester from tahun_ajaran start months) and the murid's umur tier, renders `LaporanRapor` with `@media print` A4 CSS, and links the same endpoint with `format=xlsx` for Excel (excelize — already in go.sum).

**Tech Stack:** Go + chi + SQLite (no migrations), excelize/v2; React 18 + TanStack Query + react-i18next + Tailwind.

**Conventions (verified in repo):** `httpx.Error(w, status, "snake_code", "Pesan Indonesia")` / `httpx.JSON`; nullable = `*string`; auth via `auth.ClaimsFrom` + per-resource check modeled on `internal/handler/pencapaian.go:canSeeMurid` (admin/pengurus/guru → all, ortu → parent_email match, murid → self). Tests: store-level only (no handler tests exist; verify handler live on `:8300`). `make test` runs in a golang container (`CGO_ENABLED=1`); `make typecheck` = `tsc -b --noEmit`.

---

## Task 1: Store helper — `KelasStore.FindByMurid`

**Files:**
- Modify: `internal/store/kelas.go`
- Test: `internal/store/laporan_test.go` (new; reuses `newJadwalDB` helper from `jadwal_test.go`)

- [ ] **Step 1: Write the failing test** — create `internal/store/laporan_test.go`:

```go
package store

import (
	"context"
	"testing"
)

func TestKelasFindByMurid(t *testing.T) {
	db := newJadwalDB(t)
	ks := NewKelas(db)
	id := mkKelas(t, ks, nil)
	// murid id doesn't need a users row for this query (no FK).
	if _, err := db.Exec(`INSERT INTO kelas_anggota (kelas_id, murid_user_id) VALUES (?, ?)`, id, "MURID01"); err != nil {
		t.Fatalf("seed anggota: %v", err)
	}
	k, err := ks.FindByMurid(context.Background(), "MURID01")
	if err != nil || k == nil || k.ID != id {
		t.Fatalf("FindByMurid: k=%v err=%v", k, err)
	}
	none, err := ks.FindByMurid(context.Background(), "NOBODY")
	if err != nil || none != nil {
		t.Fatalf("expected nil for unknown murid, got %v err=%v", none, err)
	}
}
```

- [ ] **Step 2: Run — expect FAIL** (`FindByMurid` undefined).

Run: `make test 2>&1 | tail -5` (in golang container per repo convention).

- [ ] **Step 3: Implement** — append to `internal/store/kelas.go` (uses existing `kelasCols`, `scanKelas`, `loadGuruIDs` — check the exact loader name used by `KelasStore.Get` and mirror it):

```go
// FindByMurid returns the kelas a murid belongs to (most recent tahun first),
// or nil when the murid has no kelas. Used by the laporan endpoint.
func (s *KelasStore) FindByMurid(ctx context.Context, muridUserID string) (*Kelas, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT `+kelasCols+`
		   FROM kelas k
		   LEFT JOIN users u ON u.id = k.guru_user_id
		   JOIN kelas_anggota a ON a.kelas_id = k.id
		  WHERE a.murid_user_id = ?
		  ORDER BY k.tahun DESC
		  LIMIT 1`, muridUserID)
	k, err := scanKelas(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return k, nil
}
```

> If `KelasStore.Get` also loads guru ids after scanning (e.g. `s.loadGuruIDs(ctx, k)`), add the same call before `return k, nil` — match `Get` exactly.

- [ ] **Step 4: Run — expect PASS.** `make test 2>&1 | tail -5`

- [ ] **Step 5: Commit**

```bash
git add internal/store/kelas.go internal/store/laporan_test.go
git commit -m "feat(kelas): FindByMurid store lookup"
```

---

## Task 2: Store helper — `Attendances.CountForStudent`

**Files:**
- Modify: `internal/store/attendances.go`
- Test: `internal/store/laporan_test.go`

- [ ] **Step 1: Write the failing test** (append; seed minimal attendance rows — check `attendances` table columns with `.schema` if the INSERT fails: `id, date, duration_min, teacher_id, student_id, status, materi, created_at, updated_at, sesi_id`):

```go
func TestAttendanceCountForStudent(t *testing.T) {
	db := newJadwalDB(t)
	at := NewAttendances(db)
	seed := func(id, date, status string) {
		if _, err := db.Exec(
			`INSERT INTO attendances (id, date, teacher_id, student_id, status, created_at, updated_at)
			 VALUES (?, ?, 'GURU01', 'MURID01', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
			id, date, status); err != nil {
			t.Fatalf("seed: %v", err)
		}
	}
	seed("A1", "2026-06-01", "hadir")
	seed("A2", "2026-06-08", "hadir")
	seed("A3", "2026-06-15", "alfa")
	seed("A4", "2026-07-01", "hadir") // outside range
	counts, err := at.CountForStudent(context.Background(), "MURID01", "2026-06-01", "2026-06-30")
	if err != nil {
		t.Fatalf("count: %v", err)
	}
	if counts["hadir"] != 2 || counts["alfa"] != 1 || counts["izin_murid"] != 0 {
		t.Fatalf("bad counts: %+v", counts)
	}
}
```

- [ ] **Step 2: Run — expect FAIL** (`CountForStudent` undefined).

- [ ] **Step 3: Implement** — append to `internal/store/attendances.go`:

```go
// CountForStudent tallies attendance rows per status for one student within
// [from, to] (inclusive, YYYY-MM-DD). Missing statuses are simply absent
// from the map. Used by the laporan endpoint.
func (a *Attendances) CountForStudent(ctx context.Context, studentID, from, to string) (map[string]int, error) {
	rows, err := a.db.QueryContext(ctx,
		`SELECT status, COUNT(*) FROM attendances
		  WHERE student_id = ? AND date >= ? AND date <= ?
		  GROUP BY status`, studentID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]int{}
	for rows.Next() {
		var st string
		var n int
		if err := rows.Scan(&st, &n); err != nil {
			return nil, err
		}
		out[st] = n
	}
	return out, rows.Err()
}
```

> The store's db field name: check `type Attendances struct` (line ~20) — if the field is `db *sql.DB` use `a.db` as above; adjust if named differently.

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add internal/store/attendances.go internal/store/laporan_test.go
git commit -m "feat(attendance): per-status counts for one student+range"
```

---

## Task 3: Laporan handler (JSON) + route wiring

**Files:**
- Create: `internal/handler/laporan.go`
- Modify: `cmd/server/main.go` (route in the authenticated `p` group)

- [ ] **Step 1: Create `internal/handler/laporan.go`:**

```go
package handler

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/fadhilkurnia/ppg-dashboard/internal/auth"
	"github.com/fadhilkurnia/ppg-dashboard/internal/httpx"
	"github.com/fadhilkurnia/ppg-dashboard/internal/store"
)

// Laporan assembles the per-murid report (bulanan/semester) consumed by the
// Achievement → Laporan tab, as JSON or as a downloadable xlsx.
type Laporan struct {
	users       *store.Users
	kelas       *store.KelasStore
	attendances *store.Attendances
	pencapaian  *store.PencapaianStore
	settings    *store.Settings
}

func NewLaporan(u *store.Users, k *store.KelasStore, a *store.Attendances, p *store.PencapaianStore, s *store.Settings) *Laporan {
	return &Laporan{users: u, kelas: k, attendances: a, pencapaian: p, settings: s}
}

// canSeeMurid mirrors pencapaian.go: admin/pengurus/guru see all; ortu sees
// children matched by parent_email; murid sees only themselves.
func (h *Laporan) canSeeMurid(r *http.Request, muridUserID string) bool {
	c, ok := auth.ClaimsFrom(r.Context())
	if !ok {
		return false
	}
	caller, err := h.users.FindByID(r.Context(), c.UserID)
	if err != nil {
		return false
	}
	switch string(caller.Role) {
	case "admin", "pengurus", "guru", "staff":
		return true
	case "ortu":
		m, err := h.users.FindByID(r.Context(), muridUserID)
		if err != nil {
			return false
		}
		return m.ParentEmail != nil &&
			strings.EqualFold(strings.TrimSpace(*m.ParentEmail), strings.TrimSpace(caller.Email))
	case "murid":
		return caller.ID == muridUserID
	default:
		return false
	}
}

type laporanKehadiran struct {
	Hadir     int     `json:"hadir"`
	IzinMurid int     `json:"izinMurid"`
	IzinGuru  int     `json:"izinGuru"`
	ByVn      int     `json:"byVn"`
	Alfa      int     `json:"alfa"`
	Total     int     `json:"total"`
	PctHadir  float64 `json:"pctHadir"`
}

type laporanItem struct {
	Materi          string  `json:"materi"`
	SubTema         string  `json:"subTema"`
	Status          string  `json:"status"` // belum|proses|tuntas
	ChangedInPeriod bool    `json:"changedInPeriod"`
	Tanggal         *string `json:"tanggal,omitempty"`
}

type laporanTema struct {
	Tema  string        `json:"tema"`
	Items []laporanItem `json:"items"`
}

type laporanLibrary struct {
	Kind            string  `json:"kind"`
	Aspect          *string `json:"aspect,omitempty"`
	Ref             string  `json:"ref"`
	Status          string  `json:"status"`
	ChangedInPeriod bool    `json:"changedInPeriod"`
}

type laporanRingkasan struct {
	Tuntas    int     `json:"tuntas"`
	Proses    int     `json:"proses"`
	Belum     int     `json:"belum"`
	PctTuntas float64 `json:"pctTuntas"`
}

type laporanResponse struct {
	Murid     map[string]any   `json:"murid"`
	Kelas     map[string]any   `json:"kelas"` // nil when murid has no kelas
	Instansi  map[string]any   `json:"instansi"`
	Periode   map[string]any   `json:"periode"`
	Kehadiran laporanKehadiran `json:"kehadiran"`
	Kurikulum []laporanTema    `json:"kurikulum"`
	Library   []laporanLibrary `json:"library"`
	Ringkasan laporanRingkasan `json:"ringkasan"`
}

func isDate(s string) bool { return len(s) == 10 && s[4] == '-' && s[7] == '-' }

// inPeriod: pencapaian counts as "changed in period" when its tanggal
// (fallback: updated_at date part) falls inside [from, to].
func inPeriod(p *store.Pencapaian, from, to string) bool {
	if p == nil {
		return false
	}
	d := ""
	if p.Tanggal != nil && *p.Tanggal != "" {
		d = (*p.Tanggal)[:10]
	} else if len(p.UpdatedAt) >= 10 {
		d = p.UpdatedAt[:10]
	}
	return d >= from && d <= to
}

func intPtr(q string) *int {
	if q == "" {
		return nil
	}
	if n, err := strconv.Atoi(q); err == nil {
		return &n
	}
	return nil
}

// assemble builds the full report payload (shared by JSON and xlsx outputs).
func (h *Laporan) assemble(r *http.Request, muridID, from, to string) (*laporanResponse, int, string, string) {
	ctx := r.Context()
	murid, err := h.users.FindByID(ctx, muridID)
	if err != nil {
		return nil, http.StatusNotFound, "not_found", "Murid tidak ditemukan"
	}
	q := r.URL.Query()

	// Identity ---------------------------------------------------------------
	deref := func(p *string) string {
		if p != nil {
			return *p
		}
		return ""
	}
	out := &laporanResponse{
		Murid: map[string]any{
			"id": murid.ID, "name": murid.Name,
			"nickname": deref(murid.Nickname), "userCode": deref(murid.UserCode),
			"level": murid.Level, "kelompok": deref(murid.Kelompok),
		},
		Periode: map[string]any{"from": from, "to": to},
	}

	// Kelas (optional) --------------------------------------------------------
	if k, err := h.kelas.FindByMurid(ctx, muridID); err == nil && k != nil {
		wali := ""
		if k.GuruName != nil {
			wali = *k.GuruName
		}
		out.Kelas = map[string]any{
			"id": k.ID, "nama": k.Nama, "tingkat": k.Tingkat,
			"tahun": k.Tahun, "waliName": wali,
		}
	}

	// Instansi (settings) ------------------------------------------------------
	if st, err := h.settings.GetAll(ctx); err == nil {
		out.Instansi = map[string]any{
			"name": st["instansi_name"], "logo": st["instansi_logo"],
		}
	} else {
		out.Instansi = map[string]any{"name": "", "logo": ""}
	}

	// Kehadiran ---------------------------------------------------------------
	counts, err := h.attendances.CountForStudent(ctx, muridID, from, to)
	if err != nil {
		return nil, http.StatusInternalServerError, "internal", "Gagal menghitung kehadiran"
	}
	kh := laporanKehadiran{
		Hadir: counts["hadir"], IzinMurid: counts["izin_murid"],
		IzinGuru: counts["izin_guru"], ByVn: counts["by_vn"], Alfa: counts["alfa"],
	}
	kh.Total = kh.Hadir + kh.IzinMurid + kh.IzinGuru + kh.ByVn + kh.Alfa
	if kh.Total > 0 {
		kh.PctHadir = float64(kh.Hadir) * 100 / float64(kh.Total)
	}
	out.Kehadiran = kh

	// Kurikulum (grouped by tema, optional umur/sem scoping) -------------------
	rows, err := h.pencapaian.ListForMurid(ctx, store.PencapaianListParams{
		MuridUserID: muridID,
		FromUmur:    intPtr(q.Get("fromUmur")), FromSem: intPtr(q.Get("fromSem")),
		ToUmur: intPtr(q.Get("toUmur")), ToSem: intPtr(q.Get("toSem")),
	})
	if err != nil {
		return nil, http.StatusInternalServerError, "internal", "Gagal mengambil pencapaian"
	}
	temaIdx := map[string]int{}
	for _, row := range rows {
		status := "belum"
		var tgl *string
		if row.Pencapaian != nil {
			status = string(row.Pencapaian.Status)
			tgl = row.Pencapaian.Tanggal
		}
		item := laporanItem{
			Materi:          row.Materi.DetailMateri,
			SubTema:         row.Materi.SubTema,
			Status:          status,
			ChangedInPeriod: inPeriod(row.Pencapaian, from, to),
			Tanggal:         tgl,
		}
		i, ok := temaIdx[row.Materi.Tema]
		if !ok {
			i = len(out.Kurikulum)
			temaIdx[row.Materi.Tema] = i
			out.Kurikulum = append(out.Kurikulum, laporanTema{Tema: row.Materi.Tema})
		}
		out.Kurikulum[i].Items = append(out.Kurikulum[i].Items, item)
		switch status {
		case "tuntas":
			out.Ringkasan.Tuntas++
		case "proses":
			out.Ringkasan.Proses++
		default:
			out.Ringkasan.Belum++
		}
	}
	tot := out.Ringkasan.Tuntas + out.Ringkasan.Proses + out.Ringkasan.Belum
	if tot > 0 {
		out.Ringkasan.PctTuntas = float64(out.Ringkasan.Tuntas) * 100 / float64(tot)
	}

	// Library -----------------------------------------------------------------
	libs, err := h.pencapaian.ListLibraryForMurid(ctx, muridID)
	if err != nil {
		return nil, http.StatusInternalServerError, "internal", "Gagal mengambil pencapaian library"
	}
	for _, p := range libs {
		pc := p
		kind, ref := deref(p.LibraryKind), deref(p.LibraryRef)
		if kind == "" || ref == "" {
			continue
		}
		out.Library = append(out.Library, laporanLibrary{
			Kind: kind, Aspect: p.LibraryAspect, Ref: ref,
			Status: string(p.Status), ChangedInPeriod: inPeriod(&pc, from, to),
		})
	}
	return out, 0, "", ""
}

// Get — GET /api/laporan/murid/{id}?from&to[&format=xlsx][&fromUmur&fromSem&toUmur&toSem]
func (h *Laporan) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	q := r.URL.Query()
	from, to := q.Get("from"), q.Get("to")
	if !isDate(from) || !isDate(to) || from > to {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Parameter from/to (YYYY-MM-DD) wajib dan valid")
		return
	}
	if !h.canSeeMurid(r, id) {
		httpx.Error(w, http.StatusForbidden, "forbidden", "Akses tidak diizinkan")
		return
	}
	rep, status, code, msg := h.assemble(r, id, from, to)
	if rep == nil {
		httpx.Error(w, status, code, msg)
		return
	}
	if q.Get("format") == "xlsx" {
		h.writeXlsx(w, rep) // Task 4
		return
	}
	httpx.JSON(w, http.StatusOK, rep)
}
```

> Field-name checks while implementing (grep, don't guess): `store.Users` struct/type name and `FindByID` signature (used verbatim in `pencapaian.go`, lines ~42-58 — copy from there); `MateriAjar.DetailMateri` (the human-readable materi text — confirm with `grep -n 'DetailMateri' internal/store/kurikulum.go`); `Pencapaian.UpdatedAt` exists in `pencapaianCols`. `murid.Level` is `*model.StudentLevel` — JSON-encodes as string/null directly.

- [ ] **Step 2: Temporary `writeXlsx` stub** so the package compiles before Task 4 — add at the bottom of `laporan.go`:

```go
// writeXlsx is implemented in Task 4 (xlsx.go); temporary stub.
func (h *Laporan) writeXlsx(w http.ResponseWriter, rep *laporanResponse) {
	httpx.Error(w, http.StatusNotImplemented, "not_implemented", "Ekspor Excel belum tersedia")
}
```

- [ ] **Step 3: Wire route** in `cmd/server/main.go` — find the store constructions (~line 173-190) to confirm var names (`users`, `kelas`, `attendances`, `pencapaian`, and the settings store — `grep -n 'store.NewSettings' cmd/server/main.go`). Then inside the authenticated `p` group, after the pencapaian routes (~line 287), add:

```go
			laporanH := handler.NewLaporan(users, kelas, attendances, pencapaian, settings)
			p.Get("/laporan/murid/{id}", laporanH.Get)
```

> If the settings store var has a different name (e.g. `settingsStore`), use that name.

- [ ] **Step 4: Build + tests**

Run: `make test 2>&1 | tail -5` and `CGO_ENABLED=1 go build ./... ` (in the golang container).
Expected: build green, store tests pass.

- [ ] **Step 5: Commit**

```bash
git add internal/handler/laporan.go cmd/server/main.go
git commit -m "feat(laporan): per-murid report aggregation endpoint"
```

---

## Task 4: xlsx output (excelize)

**Files:**
- Create: `internal/handler/laporan_xlsx.go`
- Modify: `internal/handler/laporan.go` (delete the Task-3 stub)
- Modify: `go.mod` (excelize moves indirect → direct; run `go mod tidy`)

- [ ] **Step 1: Create `internal/handler/laporan_xlsx.go`:**

```go
package handler

import (
	"fmt"
	"net/http"

	"github.com/xuri/excelize/v2"
)

// writeXlsx streams the report as a 3-sheet Excel workbook:
// Rapor (identity+kehadiran+ringkasan), Kurikulum, Library.
func (h *Laporan) writeXlsx(w http.ResponseWriter, rep *laporanResponse) {
	f := excelize.NewFile()
	defer f.Close()

	// Sheet 1 — Rapor
	main := "Rapor"
	f.SetSheetName("Sheet1", main)
	row := 1
	set := func(col string, vals ...any) {
		for i, v := range vals {
			cell, _ := excelize.CoordinatesToCellName(i+1, row)
			_ = f.SetCellValue(main, cell, v)
		}
		_ = col // first col label included in vals
		row++
	}
	set("", "Laporan Pencapaian")
	set("", "Periode", fmt.Sprintf("%v s/d %v", rep.Periode["from"], rep.Periode["to"]))
	set("", "Instansi", rep.Instansi["name"])
	row++
	set("", "Nama", rep.Murid["name"])
	set("", "Panggilan", rep.Murid["nickname"])
	set("", "Kode", rep.Murid["userCode"])
	if rep.Kelas != nil {
		set("", "Kelas", rep.Kelas["nama"], "Wali", rep.Kelas["waliName"])
	}
	row++
	set("", "Kehadiran", "Hadir", "Izin Murid", "Izin Guru", "Via VN", "Alfa", "Total", "% Hadir")
	set("", "", rep.Kehadiran.Hadir, rep.Kehadiran.IzinMurid, rep.Kehadiran.IzinGuru,
		rep.Kehadiran.ByVn, rep.Kehadiran.Alfa, rep.Kehadiran.Total,
		fmt.Sprintf("%.1f%%", rep.Kehadiran.PctHadir))
	row++
	set("", "Ringkasan", "Tuntas", "Proses", "Belum", "% Tuntas")
	set("", "", rep.Ringkasan.Tuntas, rep.Ringkasan.Proses, rep.Ringkasan.Belum,
		fmt.Sprintf("%.1f%%", rep.Ringkasan.PctTuntas))

	// Sheet 2 — Kurikulum
	kSheet := "Kurikulum"
	_, _ = f.NewSheet(kSheet)
	kr := 1
	kset := func(vals ...any) {
		for i, v := range vals {
			cell, _ := excelize.CoordinatesToCellName(i+1, kr)
			_ = f.SetCellValue(kSheet, cell, v)
		}
		kr++
	}
	kset("Tema", "Sub Tema", "Materi", "Status", "Berubah Dlm Periode", "Tanggal")
	for _, tema := range rep.Kurikulum {
		for _, it := range tema.Items {
			tgl := ""
			if it.Tanggal != nil {
				tgl = *it.Tanggal
			}
			kset(tema.Tema, it.SubTema, it.Materi, it.Status, it.ChangedInPeriod, tgl)
		}
	}

	// Sheet 3 — Library
	lSheet := "Library"
	_, _ = f.NewSheet(lSheet)
	lr := 1
	lset := func(vals ...any) {
		for i, v := range vals {
			cell, _ := excelize.CoordinatesToCellName(i+1, lr)
			_ = f.SetCellValue(lSheet, cell, v)
		}
		lr++
	}
	lset("Jenis", "Aspek", "Referensi", "Status", "Berubah Dlm Periode")
	for _, l := range rep.Library {
		aspect := ""
		if l.Aspect != nil {
			aspect = *l.Aspect
		}
		lset(l.Kind, aspect, l.Ref, l.Status, l.ChangedInPeriod)
	}

	nick, _ := rep.Murid["nickname"].(string)
	if nick == "" {
		nick, _ = rep.Murid["name"].(string)
	}
	fname := fmt.Sprintf("rapor-%s-%v_%v.xlsx", nick, rep.Periode["from"], rep.Periode["to"])
	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	w.Header().Set("Content-Disposition", `attachment; filename="`+fname+`"`)
	_ = f.Write(w)
}
```

- [ ] **Step 2: Remove the stub** from `laporan.go` (the temporary `writeXlsx` func from Task 3 Step 2).

- [ ] **Step 3: `go mod tidy`** inside the golang container (moves excelize to a direct require):

```bash
podman run --rm -v "$PWD":/src -v gnrs-gocache:/go/pkg/mod -w /src golang:1.25-alpine \
  sh -c "go mod tidy && go build ./internal/handler/"
```

Expected: builds; `go.mod` diff shows excelize without `// indirect`.

- [ ] **Step 4: Full test.** `make test 2>&1 | tail -5` — green.

- [ ] **Step 5: Commit**

```bash
git add internal/handler/laporan_xlsx.go internal/handler/laporan.go go.mod go.sum
git commit -m "feat(laporan): xlsx export via excelize"
```

---

## Task 5: Frontend API client

**Files:**
- Create: `web/app/src/api/laporan.ts`

- [ ] **Step 1: Create the client** (types mirror Task 3's JSON):

```ts
import { apiFetch } from './client'

export type LaporanKehadiran = {
  hadir: number
  izinMurid: number
  izinGuru: number
  byVn: number
  alfa: number
  total: number
  pctHadir: number
}

export type LaporanItem = {
  materi: string
  subTema: string
  status: 'belum' | 'proses' | 'tuntas'
  changedInPeriod: boolean
  tanggal?: string | null
}

export type LaporanTema = { tema: string; items: LaporanItem[] }

export type LaporanLibrary = {
  kind: string
  aspect?: string | null
  ref: string
  status: string
  changedInPeriod: boolean
}

export type LaporanResponse = {
  murid: { id: string; name: string; nickname: string; userCode: string; level?: string | null; kelompok: string }
  kelas: { id: string; nama: string; tingkat: string; tahun: number; waliName: string } | null
  instansi: { name: string; logo: string }
  periode: { from: string; to: string }
  kehadiran: LaporanKehadiran
  kurikulum: LaporanTema[]
  library: LaporanLibrary[]
  ringkasan: { tuntas: number; proses: number; belum: number; pctTuntas: number }
}

export type LaporanParams = {
  from: string
  to: string
  fromUmur?: number
  fromSem?: number
  toUmur?: number
  toSem?: number
}

function laporanQs(p: LaporanParams) {
  const sp = new URLSearchParams({ from: p.from, to: p.to })
  if (p.fromUmur != null) sp.set('fromUmur', String(p.fromUmur))
  if (p.fromSem != null) sp.set('fromSem', String(p.fromSem))
  if (p.toUmur != null) sp.set('toUmur', String(p.toUmur))
  if (p.toSem != null) sp.set('toSem', String(p.toSem))
  return sp
}

export function getLaporanMurid(muridId: string, p: LaporanParams) {
  return apiFetch<LaporanResponse>(`/api/laporan/murid/${encodeURIComponent(muridId)}?${laporanQs(p)}`)
}

/** Plain same-origin URL for the xlsx download button (cookie auth rides along). */
export function laporanXlsxUrl(muridId: string, p: LaporanParams) {
  const sp = laporanQs(p)
  sp.set('format', 'xlsx')
  return `/api/laporan/murid/${encodeURIComponent(muridId)}?${sp}`
}
```

- [ ] **Step 2: Type-check.** `make typecheck 2>&1 | tail -5` — clean.

- [ ] **Step 3: Commit**

```bash
git add web/app/src/api/laporan.ts
git commit -m "feat(web): laporan API client"
```

---

## Task 6: `LaporanRapor` report component + print CSS

**Files:**
- Create: `web/app/src/components/LaporanRapor.tsx`
- Modify: `web/app/src/index.css` (print rules)

- [ ] **Step 1: Create the component** (pure presentational; receives the response + a periode label):

```tsx
import { useTranslation } from 'react-i18next'

import { type LaporanResponse } from '@/api/laporan'
import { cn } from '@/lib/cn'

const STATUS_CHIP: Record<string, string> = {
  tuntas: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
  proses: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200',
  belum: 'bg-slate-100 text-slate-500 ring-1 ring-inset ring-slate-200',
}

/**
 * LaporanRapor — print-ready per-murid report body. Wrapped in
 * #laporan-print-area so the @media print rules in index.css isolate it.
 */
export function LaporanRapor({ data, periodeLabel }: { data: LaporanResponse; periodeLabel: string }) {
  const { t } = useTranslation()
  const printedOn = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div id="laporan-print-area" className="mx-auto max-w-3xl space-y-5 rounded-lg border border-slate-200 bg-white p-6 shadow-sm print:border-0 print:shadow-none">
      {/* Kop */}
      <header className="flex items-center gap-3 border-b-2 border-slate-900 pb-3">
        {data.instansi.logo ? <img src={data.instansi.logo} alt="" className="h-12 w-12 object-contain" /> : null}
        <div className="flex-1">
          <div className="text-lg font-bold leading-tight">GNRS{data.instansi.name ? ` ${data.instansi.name}` : ''}</div>
          <div className="text-sm font-semibold text-slate-700">{periodeLabel}</div>
          <div className="text-xs text-slate-500">
            {data.periode.from} — {data.periode.to} · {t('achievement.laporan.printedOn', { date: printedOn })}
          </div>
        </div>
      </header>

      {/* Identitas */}
      <section>
        <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-600">{t('achievement.laporan.identitas')}</h3>
        <table className="w-full text-sm">
          <tbody>
            <tr><td className="w-36 py-0.5 text-slate-500">{t('achievement.laporan.nama')}</td><td className="font-medium">{data.murid.name}{data.murid.nickname ? ` (${data.murid.nickname})` : ''}</td></tr>
            {data.murid.userCode ? <tr><td className="py-0.5 text-slate-500">{t('achievement.laporan.kode')}</td><td>{data.murid.userCode}</td></tr> : null}
            <tr><td className="py-0.5 text-slate-500">{t('achievement.laporan.kelas')}</td><td>{data.kelas ? `${data.kelas.nama} · ${data.kelas.tingkat} · ${data.kelas.tahun}${data.kelas.waliName ? ` — ${t('achievement.laporan.wali')} ${data.kelas.waliName}` : ''}` : '—'}</td></tr>
            {data.murid.kelompok ? <tr><td className="py-0.5 text-slate-500">{t('achievement.laporan.kelompok')}</td><td>{data.murid.kelompok}</td></tr> : null}
          </tbody>
        </table>
      </section>

      {/* Kehadiran */}
      <section>
        <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-600">{t('achievement.laporan.kehadiran')}</h3>
        <table className="w-full border-collapse text-center text-sm">
          <thead>
            <tr className="bg-slate-50 text-xs text-slate-600">
              <th className="border border-slate-200 px-2 py-1">{t('achievement.laporan.hadir')}</th>
              <th className="border border-slate-200 px-2 py-1">{t('achievement.laporan.izinMurid')}</th>
              <th className="border border-slate-200 px-2 py-1">{t('achievement.laporan.izinGuru')}</th>
              <th className="border border-slate-200 px-2 py-1">{t('achievement.laporan.byVn')}</th>
              <th className="border border-slate-200 px-2 py-1">{t('achievement.laporan.alfa')}</th>
              <th className="border border-slate-200 px-2 py-1">{t('achievement.laporan.total')}</th>
              <th className="border border-slate-200 px-2 py-1">{t('achievement.laporan.pctHadir')}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-slate-200 px-2 py-1 font-semibold text-emerald-700">{data.kehadiran.hadir}</td>
              <td className="border border-slate-200 px-2 py-1">{data.kehadiran.izinMurid}</td>
              <td className="border border-slate-200 px-2 py-1">{data.kehadiran.izinGuru}</td>
              <td className="border border-slate-200 px-2 py-1">{data.kehadiran.byVn}</td>
              <td className="border border-slate-200 px-2 py-1 text-rose-600">{data.kehadiran.alfa}</td>
              <td className="border border-slate-200 px-2 py-1">{data.kehadiran.total}</td>
              <td className="border border-slate-200 px-2 py-1 font-semibold">{data.kehadiran.pctHadir.toFixed(1)}%</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Kurikulum */}
      <section>
        <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-600">{t('achievement.laporan.kurikulum')}</h3>
        <p className="mb-2 text-[11px] text-slate-500">● {t('achievement.laporan.legend')}</p>
        {data.kurikulum.length === 0 ? (
          <p className="py-3 text-center text-sm text-slate-400">{t('achievement.laporan.empty')}</p>
        ) : (
          data.kurikulum.map((tema) => (
            <div key={tema.tema} className="mb-3 break-inside-avoid">
              <div className="rounded-t-md bg-slate-100 px-2 py-1 text-xs font-bold uppercase tracking-wide text-slate-700">{tema.tema}</div>
              <table className="w-full border-collapse text-sm">
                <tbody>
                  {tema.items.map((it, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="px-2 py-1">
                        {it.changedInPeriod ? <span className="mr-1 text-emerald-600">●</span> : null}
                        {it.materi}
                        {it.subTema ? <span className="ml-1 text-xs text-slate-400">({it.subTema})</span> : null}
                      </td>
                      <td className="w-24 px-2 py-1 text-right">
                        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', STATUS_CHIP[it.status])}>
                          {t(`achievement.laporan.status.${it.status}`)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        )}
        <div className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-sm">
          <span className="font-semibold">{t('achievement.laporan.ringkasan')}: </span>
          {t('achievement.laporan.ringkasanLine', {
            tuntas: data.ringkasan.tuntas, proses: data.ringkasan.proses,
            belum: data.ringkasan.belum, pct: data.ringkasan.pctTuntas.toFixed(1),
          })}
        </div>
      </section>

      {/* Library */}
      <section className="break-inside-avoid">
        <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-600">{t('achievement.laporan.library')}</h3>
        {data.library.length === 0 ? (
          <p className="py-3 text-center text-sm text-slate-400">{t('achievement.laporan.empty')}</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs text-slate-600">
                <th className="border border-slate-200 px-2 py-1">{t('achievement.laporan.jenis')}</th>
                <th className="border border-slate-200 px-2 py-1">{t('achievement.laporan.aspek')}</th>
                <th className="border border-slate-200 px-2 py-1">{t('achievement.laporan.referensi')}</th>
                <th className="border border-slate-200 px-2 py-1">{t('achievement.laporan.statusLabel')}</th>
              </tr>
            </thead>
            <tbody>
              {data.library.map((l, i) => (
                <tr key={i}>
                  <td className="border border-slate-200 px-2 py-1 capitalize">{l.changedInPeriod ? <span className="mr-1 text-emerald-600">●</span> : null}{l.kind}</td>
                  <td className="border border-slate-200 px-2 py-1">{l.aspect ?? '—'}</td>
                  <td className="border border-slate-200 px-2 py-1">{l.ref}</td>
                  <td className="border border-slate-200 px-2 py-1">
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', STATUS_CHIP[l.status] ?? STATUS_CHIP.belum)}>
                      {t(`achievement.laporan.status.${l.status}`)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Tanda tangan */}
      <footer className="break-inside-avoid pt-4">
        <div className="grid grid-cols-2 gap-8 text-center text-sm">
          <div>
            <div className="mb-14">{t('achievement.laporan.ttdWali')}</div>
            <div className="border-t border-dotted border-slate-400 pt-1 text-xs text-slate-500">{data.kelas?.waliName || '(' + t('achievement.laporan.nama') + ')'}</div>
          </div>
          <div>
            <div className="mb-14">{t('achievement.laporan.ttdOrtu')}</div>
            <div className="border-t border-dotted border-slate-400 pt-1 text-xs text-slate-500">({t('achievement.laporan.nama')})</div>
          </div>
        </div>
      </footer>
    </div>
  )
}
```

- [ ] **Step 2: Print CSS** — append inside `@layer utilities` (or after it) in `web/app/src/index.css`:

```css
/* Laporan rapor print isolation: print ONLY the report area, A4-friendly. */
@media print {
  @page {
    size: A4;
    margin: 14mm;
  }
  body * {
    visibility: hidden;
  }
  #laporan-print-area,
  #laporan-print-area * {
    visibility: visible;
  }
  #laporan-print-area {
    position: absolute;
    inset: 0;
    margin: 0;
    max-width: none;
    overflow: visible;
  }
  /* The app shell is height-locked + overflow-hidden for iOS; undo for print
     so multi-page reports paginate instead of clipping to one viewport. */
  html,
  body,
  #root {
    height: auto !important;
    overflow: visible !important;
  }
}
```

- [ ] **Step 3: Type-check.** `make typecheck 2>&1 | tail -5` — clean (component unused until Task 7; that's fine for tsc).

- [ ] **Step 4: Commit**

```bash
git add web/app/src/components/LaporanRapor.tsx web/app/src/index.css
git commit -m "feat(web): LaporanRapor print-ready report component"
```

---

## Task 7: Laporan tab in Achievement

**Files:**
- Modify: `web/app/src/pages/Achievement.tsx`

- [ ] **Step 1: Extend the tab union + strip** — in `AchievementPage` (~line 59-80):

```tsx
const [tab, setTab] = useState<'kurikulum' | 'library' | 'laporan'>('kurikulum')
```

Add after the Library TabButton:

```tsx
        <TabButton active={tab === 'laporan'} onClick={() => setTab('laporan')}>
          {t('achievement.tabLaporan')}
        </TabButton>
```

And the body: `{tab === 'kurikulum' ? <KurikulumTab /> : tab === 'library' ? <LibraryTab /> : <LaporanTab />}`

- [ ] **Step 2: Imports** — add to the existing import block:

```ts
import { getLaporanMurid, laporanXlsxUrl, type LaporanParams } from '@/api/laporan'
import { listTahunAjaran, type TahunAjaran } from '@/api/tahunAjaran'
import { LaporanRapor } from '@/components/LaporanRapor'
```

(`listStudents`, `listTingkat`, `useQuery`, `useAuth`, `useTranslation` are already imported.)

- [ ] **Step 3: Add `LaporanTab`** at the bottom of the file:

```tsx
// ---------------------------------------------------------------------------

// Semester date range from a tahun ajaran's start months. Sem 1 runs from
// semester1StartMonth to the month before semester2StartMonth (wrapping the
// year when s2 <= s1); Sem 2 runs from semester2StartMonth to the month
// before the NEXT semester 1. Base year comes from tanggalMulai.
function semesterRange(ta: TahunAjaran, sem: 1 | 2): { from: string; to: string } {
  const baseYear = ta.tanggalMulai ? Number(ta.tanggalMulai.slice(0, 4)) : new Date().getFullYear()
  const s1 = ta.semester1StartMonth || 7
  const s2 = ta.semester2StartMonth || 1
  const abs = (y: number, m: number) => y * 12 + (m - 1)
  const s1Abs = abs(baseYear, s1)
  const s2Abs = s2 <= s1 ? abs(baseYear + 1, s2) : abs(baseYear, s2)
  const nextS1Abs = abs(baseYear + 1, s1)
  const [fromAbs, toAbs] = sem === 1 ? [s1Abs, s2Abs - 1] : [s2Abs, nextS1Abs - 1]
  const toDate = (a: number, end: boolean) => {
    const y = Math.floor(a / 12)
    const m = (a % 12) + 1
    const d = end ? new Date(y, m, 0).getDate() : 1
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  return { from: toDate(fromAbs, false), to: toDate(toAbs, true) }
}

function LaporanTab() {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const isMurid = user?.role === 'murid'

  const [muridUserId, setMuridUserId] = useState<string>(isMurid ? user!.id : '')
  const now = new Date()
  const [jenis, setJenis] = useState<'bulanan' | 'sem1' | 'sem2'>('bulanan')
  const [bulan, setBulan] = useState(now.getMonth() + 1) // 1-12
  const [tahun, setTahun] = useState(now.getFullYear())
  const [taId, setTaId] = useState('')

  const { data: students } = useQuery({
    queryKey: ['students', { all: true }],
    queryFn: () => listStudents({ status: 'active', limit: 500 }),
    enabled: !isMurid,
    staleTime: 60_000,
  })
  const { data: tingkatList = [] } = useQuery({
    queryKey: ['tingkat'],
    queryFn: listTingkat,
    staleTime: 5 * 60_000,
  })
  const { data: taList = [] } = useQuery({
    queryKey: ['tahun-ajaran'],
    queryFn: listTahunAjaran,
    staleTime: 5 * 60_000,
  })

  // Default tahun ajaran = the active one.
  const activeTa = useMemo(() => taList.find((x) => x.active) ?? taList[0], [taList])
  const pickedTa = useMemo(() => taList.find((x) => x.id === taId) ?? activeTa, [taList, taId, activeTa])

  // Period (from/to) per jenis.
  const periode = useMemo((): { from: string; to: string } | null => {
    if (jenis === 'bulanan') {
      const last = new Date(tahun, bulan, 0).getDate()
      const mm = String(bulan).padStart(2, '0')
      return { from: `${tahun}-${mm}-01`, to: `${tahun}-${mm}-${String(last).padStart(2, '0')}` }
    }
    if (!pickedTa) return null
    return semesterRange(pickedTa, jenis === 'sem1' ? 1 : 2)
  }, [jenis, bulan, tahun, pickedTa])

  // Murid's umur tier from their level → tingkat.umur (scopes the kurikulum
  // section like the Kurikulum tab's auto-default). Semester reports also
  // scope to that semester's materi.
  const params = useMemo((): LaporanParams | null => {
    if (!periode) return null
    const p: LaporanParams = { ...periode }
    const student = students?.items.find((s) => s.id === muridUserId)
    const tk = student?.level
      ? tingkatList.find((x) => x.nama.toLowerCase() === String(student.level).toLowerCase() && x.umur != null)
      : undefined
    if (tk?.umur != null) {
      p.fromUmur = tk.umur
      p.toUmur = tk.umur
      if (jenis !== 'bulanan') {
        p.fromSem = jenis === 'sem1' ? 1 : 2
        p.toSem = p.fromSem
      }
    }
    return p
  }, [periode, students, muridUserId, tingkatList, jenis])

  const { data, isFetching, isError } = useQuery({
    queryKey: ['laporan', muridUserId, params],
    queryFn: () => getLaporanMurid(muridUserId, params!),
    enabled: Boolean(muridUserId && params),
  })

  const BULAN = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(i18n.language, { month: 'long' })
    return Array.from({ length: 12 }, (_, i) => fmt.format(new Date(2000, i, 1)))
  }, [i18n.language])

  const periodeLabel =
    jenis === 'bulanan'
      ? t('achievement.laporan.titleBulanan', { bulan: BULAN[bulan - 1], tahun })
      : t('achievement.laporan.titleSemester', { sem: jenis === 'sem1' ? 1 : 2, ta: pickedTa?.nama ?? '' })

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Controls — hidden when printing */}
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        {!isMurid ? (
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">{t('achievement.laporan.murid')}</span>
            <select
              value={muridUserId}
              onChange={(e) => setMuridUserId(e.target.value)}
              className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"
            >
              <option value="">{t('common.selectPrompt')}</option>
              {(students?.items ?? []).map((s) => (
                <option key={s.id} value={s.id}>{s.name}{s.nickname ? ` (${s.nickname})` : ''}</option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">{t('achievement.laporan.jenis')}</span>
          <select value={jenis} onChange={(e) => setJenis(e.target.value as typeof jenis)} className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm">
            <option value="bulanan">{t('achievement.laporan.bulanan')}</option>
            <option value="sem1" disabled={!pickedTa}>{t('achievement.laporan.semester1')}</option>
            <option value="sem2" disabled={!pickedTa}>{t('achievement.laporan.semester2')}</option>
          </select>
        </label>

        {jenis === 'bulanan' ? (
          <>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-600">{t('achievement.laporan.bulan')}</span>
              <select value={bulan} onChange={(e) => setBulan(Number(e.target.value))} className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm">
                {BULAN.map((b, i) => <option key={i} value={i + 1}>{b}</option>)}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-600">{t('achievement.laporan.tahun')}</span>
              <input type="number" value={tahun} onChange={(e) => setTahun(Number(e.target.value) || now.getFullYear())} className="h-9 w-24 rounded-md border border-slate-300 bg-white px-2 text-sm" />
            </label>
          </>
        ) : (
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">{t('achievement.laporan.tahunAjaran')}</span>
            <select value={pickedTa?.id ?? ''} onChange={(e) => setTaId(e.target.value)} className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm">
              {taList.map((x) => <option key={x.id} value={x.id}>{x.nama}{x.active ? ' ✓' : ''}</option>)}
            </select>
          </label>
        )}

        <div className="ml-auto flex gap-2">
          <Button variant="secondary" size="sm" disabled={!data} onClick={() => window.print()}>
            🖨 {t('achievement.laporan.cetak')}
          </Button>
          <Button size="sm" disabled={!muridUserId || !params} onClick={() => { if (params) window.open(laporanXlsxUrl(muridUserId, params), '_blank') }}>
            ⬇ {t('achievement.laporan.unduhExcel')}
          </Button>
        </div>
      </div>

      {!muridUserId ? (
        <p className="py-10 text-center text-sm text-slate-500">{t('achievement.laporan.pickMuridHint')}</p>
      ) : isFetching ? (
        <p className="py-10 text-center text-sm text-slate-500">{t('common.loading')}</p>
      ) : isError ? (
        <p className="py-10 text-center text-sm text-rose-600">{t('achievement.laporan.loadFailed')}</p>
      ) : data ? (
        <LaporanRapor data={data} periodeLabel={periodeLabel} />
      ) : null}
    </div>
  )
}
```

> Check existing imports in Achievement.tsx: `Button` may not be imported — add `import { Button } from '@/components/Button'` if missing; `useMemo`/`useState` are already imported (line 1).

- [ ] **Step 4: Type-check.** `make typecheck 2>&1 | tail -10` — clean.

- [ ] **Step 5: Commit**

```bash
git add web/app/src/pages/Achievement.tsx
git commit -m "feat(achievement): laporan tab with period controls"
```

---

## Task 8: i18n keys (both locales)

**Files:**
- Modify: `web/app/src/locales/id.json` (inside the existing `achievement` object)
- Modify: `web/app/src/locales/en.json` (same shape)

- [ ] **Step 1: Locate the `achievement` subtree** (`grep -n '"achievement"' web/app/src/locales/id.json`) and add a sibling key after `tabLibrary` (or equivalent):

`id.json`:

```json
    "tabLaporan": "Laporan",
    "laporan": {
      "murid": "Murid",
      "jenis": "Jenis laporan",
      "bulanan": "Bulanan",
      "semester1": "Semester 1",
      "semester2": "Semester 2",
      "bulan": "Bulan",
      "tahun": "Tahun",
      "tahunAjaran": "Tahun ajaran",
      "cetak": "Cetak",
      "unduhExcel": "Unduh Excel",
      "titleBulanan": "Laporan Bulanan — {{bulan}} {{tahun}}",
      "titleSemester": "Laporan Semester {{sem}} — {{ta}}",
      "printedOn": "Dicetak {{date}}",
      "identitas": "Identitas",
      "nama": "Nama",
      "kode": "Kode",
      "kelas": "Kelas",
      "wali": "Wali",
      "kelompok": "Kelompok",
      "kehadiran": "Kehadiran",
      "hadir": "Hadir",
      "izinMurid": "Izin Murid",
      "izinGuru": "Izin Guru",
      "byVn": "Via VN",
      "alfa": "Alfa",
      "total": "Total",
      "pctHadir": "% Hadir",
      "kurikulum": "Pencapaian Kurikulum",
      "legend": "dicapai/berubah dalam periode ini",
      "ringkasan": "Ringkasan",
      "ringkasanLine": "{{tuntas}} tuntas · {{proses}} proses · {{belum}} belum · {{pct}}% tuntas",
      "library": "Pencapaian Library",
      "jenisCol": "Jenis",
      "jenis_": "Jenis",
      "aspek": "Aspek",
      "referensi": "Referensi",
      "statusLabel": "Status",
      "status": { "tuntas": "Tuntas", "proses": "Proses", "belum": "Belum" },
      "ttdWali": "Wali Kelas",
      "ttdOrtu": "Orang Tua / Wali",
      "empty": "Belum ada data pada periode ini.",
      "pickMuridHint": "Pilih murid untuk menampilkan laporan.",
      "loadFailed": "Gagal memuat laporan."
    },
```

> Note: the component uses `achievement.laporan.jenis` for the *control label* — the Library table's first column header uses `achievement.laporan.jenisCol`. Update the component if you keep both ("Jenis" twice is fine; drop the unused `jenis_` key — it's a duplicate guard, remove it before committing).

`en.json` (same keys):

```json
    "tabLaporan": "Reports",
    "laporan": {
      "murid": "Student",
      "jenis": "Report type",
      "bulanan": "Monthly",
      "semester1": "Semester 1",
      "semester2": "Semester 2",
      "bulan": "Month",
      "tahun": "Year",
      "tahunAjaran": "Academic year",
      "cetak": "Print",
      "unduhExcel": "Download Excel",
      "titleBulanan": "Monthly Report — {{bulan}} {{tahun}}",
      "titleSemester": "Semester {{sem}} Report — {{ta}}",
      "printedOn": "Printed {{date}}",
      "identitas": "Identity",
      "nama": "Name",
      "kode": "Code",
      "kelas": "Class",
      "wali": "Homeroom",
      "kelompok": "Group",
      "kehadiran": "Attendance",
      "hadir": "Present",
      "izinMurid": "Student leave",
      "izinGuru": "Teacher leave",
      "byVn": "Via VN",
      "alfa": "Absent",
      "total": "Total",
      "pctHadir": "% Present",
      "kurikulum": "Curriculum Achievement",
      "legend": "achieved/changed within this period",
      "ringkasan": "Summary",
      "ringkasanLine": "{{tuntas}} completed · {{proses}} in progress · {{belum}} not started · {{pct}}% completed",
      "library": "Library Achievement",
      "jenisCol": "Kind",
      "aspek": "Aspect",
      "referensi": "Reference",
      "statusLabel": "Status",
      "status": { "tuntas": "Completed", "proses": "In progress", "belum": "Not started" },
      "ttdWali": "Homeroom Teacher",
      "ttdOrtu": "Parent / Guardian",
      "empty": "No data for this period.",
      "pickMuridHint": "Pick a student to show the report.",
      "loadFailed": "Failed to load report."
    },
```

- [ ] **Step 2: Fix the component's library "Jenis" header** to `t('achievement.laporan.jenisCol')` in `LaporanRapor.tsx` (it was written as `achievement.laporan.jenis` in Task 6 — change that one `<th>`).

- [ ] **Step 3: Validate + type-check.**

```bash
node -e "for (const f of ['id','en']) JSON.parse(require('fs').readFileSync('web/app/src/locales/'+f+'.json')); console.log('ok')"
make typecheck 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add web/app/src/locales/id.json web/app/src/locales/en.json web/app/src/components/LaporanRapor.tsx
git commit -m "i18n(achievement): laporan rapor strings (id, en)"
```

---

## Task 9: Verify, deploy, PR

**Files:** none

- [ ] **Step 1: Full checks.** `make test` (container) + `make typecheck` — both green.

- [ ] **Step 2: Rebuild dogfood** (always `-p gnrs`):

```bash
cd /home/anchor/Podman/GNRS/.claude/worktrees/laporan-rapor
docker compose -p gnrs up -d --build
podman rm -f gnrs && docker compose -p gnrs up -d
curl -s http://127.0.0.1:8300/healthz   # {"status":"ok"}
```

- [ ] **Step 3: API verification on real data** (login as admin via `/api/auth/login` with `identifier`/`password`):
  - `GET /api/laporan/murid/<muridId>?from=2026-06-01&to=2026-06-30` → 200 JSON with all sections; verify kehadiran counts vs the attendances list; pick a murid with pencapaian and verify status grouping + `changedInPeriod`.
  - Same with `&format=xlsx` → 200, `Content-Type: …spreadsheetml.sheet`, `Content-Disposition` filename, body > 4 KB.
  - As a murid token (or curl with murid creds): own id → 200; other id → 403.

- [ ] **Step 4: UI pass** on `:8300` — Achievement → Laporan tab: pick murid; Bulanan current month renders; print preview shows only the report (controls/nav hidden, A4); Excel downloads; Semester 1/2 produce the correct ranges from the active tahun ajaran (check the kop dates). Chrome DevTools harness unavailable → record manual/API verification in the PR explicitly.

- [ ] **Step 5: PR + merge + cleanup** — push `feat/laporan-rapor`, `gh pr create --base gnrs-evan` with the "Tested" section (note the manual verification), merge once green per CLAUDE.md, then full worktree/branch cleanup.

---

## Self-review notes (author)

- **Spec coverage:** endpoint+auth (T3), xlsx (T4), period resolution FE incl. semester wrap (T7 `semesterRange`), umur tier scoping (T7 `params`), full report sections + print CSS (T6), tab (T7), i18n (T8), edge cases (empty states in T6, no-TA disables semester options in T7, no-kelas "—" in T6), tests+verification (T1/T2/T9). ✔
- **Type consistency:** `laporanResponse` JSON keys ↔ `LaporanResponse` TS ↔ component usage checked; `LaporanParams` ↔ query params ↔ `PencapaianListParams` mapping checked. `jenisCol` mismatch resolved in T8 Step 2. ✔
- **House style:** no handler tests (none exist in repo); store tests reuse `newJadwalDB`/`mkKelas`; Indonesian httpx messages; no migrations; excelize promoted indirect→direct only. ✔
