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
