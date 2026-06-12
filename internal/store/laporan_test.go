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

func TestKelasFindByMuridPrefersLatestTahun(t *testing.T) {
	db := newJadwalDB(t)
	ks := NewKelas(db)
	older, err := ks.Create(context.Background(), KelasInput{Nama: "Lama", Tingkat: "PAUD", Tahun: 2025})
	if err != nil {
		t.Fatalf("create older: %v", err)
	}
	newer, err := ks.Create(context.Background(), KelasInput{Nama: "Baru", Tingkat: "PAUD", Tahun: 2026})
	if err != nil {
		t.Fatalf("create newer: %v", err)
	}
	for _, kid := range []string{older.ID, newer.ID} {
		if _, err := db.Exec(`INSERT INTO kelas_anggota (kelas_id, murid_user_id) VALUES (?, ?)`, kid, "MURID02"); err != nil {
			t.Fatalf("seed anggota: %v", err)
		}
	}
	k, err := ks.FindByMurid(context.Background(), "MURID02")
	if err != nil || k == nil || k.ID != newer.ID {
		t.Fatalf("expected latest-tahun kelas %s, got %+v err=%v", newer.ID, k, err)
	}
}

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
	seed("A4", "2026-07-01", "hadir") // outside range (after `to`)
	// Live rows are written via Create as a time.Time, which go-sqlite3 stores
	// as "YYYY-MM-DD 00:00:00+00:00". One sits exactly on the `to` boundary and
	// one on the `from` boundary — both MUST be counted (regression guard for
	// the raw-string vs date() comparison bug).
	seed("A5", "2026-06-30 00:00:00+00:00", "hadir") // to-boundary, timestamp form
	seed("A6", "2026-06-01 00:00:00+00:00", "izin_murid")
	counts, err := at.CountForStudent(context.Background(), "MURID01", "2026-06-01", "2026-06-30")
	if err != nil {
		t.Fatalf("count: %v", err)
	}
	if counts["hadir"] != 3 || counts["alfa"] != 1 || counts["izin_murid"] != 1 {
		t.Fatalf("bad counts: %+v", counts)
	}
}
