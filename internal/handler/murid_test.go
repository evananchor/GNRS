package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/fadhilkurnia/ppg-dashboard/internal/model"
	"github.com/fadhilkurnia/ppg-dashboard/internal/store"
)

func TestCreateOrtuForcesRole(t *testing.T) {
	h, _, users := newMuridEnv(t)
	waliID := mkGuru(t, users, "wali")
	// Even if the body says role=admin, server forces ortu.
	r := reqWithClaims("POST", "/api/ortu",
		map[string]any{"name": "Bunda", "role": "admin", "noHp": "0822", "phoneRegion": "ID"},
		model.RoleGuru, waliID, nil)
	rr := httptest.NewRecorder()
	h.CreateOrtu(rr, r)
	if rr.Code != http.StatusCreated {
		t.Fatalf("create ortu: got %d body %s", rr.Code, rr.Body.String())
	}
	res, _ := users.List(context.Background(), store.UserListParams{Role: "ortu", Limit: 10})
	if res.Total < 1 {
		t.Fatalf("ortu not created")
	}
	for _, u := range res.Items {
		if u.Name == "Bunda" && u.Role != model.RoleOrtu {
			t.Fatalf("role not forced to ortu: %s", u.Role)
		}
	}
}

func newMuridEnv(t *testing.T) (*Murid, *store.KelasStore, *store.Users) {
	t.Helper()
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := store.Migrate(db); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	ks := store.NewKelas(db)
	users := store.NewUsers(db)
	return NewMurid(users, ks), ks, users
}

func mkMurid(t *testing.T, users *store.Users, name string) string {
	t.Helper()
	u, err := users.Create(context.Background(), store.UserCreateInput{
		Email: name + "@t.local", Name: name, Password: "secret123", Role: model.RoleMurid,
	})
	if err != nil {
		t.Fatalf("create murid: %v", err)
	}
	return u.ID
}

func TestWaliUpdatesOwnStudentProfile(t *testing.T) {
	h, ks, users := newMuridEnv(t)
	waliID := mkGuru(t, users, "wali")        // from kelas_wali_test.go
	muridID := mkMurid(t, users, "andi")
	k, _ := ks.Create(context.Background(), store.KelasInput{
		Nama: "K", Tingkat: "PAUD", Tahun: 2026, GuruUserID: &waliID,
	})
	_ = ks.AddAnggota(context.Background(), k.ID, []string{muridID})

	r := reqWithClaims("PATCH", "/api/murid/"+muridID,
		map[string]any{"name": "Andi B", "noHp": "0811"},
		model.RoleGuru, waliID, map[string]string{"id": muridID})
	rr := httptest.NewRecorder()
	h.Update(rr, r)
	if rr.Code != http.StatusOK {
		t.Fatalf("wali update own student: got %d body %s", rr.Code, rr.Body.String())
	}
	got, _ := users.FindByID(context.Background(), muridID)
	if got.Name != "Andi B" {
		t.Fatalf("name not updated: %q", got.Name)
	}
}

func TestWaliCannotUpdateForeignStudent(t *testing.T) {
	h, _, users := newMuridEnv(t)
	waliID := mkGuru(t, users, "wali")
	muridID := mkMurid(t, users, "budi") // not enrolled in any wali class
	r := reqWithClaims("PATCH", "/api/murid/"+muridID,
		map[string]any{"name": "Hijack"},
		model.RoleGuru, waliID, map[string]string{"id": muridID})
	rr := httptest.NewRecorder()
	h.Update(rr, r)
	if rr.Code != http.StatusForbidden {
		t.Fatalf("wali editing foreign student: got %d want 403", rr.Code)
	}
}

func TestWaliLinksOrtu(t *testing.T) {
	h, ks, users := newMuridEnv(t)
	waliID := mkGuru(t, users, "wali")
	muridID := mkMurid(t, users, "citra")
	ortu, _ := users.Create(context.Background(), store.UserCreateInput{
		Email: "ayah@t.local", Name: "Ayah", Password: "secret123", Role: model.RoleOrtu,
	})
	k, _ := ks.Create(context.Background(), store.KelasInput{
		Nama: "K", Tingkat: "PAUD", Tahun: 2026, GuruUserID: &waliID,
	})
	_ = ks.AddAnggota(context.Background(), k.ID, []string{muridID})

	r := reqWithClaims("PATCH", "/api/murid/"+muridID,
		map[string]any{"ayahId": ortu.ID},
		model.RoleGuru, waliID, map[string]string{"id": muridID})
	rr := httptest.NewRecorder()
	h.Update(rr, r)
	if rr.Code != http.StatusOK {
		t.Fatalf("link ortu: got %d body %s", rr.Code, rr.Body.String())
	}
	links, _ := users.GetMuridOrtu(context.Background(), muridID)
	if len(links) != 1 || links[0].Relation != "ayah" || links[0].User.ID != ortu.ID {
		t.Fatalf("ortu not linked: %+v", links)
	}
}
