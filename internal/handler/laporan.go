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

// canSeeMurid mirrors pencapaian.go: admin/staff/pengurus/guru see all; ortu
// sees children matched by parent_email; murid sees only themselves.
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
	KelompokMateri  string  `json:"kelompokMateri,omitempty"`
	Status          string  `json:"status"` // belum|proses|tuntas
	ChangedInPeriod bool    `json:"changedInPeriod"`
	Tanggal         *string `json:"tanggal,omitempty"`
	NilaiAngka      *int    `json:"nilaiAngka,omitempty"`
	NilaiHuruf      string  `json:"nilaiHuruf,omitempty"`
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
	Tuntas    int      `json:"tuntas"`
	Proses    int      `json:"proses"`
	Belum     int      `json:"belum"`
	PctTuntas float64  `json:"pctTuntas"`
	RataNilai *float64 `json:"rataNilai,omitempty"`
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
	if p.Tanggal != nil && len(*p.Tanggal) >= 10 {
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

func (h *Laporan) assemble(r *http.Request, muridID, from, to string) (*laporanResponse, int, string, string) {
	// Murid identity.
	murid, err := h.users.FindByID(r.Context(), muridID)
	if err != nil {
		return nil, http.StatusNotFound, "not_found", "Murid tidak ditemukan"
	}

	muridMap := map[string]any{
		"id":       murid.ID,
		"name":     murid.Name,
		"nickname": murid.Nickname,
		"userCode": murid.UserCode,
		"level":    murid.Level,
		"kelompok": murid.Kelompok,
	}

	// Kelas (nil-safe: no kelas → nil map).
	var kelasMap map[string]any
	k, err := h.kelas.FindByMurid(r.Context(), muridID)
	if err != nil {
		return nil, http.StatusInternalServerError, "internal", "Gagal mencari kelas murid"
	}
	if k != nil {
		kelasMap = map[string]any{
			"id":       k.ID,
			"nama":     k.Nama,
			"tingkat":  k.Tingkat,
			"tahun":    k.Tahun,
			"waliName": k.GuruName,
		}
	}

	// Instansi settings (best-effort — empty string on error).
	instansiName := ""
	instansiLogo := ""
	instansiAlamat := ""
	instansiTitle := ""
	if cfg, err := h.settings.GetAll(r.Context()); err == nil {
		instansiName = cfg["instansi_name"]
		instansiLogo = cfg["instansi_logo"]
		instansiAlamat = cfg["instansi_alamat"]
		instansiTitle = cfg["instansi_title"]
	}
	instansiMap := map[string]any{
		"name":   instansiName,
		"logo":   instansiLogo,
		"alamat": instansiAlamat,
		"title":  instansiTitle,
	}

	periodeMap := map[string]any{
		"from": from,
		"to":   to,
	}

	// Kehadiran.
	counts, err := h.attendances.CountForStudent(r.Context(), muridID, from, to)
	if err != nil {
		return nil, http.StatusInternalServerError, "internal", "Gagal menghitung kehadiran"
	}
	hadir := counts["hadir"]
	izinMurid := counts["izin_murid"]
	izinGuru := counts["izin_guru"]
	byVn := counts["by_vn"]
	alfa := counts["alfa"]
	total := hadir + izinMurid + izinGuru + byVn + alfa
	pctHadir := 0.0
	if total > 0 {
		pctHadir = float64(hadir) * 100.0 / float64(total)
	}
	kehadiran := laporanKehadiran{
		Hadir:     hadir,
		IzinMurid: izinMurid,
		IzinGuru:  izinGuru,
		ByVn:      byVn,
		Alfa:      alfa,
		Total:     total,
		PctHadir:  pctHadir,
	}

	// Kurikulum pencapaian.
	q := r.URL.Query()
	params := store.PencapaianListParams{
		MuridUserID: muridID,
		FromUmur:    intPtr(q.Get("fromUmur")),
		FromSem:     intPtr(q.Get("fromSem")),
		ToUmur:      intPtr(q.Get("toUmur")),
		ToSem:       intPtr(q.Get("toSem")),
	}
	items, err := h.pencapaian.ListForMurid(r.Context(), params)
	if err != nil {
		return nil, http.StatusInternalServerError, "internal", "Gagal mengambil pencapaian"
	}

	// Group by Tema, preserving first-seen order.
	temaOrder := []string{}
	temaMap := map[string]*laporanTema{}
	var tuntas, proses, belum int
	nilaiSum, nilaiCount := 0, 0

	for _, it := range items {
		status := "belum"
		if it.Pencapaian != nil {
			status = it.Pencapaian.Status
		}
		switch status {
		case "tuntas":
			tuntas++
		case "proses":
			proses++
		default:
			belum++
		}

		tema := it.Materi.Tema
		if _, seen := temaMap[tema]; !seen {
			temaOrder = append(temaOrder, tema)
			temaMap[tema] = &laporanTema{Tema: tema, Items: []laporanItem{}}
		}

		var tanggal *string
		if it.Pencapaian != nil && it.Pencapaian.Tanggal != nil {
			tanggal = it.Pencapaian.Tanggal
		}

		var nilaiAngka *int
		nilaiHuruf := ""
		if it.Pencapaian != nil {
			nilaiAngka = it.Pencapaian.NilaiAngka
			if it.Pencapaian.NilaiHuruf != nil {
				nilaiHuruf = *it.Pencapaian.NilaiHuruf
			}
		}
		if nilaiAngka != nil {
			nilaiSum += *nilaiAngka
			nilaiCount++
		}

		kelompok := ""
		if it.Materi.KelompokMateri != nil {
			kelompok = strings.TrimSpace(*it.Materi.KelompokMateri)
		}
		temaMap[tema].Items = append(temaMap[tema].Items, laporanItem{
			Materi:          it.Materi.DetailMateri,
			SubTema:         it.Materi.SubTema,
			KelompokMateri:  kelompok,
			Status:          status,
			ChangedInPeriod: inPeriod(it.Pencapaian, from, to),
			Tanggal:         tanggal,
			NilaiAngka:      nilaiAngka,
			NilaiHuruf:      nilaiHuruf,
		})
	}

	kurikulum := make([]laporanTema, 0, len(temaOrder))
	for _, t := range temaOrder {
		kurikulum = append(kurikulum, *temaMap[t])
	}

	totalItems := tuntas + proses + belum
	pctTuntas := 0.0
	if totalItems > 0 {
		pctTuntas = float64(tuntas) * 100.0 / float64(totalItems)
	}
	var rataNilai *float64
	if nilaiCount > 0 {
		v := float64(int(float64(nilaiSum)/float64(nilaiCount)*10+0.5)) / 10
		rataNilai = &v
	}
	ringkasan := laporanRingkasan{
		Tuntas:    tuntas,
		Proses:    proses,
		Belum:     belum,
		PctTuntas: pctTuntas,
		RataNilai: rataNilai,
	}

	// Library pencapaian.
	libRows, err := h.pencapaian.ListLibraryForMurid(r.Context(), muridID)
	if err != nil {
		return nil, http.StatusInternalServerError, "internal", "Gagal mengambil pencapaian library"
	}

	library := make([]laporanLibrary, 0, len(libRows))
	for i := range libRows {
		row := &libRows[i]
		kind := ""
		if row.LibraryKind != nil {
			kind = *row.LibraryKind
		}
		ref := ""
		if row.LibraryRef != nil {
			ref = *row.LibraryRef
		}
		if kind == "" || ref == "" {
			continue
		}
		library = append(library, laporanLibrary{
			Kind:            kind,
			Aspect:          row.LibraryAspect,
			Ref:             ref,
			Status:          row.Status,
			ChangedInPeriod: inPeriod(row, from, to),
		})
	}

	return &laporanResponse{
		Murid:     muridMap,
		Kelas:     kelasMap,
		Instansi:  instansiMap,
		Periode:   periodeMap,
		Kehadiran: kehadiran,
		Kurikulum: kurikulum,
		Library:   library,
		Ringkasan: ringkasan,
	}, 0, "", ""
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
	// Mirror pencapaian.go: semester filters only accept 1 or 2.
	for _, p := range []string{"fromSem", "toSem"} {
		if v := q.Get(p); v != "" {
			if n, err := strconv.Atoi(v); err != nil || (n != 1 && n != 2) {
				httpx.Error(w, http.StatusBadRequest, "bad_request", p+" harus 1 atau 2")
				return
			}
		}
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
		h.writeXlsx(w, rep)
		return
	}
	httpx.JSON(w, http.StatusOK, rep)
}

