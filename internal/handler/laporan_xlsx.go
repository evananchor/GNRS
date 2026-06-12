package handler

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/xuri/excelize/v2"
)

// safeFilenamePart keeps only ASCII letters, digits, space, dot, dash and
// underscore so a free-text nickname can't break the Content-Disposition
// header (no quotes, CR/LF, or control chars). Spaces collapse to '-'.
func safeFilenamePart(s string) string {
	var b strings.Builder
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9',
			r == '.', r == '-', r == '_':
			b.WriteRune(r)
		case r == ' ':
			b.WriteByte('-')
		}
	}
	out := strings.Trim(b.String(), "-")
	if out == "" {
		return "murid"
	}
	return out
}

// derefStr safely extracts a plain string from a map[string]any value that
// may hold a string, a *string (nil → ""), or nil.
func derefStr(v any) string {
	switch t := v.(type) {
	case string:
		return t
	case *string:
		if t != nil {
			return *t
		}
	}
	return ""
}

// writeXlsx streams the report as a 3-sheet Excel workbook:
// Rapor (identity+kehadiran+ringkasan), Kurikulum, Library.
func (h *Laporan) writeXlsx(w http.ResponseWriter, rep *laporanResponse) {
	f := excelize.NewFile()
	defer f.Close()

	// Sheet 1 — Rapor
	main := "Rapor"
	f.SetSheetName("Sheet1", main)
	row := 1
	set := func(vals ...any) {
		for i, v := range vals {
			cell, _ := excelize.CoordinatesToCellName(i+1, row)
			_ = f.SetCellValue(main, cell, v)
		}
		row++
	}
	set("Laporan Pencapaian")
	set("Periode", fmt.Sprintf("%v s/d %v", rep.Periode["from"], rep.Periode["to"]))
	set("Instansi", rep.Instansi["name"])
	row++
	set("Nama", derefStr(rep.Murid["name"]))
	set("Panggilan", derefStr(rep.Murid["nickname"]))
	set("Kode", derefStr(rep.Murid["userCode"]))
	if rep.Kelas != nil {
		set("Kelas", derefStr(rep.Kelas["nama"]), "Wali", derefStr(rep.Kelas["waliName"]))
	}
	row++
	set("Kehadiran", "Hadir", "Izin Murid", "Izin Guru", "Via VN", "Alfa", "Total", "% Hadir")
	set("", rep.Kehadiran.Hadir, rep.Kehadiran.IzinMurid, rep.Kehadiran.IzinGuru,
		rep.Kehadiran.ByVn, rep.Kehadiran.Alfa, rep.Kehadiran.Total,
		fmt.Sprintf("%.1f%%", rep.Kehadiran.PctHadir))
	row++
	set("Ringkasan", "Tuntas", "Proses", "Belum", "% Tuntas")
	set("", rep.Ringkasan.Tuntas, rep.Ringkasan.Proses, rep.Ringkasan.Belum,
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

	nick := derefStr(rep.Murid["nickname"])
	if nick == "" {
		nick = derefStr(rep.Murid["name"])
	}
	fname := fmt.Sprintf("rapor-%s-%v_%v.xlsx", safeFilenamePart(nick), rep.Periode["from"], rep.Periode["to"])
	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	w.Header().Set("Content-Disposition", `attachment; filename="`+fname+`"`)
	_ = f.Write(w)
}
