# Wali Kelas Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a homeroom teacher (wali = a class's primary `guru_user_id`) manage their own class and its students' parent (ortu) links and safe profile fields, with admins keeping full power.

**Architecture:** No DB migration — reuse `kelas.guru_user_id`, `kelas_anggota`, `kelas_guru`, `murid_ortu`. Add two authz helpers mirroring the existing `canManageJadwal`. Move kelas mutation routes from the admin-only group to an admin-or-guru group, gating ownership inside each handler. Add dedicated `/murid/{id}` and `/ortu` endpoints so the admin-only `/users/*` routes are never opened — the DTO for the murid endpoint **is** the field whitelist (no role/password/identity fields exist on it). Frontend reuses `OrtuPicker` and the kelas dialogs, widening `isAdmin` gates to `isAdmin || isWali`, and points ortu search/create at the new `/ortu` endpoints.

**Tech Stack:** Go + chi + SQLite (`internal/store`, `internal/handler`, `internal/auth`); Vite + React 18 + TanStack Query + react-hook-form + Tailwind (`web/app/src`).

## Global Constraints

- Go module: `github.com/fadhilkurnia/ppg-dashboard`. Roles: `model.RoleAdmin`, `model.RoleGuru`, `model.RoleMurid`, `model.RoleOrtu` (`internal/model/model.go:46-59`).
- Wali = primary guru only: `kelas.guru_user_id == claims.UserID`. Secondary `kelas_guru` members are NOT wali.
- Admin keeps every existing power. Wali additions are scoped, never escalating.
- Wali must NOT: delete a class, create a class, reassign the primary wali (`guru_user_id`), remove the primary guru, or change a student's `role`/`password`/`active`/`email`/`username`/`user_code`.
- Test harness: store tests use `store.Open(filepath.Join(t.TempDir(),"test.db"))` then `store.Migrate(db)`. Handler tests live in package `handler`, use `net/http/httptest`, and inject auth claims via `auth.ContextWithClaims` (added in Task 1).
- Commit conventional subjects ≤50 chars, imperative; one concern per commit; end commit messages with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer.
- Run `make test` and `make typecheck` before pushing.

---

## Phase 1 — Backend authz foundation

### Task 1: `RequireAnyRole` middleware + claims injector

**Files:**
- Modify: `internal/auth/middleware.go`
- Test: `internal/auth/anyrole_test.go` (create)

**Interfaces:**
- Produces: `auth.RequireAnyRole(roles ...model.Role) func(http.Handler) http.Handler`; `auth.ContextWithClaims(ctx context.Context, c *Claims) context.Context`.

- [ ] **Step 1: Write the failing test**

Create `internal/auth/anyrole_test.go`:

```go
package auth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/fadhilkurnia/ppg-dashboard/internal/model"
)

func TestRequireAnyRole(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusOK) })
	mw := RequireAnyRole(model.RoleAdmin, model.RoleGuru)

	cases := []struct {
		role model.Role
		want int
	}{
		{model.RoleAdmin, http.StatusOK},
		{model.RoleGuru, http.StatusOK},
		{model.RoleMurid, http.StatusForbidden},
	}
	for _, c := range cases {
		req := httptest.NewRequest("GET", "/", nil)
		req = req.WithContext(ContextWithClaims(req.Context(), &Claims{UserID: "u1", Role: c.role}))
		rr := httptest.NewRecorder()
		mw(next).ServeHTTP(rr, req)
		if rr.Code != c.want {
			t.Fatalf("role %s: got %d want %d", c.role, rr.Code, c.want)
		}
	}

	// No claims at all → forbidden.
	rr := httptest.NewRecorder()
	mw(next).ServeHTTP(rr, httptest.NewRequest("GET", "/", nil))
	if rr.Code != http.StatusForbidden {
		t.Fatalf("no claims: got %d want 403", rr.Code)
	}
	_ = context.Background()
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/auth/ -run TestRequireAnyRole -v`
Expected: FAIL — `undefined: RequireAnyRole` / `undefined: ContextWithClaims`.

- [ ] **Step 3: Write minimal implementation**

In `internal/auth/middleware.go`, add the injector and generalize role checking. Replace the body of `Middleware`'s `context.WithValue` line to use the new helper, and add both functions:

```go
// ContextWithClaims returns a child context carrying the given claims. Used by
// Middleware and by tests/handlers that need to set claims directly.
func ContextWithClaims(ctx context.Context, c *Claims) context.Context {
	return context.WithValue(ctx, claimsKey, c)
}

// RequireAnyRole allows the request through if the caller's role matches any of
// the given roles; otherwise 403.
func RequireAnyRole(roles ...model.Role) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			c, ok := ClaimsFrom(r.Context())
			if !ok || c == nil {
				httpx.Error(w, http.StatusForbidden, "forbidden", "Akses tidak diizinkan")
				return
			}
			for _, role := range roles {
				if c.Role == role {
					next.ServeHTTP(w, r)
					return
				}
			}
			httpx.Error(w, http.StatusForbidden, "forbidden", "Akses tidak diizinkan")
		})
	}
}
```

And change the existing line in `Middleware` from
`ctx := context.WithValue(r.Context(), claimsKey, claims)` to
`ctx := ContextWithClaims(r.Context(), claims)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./internal/auth/ -run TestRequireAnyRole -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add internal/auth/middleware.go internal/auth/anyrole_test.go
git commit -m "feat(auth): add RequireAnyRole and ContextWithClaims"
```

---

### Task 2: `IsWaliOfMurid` store method

**Files:**
- Modify: `internal/store/kelas.go`
- Test: `internal/store/kelas_wali_test.go` (create)

**Interfaces:**
- Consumes: `store.NewKelas(db)`, `store.KelasStore.Create`, `store.KelasStore.AddAnggota`.
- Produces: `(*KelasStore).IsWaliOfMurid(ctx context.Context, guruID, muridID string) (bool, error)`.

- [ ] **Step 1: Write the failing test**

Create `internal/store/kelas_wali_test.go`:

```go
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/store/ -run TestIsWaliOfMurid -v`
Expected: FAIL — `ks.IsWaliOfMurid undefined`.

- [ ] **Step 3: Write minimal implementation**

Append to `internal/store/kelas.go`:

```go
// IsWaliOfMurid reports whether guruID is the primary guru (wali) of any class
// that muridID is enrolled in.
func (s *KelasStore) IsWaliOfMurid(ctx context.Context, guruID, muridID string) (bool, error) {
	var exists int
	err := s.db.QueryRowContext(ctx,
		`SELECT EXISTS(
		   SELECT 1 FROM kelas_anggota a
		   JOIN kelas k ON k.id = a.kelas_id
		   WHERE a.murid_user_id = ? AND k.guru_user_id = ?
		 )`, muridID, guruID).Scan(&exists)
	if err != nil {
		return false, err
	}
	return exists == 1, nil
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./internal/store/ -run TestIsWaliOfMurid -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add internal/store/kelas.go internal/store/kelas_wali_test.go
git commit -m "feat(store): add IsWaliOfMurid wali lookup"
```

---

## Phase 2 — Backend: wali can manage their own class

### Task 3: Gate kelas Update / anggota / guru handlers as admin-or-wali

**Files:**
- Modify: `internal/handler/kelas.go`
- Modify: `cmd/server/main.go` (move routes from `adm` group to a new `mng` group)
- Test: `internal/handler/kelas_wali_test.go` (create)

**Interfaces:**
- Consumes: `auth.ContextWithClaims`, `store.KelasStore`, `(*Kelas).canManageJadwal` pattern.
- Produces: `(*Kelas).canManageKelas(w, r, id) *store.Kelas`; gated `Update`, `AddAnggota`, `RemoveAnggota`, `AddGuruAnggota`, `RemoveGuruAnggota`.

Behavior rules enforced:
- `canManageKelas`: admin OR `k.GuruUserID == claims.UserID`.
- `Update` by a non-admin: keep the existing primary guru (ignore any `guruUserId` in the body) so wali cannot reassign wali-ship; descriptive fields + co-teacher set may change.
- `RemoveGuruAnggota` by a non-admin removing the current primary guru: 403.

- [ ] **Step 1: Write the failing test**

Create `internal/handler/kelas_wali_test.go`:

```go
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
	k, _ := ks.Create(context.Background(), store.KelasInput{
		Nama: "Kelas B", Tingkat: "PAUD", Tahun: 2026, GuruUserID: &waliID,
	})

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
	k, _ := ks.Create(context.Background(), store.KelasInput{
		Nama: "Kelas C", Tingkat: "PAUD", Tahun: 2026, GuruUserID: &waliID,
	})
	r := reqWithClaims("DELETE", "/api/kelas/"+k.ID+"/guru/"+waliID, nil,
		model.RoleGuru, waliID, map[string]string{"id": k.ID, "guruId": waliID})
	rr := httptest.NewRecorder()
	h.RemoveGuruAnggota(rr, r)
	if rr.Code != http.StatusForbidden {
		t.Fatalf("wali removing primary guru: got %d want 403", rr.Code)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/handler/ -run 'TestWali' -v`
Expected: FAIL — `h.Update` returns 200 for non-wali / reassigns primary / removes primary (no gating yet).

- [ ] **Step 3: Write minimal implementation**

In `internal/handler/kelas.go`, the existing `canManageJadwal` already performs
exactly this authz (load kelas → admin-or-primary-guru). **Do not duplicate it.**
Rename it to `canManageKelas` and reuse it for both jadwal and kelas mutations:

- Rename the function `canManageJadwal` → `canManageKelas` (line ~70) and update
  its doc comment to say "kelas management" rather than "jadwal".
- Update its three existing callers in `PutJadwal`, `DeleteJadwal`,
  `GenerateJadwal` (lines ~105/137/149): `h.canManageJadwal(w, r, id)` →
  `h.canManageKelas(w, r, id)`.

The renamed helper (unchanged body):

```go
// canManageKelas loads the kelas and authorizes the caller as admin OR the
// kelas wali (primary guru). On failure it writes the response and returns nil.
func (h *Kelas) canManageKelas(w http.ResponseWriter, r *http.Request, id string) *store.Kelas {
	// ...body identical to the former canManageJadwal...
}
```

Add the small admin-check helper used by the wali guardrails:

```go
func isAdminClaims(r *http.Request) bool {
	c, ok := auth.ClaimsFrom(r.Context())
	return ok && c != nil && c.Role == model.RoleAdmin
}
```

In `Update`, gate first and preserve the primary for non-admins. Replace the start of `Update` (after `id := chi.URLParam(...)`) so it reads:

```go
func (h *Kelas) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	existing := h.canManageKelas(w, r, id)
	if existing == nil {
		return
	}
	in, err := h.parse(r)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	// Non-admins (wali) may not reassign the primary wali. Force the existing
	// primary and guarantee it stays in the guru set.
	if !isAdminClaims(r) {
		in.GuruUserID = existing.GuruUserID
		if existing.GuruUserID != nil {
			has := false
			for _, g := range in.GuruUserIDs {
				if g == *existing.GuruUserID {
					has = true
					break
				}
			}
			if !has {
				in.GuruUserIDs = append([]string{*existing.GuruUserID}, in.GuruUserIDs...)
			}
		}
	}
	k, err := h.k.Update(r.Context(), id, in)
	// ...unchanged from here (the existing error handling + httpx.JSON)...
```

Keep the rest of `Update` (error handling, `httpx.JSON(w, http.StatusOK, k)`) as-is.

Add a one-line gate at the top of `AddAnggota`, `RemoveAnggota`, `AddGuruAnggota` (after their `id := chi.URLParam(r, "id")`):

```go
	if h.canManageKelas(w, r, id) == nil {
		return
	}
```

For `RemoveGuruAnggota`, gate AND protect the primary for non-admins. After `guruID := chi.URLParam(r, "guruId")`:

```go
	k := h.canManageKelas(w, r, id)
	if k == nil {
		return
	}
	if !isAdminClaims(r) && k.GuruUserID != nil && *k.GuruUserID == guruID {
		httpx.Error(w, http.StatusForbidden, "forbidden",
			"Wali tidak bisa menghapus guru utama kelas")
		return
	}
```

In `cmd/server/main.go`, create a new admin-or-guru group and move these five routes into it. Add right after the `usersH`/`photosH` setup (around line 358), before the `adm` group:

```go
				p.Group(func(mng chi.Router) {
					mng.Use(auth.RequireAnyRole(model.RoleAdmin, model.RoleGuru))
					mng.Patch("/kelas/{id}", kelasH.Update)
					mng.Post("/kelas/{id}/anggota", kelasH.AddAnggota)
					mng.Delete("/kelas/{id}/anggota/{muridId}", kelasH.RemoveAnggota)
					mng.Post("/kelas/{id}/guru", kelasH.AddGuruAnggota)
					mng.Delete("/kelas/{id}/guru/{guruId}", kelasH.RemoveGuruAnggota)
				})
```

Then DELETE these five now-duplicate lines from the `adm` group (lines 404 and 406-409):

```go
					adm.Patch("/kelas/{id}", kelasH.Update)
					adm.Post("/kelas/{id}/anggota", kelasH.AddAnggota)
					adm.Delete("/kelas/{id}/anggota/{muridId}", kelasH.RemoveAnggota)
					adm.Post("/kelas/{id}/guru", kelasH.AddGuruAnggota)
					adm.Delete("/kelas/{id}/guru/{guruId}", kelasH.RemoveGuruAnggota)
```

Keep `adm.Post("/kelas", kelasH.Create)` and `adm.Delete("/kelas/{id}", kelasH.Delete)` in the admin group. Ensure `model` is imported in `main.go` (it is used elsewhere; confirm with `goimports`).

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./internal/handler/ -run 'TestWali' -v`
Expected: PASS (all three).

- [ ] **Step 5: Commit**

```bash
git add internal/handler/kelas.go cmd/server/main.go internal/handler/kelas_wali_test.go
git commit -m "feat(kelas): allow wali to manage own class"
```

---

## Phase 3 — Backend: wali manages students' profile + ortu

### Task 4: `/murid/{id}` GET + PATCH (safe profile + ortu links)

**Files:**
- Create: `internal/handler/murid.go`
- Modify: `cmd/server/main.go` (register routes in the `mng` group; construct handler)
- Test: `internal/handler/murid_test.go` (create)

**Interfaces:**
- Consumes: `store.Users` (`FindByID`, `Update`, `GetMuridOrtu`, `SetMuridOrtu`, `RemoveMuridOrtu`), `store.KelasStore.IsWaliOfMurid`, `auth.ClaimsFrom`, helpers `parseOptDate`/`isValidLevel` (already in `internal/handler/users.go`, same package).
- Produces: `handler.NewMurid(users *store.Users, kelas *store.KelasStore) *Murid` with methods `Get(w,r)` and `Update(w,r)`.

The DTO is the whitelist: `muridUpdateBody` has no `role`/`active`/`email`/`username`/`password`/`userCode` fields, so a wali physically cannot set them.

- [ ] **Step 1: Write the failing test**

Create `internal/handler/murid_test.go`:

```go
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/handler/ -run 'TestWali(Updates|Cannot|Links)' -v`
Expected: FAIL — `NewMurid` / `Murid` undefined.

- [ ] **Step 3: Write minimal implementation**

Create `internal/handler/murid.go`:

```go
package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-playground/validator/v10"

	"github.com/fadhilkurnia/ppg-dashboard/internal/auth"
	"github.com/fadhilkurnia/ppg-dashboard/internal/httpx"
	"github.com/fadhilkurnia/ppg-dashboard/internal/model"
	"github.com/fadhilkurnia/ppg-dashboard/internal/store"
)

// Murid is the wali/admin-scoped student endpoint. It deliberately exposes only
// safe profile fields plus ortu links — never role, password, or login identity.
type Murid struct {
	users     *store.Users
	kelas     *store.KelasStore
	validator *validator.Validate
}

func NewMurid(users *store.Users, kelas *store.KelasStore) *Murid {
	return &Murid{users: users, kelas: kelas, validator: validator.New()}
}

// canManageMurid authorizes admin OR the wali of a class the murid is in.
// Returns false (and writes the response) when unauthorized or target missing.
func (h *Murid) canManageMurid(w http.ResponseWriter, r *http.Request, id string) bool {
	target, err := h.users.FindByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Murid tidak ditemukan")
		} else {
			httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil data murid")
		}
		return false
	}
	if target.Role != model.RoleMurid {
		httpx.Error(w, http.StatusNotFound, "not_found", "Murid tidak ditemukan")
		return false
	}
	claims, ok := auth.ClaimsFrom(r.Context())
	if !ok || claims == nil {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "Sesi tidak ditemukan")
		return false
	}
	if claims.Role == model.RoleAdmin {
		return true
	}
	isWali, err := h.kelas.IsWaliOfMurid(r.Context(), claims.UserID, id)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal memeriksa hak akses")
		return false
	}
	if !isWali {
		httpx.Error(w, http.StatusForbidden, "forbidden", "Akses tidak diizinkan")
		return false
	}
	return true
}

func (h *Murid) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if !h.canManageMurid(w, r, id) {
		return
	}
	u, err := h.users.FindByID(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil data murid")
		return
	}
	links, err := h.users.GetMuridOrtu(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "ortu_fetch", err.Error())
		return
	}
	u.Ortu = links
	httpx.JSON(w, http.StatusOK, u)
}

// muridUpdateBody is the whitelist: only safe profile fields + ortu links.
type muridUpdateBody struct {
	Name        *string `json:"name,omitempty"        validate:"omitempty,max=200"`
	Nickname    *string `json:"nickname,omitempty"    validate:"omitempty,max=200"`
	DateOfBirth *string `json:"dateOfBirth,omitempty"`
	Gender      *string `json:"gender,omitempty"      validate:"omitempty,oneof=male female"`
	NoHP        *string `json:"noHp,omitempty"        validate:"omitempty,max=64"`
	PhoneRegion *string `json:"phoneRegion,omitempty" validate:"omitempty,oneof=ID SG US CA"`
	Alamat      *string `json:"alamat,omitempty"      validate:"omitempty,max=500"`
	Level       *string `json:"level,omitempty"`
	TempatLahir *string `json:"tempatLahir,omitempty" validate:"omitempty,max=120"`
	Notes       *string `json:"notes,omitempty"       validate:"omitempty,max=2000"`

	AyahID      *string `json:"ayahId,omitempty"`
	ClearAyahID bool    `json:"clearAyahId,omitempty"`
	IbuID       *string `json:"ibuId,omitempty"`
	ClearIbuID  bool    `json:"clearIbuId,omitempty"`
}

func (h *Murid) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if !h.canManageMurid(w, r, id) {
		return
	}
	var b muridUpdateBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Format permintaan tidak valid")
		return
	}
	if err := h.validator.Struct(b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}

	in := store.UserUpdateInput{
		Name:        b.Name,
		Nickname:    b.Nickname,
		NoHP:        b.NoHP,
		Alamat:      b.Alamat,
		PhoneRegion: b.PhoneRegion,
		TempatLahir: b.TempatLahir,
		Notes:       b.Notes,
		Gender:      b.Gender,
	}
	if b.Level != nil {
		if *b.Level == "" {
			in.ClearLevel = true
		} else if isValidLevel(*b.Level) {
			lvl := model.StudentLevel(*b.Level)
			in.Level = &lvl
		} else {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "Level tidak valid")
			return
		}
	}
	if b.DateOfBirth != nil {
		if *b.DateOfBirth == "" {
			in.ClearDateOfBirth = true
		} else if d, ok := parseOptDate(b.DateOfBirth); ok && d != nil {
			in.DateOfBirth = d
		} else {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "Format tanggal lahir tidak valid (YYYY-MM-DD)")
			return
		}
	}

	u, err := h.users.Update(r.Context(), id, in)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Murid tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal memperbarui murid")
		return
	}

	if b.ClearAyahID {
		_ = h.users.RemoveMuridOrtu(r.Context(), id, "ayah")
	} else if b.AyahID != nil && *b.AyahID != "" {
		if err := h.users.SetMuridOrtu(r.Context(), id, "ayah", *b.AyahID); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menghubungkan ortu ayah")
			return
		}
	}
	if b.ClearIbuID {
		_ = h.users.RemoveMuridOrtu(r.Context(), id, "ibu")
	} else if b.IbuID != nil && *b.IbuID != "" {
		if err := h.users.SetMuridOrtu(r.Context(), id, "ibu", *b.IbuID); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menghubungkan ortu ibu")
			return
		}
	}
	links, err := h.users.GetMuridOrtu(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "ortu_fetch", err.Error())
		return
	}
	u.Ortu = links
	httpx.JSON(w, http.StatusOK, u)
}
```

In `cmd/server/main.go`, construct the handler near `usersH` (line ~354) and register in the `mng` group from Task 3:

```go
				muridH := handler.NewMurid(users, kelas)
```

```go
					mng.Get("/murid/{id}", muridH.Get)
					mng.Patch("/murid/{id}", muridH.Update)
```

> Note: `store.UserUpdateInput` already has `ClearLevel`, `ClearDateOfBirth`, `Gender`, `TempatLahir`, `Notes`, `PhoneRegion` (see `internal/handler/users.go:317-365` building the same struct). If any referenced field name differs, match the field used in `users.go`.

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./internal/handler/ -run 'TestWali(Updates|Cannot|Links)' -v`
Expected: PASS (all three).

- [ ] **Step 5: Commit**

```bash
git add internal/handler/murid.go cmd/server/main.go internal/handler/murid_test.go
git commit -m "feat(murid): wali-scoped student profile and ortu endpoints"
```

---

### Task 5: `/ortu` search + create (role forced)

**Files:**
- Modify: `internal/handler/murid.go` (add `SearchOrtu`, `CreateOrtu`)
- Modify: `cmd/server/main.go` (register in `mng` group)
- Test: `internal/handler/murid_test.go` (add cases)

**Interfaces:**
- Consumes: `store.Users.List(ctx, store.UserListParams)`, `store.Users.Create(ctx, store.UserCreateInput)`.
- Produces: `(*Murid).SearchOrtu(w,r)` → `GET /ortu?q=`; `(*Murid).CreateOrtu(w,r)` → `POST /ortu`.

`CreateOrtu` forces `Role = model.RoleOrtu` regardless of the request, so a wali can never create a privileged user.

- [ ] **Step 1: Write the failing test**

Add to `internal/handler/murid_test.go`:

```go
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
```

> If `store.Users.List` returns a type whose fields differ from `.Total`/`.Items`, match the names used in `internal/handler/users.go:127` (`res, err := h.users.List(...)`). Adjust the assertion accordingly.

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/handler/ -run TestCreateOrtuForcesRole -v`
Expected: FAIL — `h.CreateOrtu` undefined.

- [ ] **Step 3: Write minimal implementation**

Add to `internal/handler/murid.go` (and `strings` to imports):

```go
func (h *Murid) SearchOrtu(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	res, err := h.users.List(r.Context(), store.UserListParams{
		Query: strings.TrimSpace(q.Get("q")),
		Role:  string(model.RoleOrtu),
		Limit: limit,
	})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mencari ortu")
		return
	}
	httpx.JSON(w, http.StatusOK, res)
}

type ortuCreateBody struct {
	Name        string  `json:"name"        validate:"required,max=200"`
	NoHP        *string `json:"noHp,omitempty"        validate:"omitempty,max=64"`
	PhoneRegion *string `json:"phoneRegion,omitempty" validate:"omitempty,oneof=ID SG US CA"`
}

func (h *Murid) CreateOrtu(w http.ResponseWriter, r *http.Request) {
	var b ortuCreateBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Format permintaan tidak valid")
		return
	}
	b.Name = strings.TrimSpace(b.Name)
	if err := h.validator.Struct(b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	region := "ID"
	if b.PhoneRegion != nil && *b.PhoneRegion != "" {
		region = *b.PhoneRegion
	}
	in := store.UserCreateInput{
		Email:       "ortu." + ulid.Make().String() + "@placeholder.local",
		Name:        b.Name,
		Password:    ulid.Make().String(), // unusable placeholder; ortu has no login UI
		Role:        model.RoleOrtu,       // forced — never trust the client
		NoHP:        b.NoHP,
		PhoneRegion: region,
	}
	u, err := h.users.Create(r.Context(), in)
	if err != nil {
		if isUniqueConflict(err) {
			httpx.Error(w, http.StatusConflict, "conflict", "Ortu sudah terdaftar")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menyimpan ortu")
		return
	}
	httpx.JSON(w, http.StatusCreated, u)
}
```

Add imports to `internal/handler/murid.go`: `"strconv"`, `"strings"`, and `"github.com/oklog/ulid/v2"`. (`isUniqueConflict` is already defined in `internal/handler/users.go`, same package.)

In `cmd/server/main.go`, register in the `mng` group:

```go
					mng.Get("/ortu", muridH.SearchOrtu)
					mng.Post("/ortu", muridH.CreateOrtu)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./internal/handler/ -run TestCreateOrtuForcesRole -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add internal/handler/murid.go cmd/server/main.go internal/handler/murid_test.go
git commit -m "feat(ortu): wali-scoped ortu search and create"
```

---

## Phase 4 — Frontend wiring

### Task 6: API client functions for murid + ortu

**Files:**
- Create: `web/app/src/api/murid.ts`

**Interfaces:**
- Consumes: `apiFetch` (`web/app/src/api/client.ts`), `ManagedUser`, `ManagedUserList`, `PhoneRegion` (`web/app/src/api/users.ts`).
- Produces: `getMurid(id)`, `updateMurid(id, input)`, `searchOrtu(q)`, `createOrtu(input)`.

- [ ] **Step 1: Write the implementation** (no separate unit test — exercised via typecheck + the Chrome DevTools flow in Task 10)

Create `web/app/src/api/murid.ts`:

```ts
import { apiFetch } from './client'
import type { ManagedUser, ManagedUserList, PhoneRegion, StudentLevel, Gender } from './users'

export type MuridUpdateInput = {
  name?: string
  nickname?: string
  dateOfBirth?: string
  gender?: Gender
  noHp?: string
  phoneRegion?: PhoneRegion
  alamat?: string
  level?: StudentLevel | ''
  tempatLahir?: string
  notes?: string
  ayahId?: string
  clearAyahId?: boolean
  ibuId?: string
  clearIbuId?: boolean
}

export function getMurid(id: string) {
  return apiFetch<ManagedUser>(`/api/murid/${encodeURIComponent(id)}`)
}

export function updateMurid(id: string, input: MuridUpdateInput) {
  return apiFetch<ManagedUser>(`/api/murid/${encodeURIComponent(id)}`, { method: 'PATCH', body: input })
}

export function searchOrtu(q: string, limit = 20) {
  const sp = new URLSearchParams()
  if (q) sp.set('q', q)
  sp.set('limit', String(limit))
  return apiFetch<ManagedUserList>(`/api/ortu?${sp.toString()}`)
}

export function createOrtu(input: { name: string; noHp?: string; phoneRegion?: PhoneRegion }) {
  return apiFetch<ManagedUser>('/api/ortu', { method: 'POST', body: input })
}
```

- [ ] **Step 2: Typecheck**

Run: `cd web/app && npx tsc --noEmit`
Expected: no new errors from this file.

- [ ] **Step 3: Commit**

```bash
git add web/app/src/api/murid.ts
git commit -m "feat(web): add murid and ortu api client"
```

---

### Task 7: Point OrtuPicker at `/ortu`; widen edit dialog to wali

**Files:**
- Modify: `web/app/src/components/OrtuPicker.tsx`
- Modify: `web/app/src/pages/sections/KelasListSection.tsx` (guru picker source)

**Interfaces:**
- Consumes: `searchOrtu`, `createOrtu` (Task 6); `listTeachers` (`web/app/src/api/teachers.ts`, already an open endpoint).

- [ ] **Step 1: OrtuPicker — swap data source**

In `web/app/src/components/OrtuPicker.tsx`:
- Replace the import `import { listUsers, createUser, type OrtuLink, type PhoneRegion } from '@/api/users'` with:
  ```ts
  import { type OrtuLink, type PhoneRegion } from '@/api/users'
  import { searchOrtu, createOrtu } from '@/api/murid'
  ```
- Change `searchQ.queryFn` from `() => listUsers({ role: 'ortu', q: query, limit: 20 })` to `() => searchOrtu(query, 20)`.
- Change `createMut.mutationFn` from the `createUser({...role:'ortu'...})` call to:
  ```ts
  mutationFn: () => createOrtu({ name: newName.trim(), noHp: newPhone.trim() || undefined, phoneRegion: newRegion }),
  ```
  (The `/ortu` POST builds email/password server-side, so drop the `email`/`password`/`role` fields.)

- [ ] **Step 2: KelasListSection — guru picker uses the open teachers endpoint**

In `web/app/src/pages/sections/KelasListSection.tsx`:
- Add `import { listTeachers } from '@/api/teachers'` (confirm the export name/signature in that file; it backs the already-open `GET /api/teachers`).
- Replace the `gurus` query:
  ```ts
  const { data: gurus } = useQuery({
    queryKey: ['teachers', 'pick'],
    queryFn: () => listTeachers({ status: 'active', limit: 200 }),
    staleTime: 60_000,
  })
  const guruOptions = gurus?.items ?? []
  ```
  Map each option's `id`/`name` the same way the current `guruOptions` is consumed (the checkbox list at lines 582-607 reads `g.id` and `g.name`). If `listTeachers` returns a different item shape, adapt the `.map` to expose `id` and `name`.
- Remove the now-unused `import { listUsers } from '@/api/users'` if nothing else in the file uses it.

- [ ] **Step 3: Typecheck**

Run: `cd web/app && npx tsc --noEmit`
Expected: no new errors. Fix any shape mismatch from `listTeachers`.

- [ ] **Step 4: Commit**

```bash
git add web/app/src/components/OrtuPicker.tsx web/app/src/pages/sections/KelasListSection.tsx
git commit -m "feat(web): wire ortu picker and guru picker for wali"
```

---

### Task 8: Widen kelas card edit/anggota gates to wali

**Files:**
- Modify: `web/app/src/pages/sections/KelasListSection.tsx`

**Interfaces:**
- Consumes: `useAuth().user`, `Kelas.guruUserId`.

The card currently gates Edit (Pencil) + Anggota (Users) buttons on `isAdmin`. Widen those two to `canManageKelas = isAdmin || currentUserId === k.guruUserId`. Keep Delete (Trash) and the top "Add kelas" button on `isAdmin`.

- [ ] **Step 1: Thread a `canManageKelas` prop through `KelasField` → `KelasCard`**

In `KelasField` (the map at lines 234-246), compute and pass:
```tsx
const canManage = isAdmin || (currentUserId != null && k.guruUserId === currentUserId)
```
and add `canManageKelas={canManage}` to `<KelasCard ...>`.

In `KelasCard` props, add `canManageKelas: boolean`. Then:
- Change the action-bar visibility condition from `isAdmin || canManageJadwal` to `isAdmin || canManageJadwal || canManageKelas`.
- Move the Anggota (Users) and Edit (Pencil) buttons OUT of the `isAdmin ? (...)` block into a `canManageKelas ? (...)` block. Keep the Delete (Trash) button inside `isAdmin ? (...)`.
- Update the button-padding hint at line 287 so wali (who now has 2-3 icons) gets `pr-20`: e.g. `isAdmin ? 'pr-28' : (canManageKelas ? 'pr-20' : canManageJadwal && 'pr-10')`.

- [ ] **Step 2: Typecheck + build**

Run: `cd web/app && npx tsc --noEmit && npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add web/app/src/pages/sections/KelasListSection.tsx
git commit -m "feat(web): show edit and anggota controls to wali"
```

---

### Task 9: Student profile + ortu editor in the class roster

**Files:**
- Modify: `web/app/src/components/KelasAnggotaDialog.tsx`
- Possibly create: `web/app/src/components/MuridEditDialog.tsx`

**Interfaces:**
- Consumes: `getMurid`, `updateMurid` (Task 6); `OrtuPicker` (Task 7).

> Read `web/app/src/components/KelasAnggotaDialog.tsx` first — it lists a class's students (`listAnggota`/`addAnggota`/`removeAnggota`) and is opened for `canManageKelas` (Task 8). It is the natural home for a per-student "edit" affordance.

- [ ] **Step 1: Add a per-student edit affordance**

In `KelasAnggotaDialog`, for each listed anggota add an edit button that opens `MuridEditDialog` (or an inline panel) for that `muridUserId`.

- [ ] **Step 2: Build `MuridEditDialog`**

Create `web/app/src/components/MuridEditDialog.tsx`. It:
- Loads the student with `useQuery(['murid', id], () => getMurid(id))`.
- Renders a small form over the whitelisted fields (`name`, `nickname`, `noHp`, `phoneRegion`, `alamat`, `level`, `dateOfBirth`, `tempatLahir`, `notes`) using the existing `Field`/`Input` components.
- Renders two `OrtuPicker`s (relation `ayah` and `ibu`) seeded from `data.ortu`, wiring `onLink={(ortuId) => updateMurid(id, { ayahId: ortuId })}` / `onUnlink={() => updateMurid(id, { clearAyahId: true })}` (and the `ibu` equivalents), invalidating `['murid', id]` and `['kelas-anggota', kelasId]` on success.
- Saves profile fields via `updateMurid(id, {...})` on submit.

Follow the structure of the existing `KelasFormDialog` (`react-hook-form` + `zodResolver`, `useMutation`, `useToast`, `Dialog`) for consistency.

- [ ] **Step 3: Typecheck + build**

Run: `cd web/app && npx tsc --noEmit && npm run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add web/app/src/components/KelasAnggotaDialog.tsx web/app/src/components/MuridEditDialog.tsx
git commit -m "feat(web): wali edits student profile and ortu in roster"
```

---

## Phase 5 — Verification

### Task 10: Full test + typecheck + Chrome DevTools pass

**Files:** none (verification only).

- [ ] **Step 1: Backend tests**

Run: `make test`
Expected: PASS (including the new `auth`, `store`, and `handler` tests).

- [ ] **Step 2: Frontend typecheck**

Run: `make typecheck` (or `cd web/app && npx tsc --noEmit`)
Expected: no errors.

- [ ] **Step 3: Build + run the dogfood container** (operator preference: rebuild the `gnrs` container)

Run from the worktree: `docker-compose up -d --build`
Then: `curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8300/healthz` → `200`.

- [ ] **Step 4: Chrome DevTools flow (per `TEST.md`, `CHROME_DEVTOOLS.md` pre-flight first)**

As a **wali guru** (a guru who is primary guru of a class):
1. Open Kelas → see the class under "Kelas Saya" with Edit + Anggota icons.
2. Edit class name/description → saves (200).
3. Open Anggota → add a student, remove a student.
4. Add a co-teacher in the edit dialog → saves; confirm you remain primary wali.
5. Open a student → edit name/contact → saves; link an ayah ortu (search existing + create new) → appears immediately; unlink → gone.
6. Negative: a class you are NOT wali of shows no Edit/Anggota icons; forcing `PATCH /api/kelas/{otherId}` returns 403; `PATCH /api/murid/{foreignId}` returns 403.

As an **admin**: confirm every existing class/user/ortu flow still works unchanged.

- [ ] **Step 5: Capture results for the PR**

Record the dev URL, the steps exercised, and screenshots/notes in the "Tested via Chrome DevTools" PR section.

---

## Self-Review

**Spec coverage:**
- Edit class details → Task 3 (Update) + Task 8 (UI). ✅
- Add/remove students → Task 3 (anggota) + Task 9 (UI). ✅
- Add co-teacher / remove non-primary → Task 3 (guru endpoints + primary guard) + Task 7 (guru picker). ✅
- No delete / no create / no primary reassignment by wali → Task 3 keeps Create/Delete admin-only; `Update` forces primary; `RemoveGuruAnggota` guards primary. ✅
- Student safe-profile edit (no role/password/identity) → Task 4 (`muridUpdateBody` is the whitelist). ✅
- Ortu view/add/change/unlink + create → Task 4 (links) + Task 5 (search/create) + Task 7/9 (UI). ✅
- Authz helpers mirroring `canManageJadwal` → Task 2 (`IsWaliOfMurid`) + Task 3 (`canManageKelas`) + Task 4 (`canManageMurid`). ✅
- No DB migration → confirmed; no migration task exists. ✅

**Placeholder scan:** Frontend Task 9 intentionally describes `MuridEditDialog` structurally rather than pasting full JSX, because it must follow the existing `KelasFormDialog`/`Dialog` patterns the implementer will read in-file; all data calls and field lists are named explicitly. No `TBD`/`TODO`.

**Type consistency:** `canManageKelas` returns `*store.Kelas`; `canManageMurid` returns `bool` (writes its own error). `muridUpdateBody`→`store.UserUpdateInput` field names mirror `internal/handler/users.go:317-365`; the plan flags verifying any divergent names there. `searchOrtu`/`createOrtu`/`getMurid`/`updateMurid` names match between Task 6 (api) and Tasks 7/9 (consumers).
