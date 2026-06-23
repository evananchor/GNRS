package store

import (
	"context"
	"testing"
)

func TestIsWaliOfMurid(t *testing.T) {
	db := newJadwalDB(t) // migrated DB helper from jadwal_test.go
	ks := NewKelas(db)
	ctx := context.Background()

	guru := "guru-1"
	other := "guru-2"
	murid := "murid-1"

	kid := mkKelas(t, ks, &guru) // primary guru = guru-1
	if err := ks.AddAnggota(ctx, kid, []string{murid}); err != nil {
		t.Fatalf("add anggota: %v", err)
	}

	ok, err := ks.IsWaliOfMurid(ctx, guru, murid)
	if err != nil || !ok {
		t.Fatalf("guru-1 should be wali of murid-1: ok=%v err=%v", ok, err)
	}
	ok, err = ks.IsWaliOfMurid(ctx, other, murid)
	if err != nil || ok {
		t.Fatalf("guru-2 must NOT be wali of murid-1: ok=%v err=%v", ok, err)
	}
	ok, _ = ks.IsWaliOfMurid(ctx, guru, "nobody")
	if ok {
		t.Fatalf("guru-1 is not wali of an unenrolled murid")
	}
}
