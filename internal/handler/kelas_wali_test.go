package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/fadhilkurnia/ppg-dashboard/internal/auth"
	"github.com/fadhilkurnia/ppg-dashboard/internal/model"
	"github.com/fadhilkurnia/ppg-dashboard/internal/store"
)

func newKelasEnv(t *testing.T) (*Kelas, *store.KelasStore, *store.Users) {
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
	return NewKelas(store.NewKelas(db)), store.NewKelas(db), store.NewUsers(db)
}

// reqWithClaims builds a chi request carrying URL params and auth claims.
func reqWithClaims(method, target string, body any, role model.Role, uid string, urlParams map[string]string) *http.Request {
	var r *http.Request
	if body != nil {
		buf, _ := json.Marshal(body)
		r = httptest.NewRequest(method, target, bytes.NewReader(buf))
	} else {
		r = httptest.NewRequest(method, target, nil)
	}
	rctx := chi.NewRouteContext()
	for k, v := range urlParams {
		rctx.URLParams.Add(k, v)
	}
	ctx := context.WithValue(r.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.ContextWithClaims(ctx, &auth.Claims{UserID: uid, Role: role})
	return r.WithContext(ctx)
}

func mkGuru(t *testing.T, users *store.Users, name string) string {
	t.Helper()
	u, err := users.Create(context.Background(), store.UserCreateInput{
		Email: name + "@t.local", Name: name, Password: "secret123", Role: model.RoleGuru,
	})
	if err != nil {
		t.Fatalf("create guru: %v", err)
	}
	return u.ID
}

func TestWaliCanUpdateOwnKelas(t *testing.T) {
	h, ks, users := newKelasEnv(t)
	waliID := mkGuru(t, users, "wali")
	k, err := ks.Create(context.Background(), store.KelasInput{
		Nama: "Kelas A", Tingkat: "PAUD", Tahun: 2026, GuruUserID: &waliID,
	})
	if err != nil {
		t.Fatalf("create kelas: %v", err)
	}

	// Wali edits name — allowed.
	r := reqWithClaims("PATCH", "/api/kelas/"+k.ID,
		map[string]any{"nama": "Kelas A1", "tingkat": "PAUD", "tahun": 2026},
		model.RoleGuru, waliID, map[string]string{"id": k.ID})
	rr := httptest.NewRecorder()
	h.Update(rr, r)
	if rr.Code != http.StatusOK {
		t.Fatalf("wali update own kelas: got %d body %s", rr.Code, rr.Body.String())
	}

	// Non-wali guru editing — forbidden.
	otherID := mkGuru(t, users, "other")
	r2 := reqWithClaims("PATCH", "/api/kelas/"+k.ID,
		map[string]any{"nama": "Hijack", "tingkat": "PAUD", "tahun": 2026},
		model.RoleGuru, otherID, map[string]string{"id": k.ID})
	rr2 := httptest.NewRecorder()
	h.Update(rr2, r2)
	if rr2.Code != http.StatusForbidden {
		t.Fatalf("non-wali update: got %d want 403", rr2.Code)
	}
}

func TestWaliUpdateCannotReassignPrimary(t *testing.T) {
	h, ks, users := newKelasEnv(t)
	waliID := mkGuru(t, users, "wali")
	thiefTarget := mkGuru(t, users, "target")
	k, err := ks.Create(context.Background(), store.KelasInput{
		Nama: "Kelas B", Tingkat: "PAUD", Tahun: 2026, GuruUserID: &waliID,
	})
	if err != nil {
		t.Fatalf("create kelas: %v", err)
	}

	// Wali tries to set a different primary guru — backend keeps original.
	r := reqWithClaims("PATCH", "/api/kelas/"+k.ID,
		map[string]any{"nama": "Kelas B", "tingkat": "PAUD", "tahun": 2026, "guruUserId": thiefTarget, "guruUserIds": []string{thiefTarget}},
		model.RoleGuru, waliID, map[string]string{"id": k.ID})
	rr := httptest.NewRecorder()
	h.Update(rr, r)
	if rr.Code != http.StatusOK {
		t.Fatalf("update: got %d body %s", rr.Code, rr.Body.String())
	}
	got, _ := ks.Get(context.Background(), k.ID)
	if got.GuruUserID == nil || *got.GuruUserID != waliID {
		t.Fatalf("primary wali must stay %s, got %v", waliID, got.GuruUserID)
	}
}

func TestWaliCannotRemovePrimaryGuru(t *testing.T) {
	h, ks, users := newKelasEnv(t)
	waliID := mkGuru(t, users, "wali")
	k, err := ks.Create(context.Background(), store.KelasInput{
		Nama: "Kelas C", Tingkat: "PAUD", Tahun: 2026, GuruUserID: &waliID,
	})
	if err != nil {
		t.Fatalf("create kelas: %v", err)
	}
	r := reqWithClaims("DELETE", "/api/kelas/"+k.ID+"/guru/"+waliID, nil,
		model.RoleGuru, waliID, map[string]string{"id": k.ID, "guruId": waliID})
	rr := httptest.NewRecorder()
	h.RemoveGuruAnggota(rr, r)
	if rr.Code != http.StatusForbidden {
		t.Fatalf("wali removing primary guru: got %d want 403", rr.Code)
	}
}
