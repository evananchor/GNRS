# Wali Kelas Management — Design

**Date:** 2026-06-23
**Branch:** `feat/wali-kelas-mgmt` (base: `evan`)
**Status:** Approved (design)

## Goal

A homeroom teacher (*wali kelas*) can manage **their own class** with near-admin
powers, and manage the **students in that class** — including parent (*ortu*)
relations. Admins keep full powers everywhere; wali powers are scoped to the
classes they are primary guru of.

**No DB migration required.** Every table this needs already exists:
`kelas.guru_user_id` (the wali), `kelas_anggota`, `kelas_guru`, `murid_ortu`.
This is authorization + endpoint wiring + UI only.

## Definition

**Wali** of a class = the user whose id equals `kelas.guru_user_id` (the
primary guru). This matches the existing `canManageJadwal()` precedent
(`internal/handler/kelas.go:68-91`). Secondary teachers in `kelas_guru` are
**not** wali and get no wali powers.

## Permission model

| Action | Wali (own class) | Admin |
|---|---|---|
| Edit class details: `nama`, `tingkat`, `tahun`, `deskripsi` | ✅ | ✅ |
| Reassign primary wali (`guru_user_id`) | ❌ | ✅ |
| Add / remove students (`kelas_anggota`) | ✅ | ✅ |
| Add co-teacher (`kelas_guru`) | ✅ | ✅ |
| Remove co-teacher — **except the primary guru** | ✅ | ✅ |
| Delete class | ❌ | ✅ |
| Create class | ❌ | ✅ |
| Edit class-student profile: name, contact, level (safe fields) | ✅ | ✅ |
| Change student `role` / `password` / `active` / login identity | ❌ | ✅ |
| View / add / change / unlink ortu (ayah, ibu) | ✅ | ✅ |
| Create a new ortu user (forced `role='ortu'`, inactive) | ✅ | ✅ |

## Architecture

### Authorization helpers (`internal/handler/`)

Mirror the existing `canManageJadwal()`:

- `canManageKelas(claims, kelasID) (kelas, bool)` — true if `claims.Role ==
  admin` **or** `kelas.guru_user_id == claims.UserID`. Loads the kelas, writes
  403 + returns false when unauthorized.
- `canManageMurid(claims, muridID) bool` — true if `claims.Role == admin`
  **or** the requester is primary guru of *any* class the murid belongs to.
  One query: `kelas_anggota` ⋈ `kelas` where `murid_user_id = ? AND
  guru_user_id = ?` exists.

A murid in multiple classes is manageable by the wali of **any** of those
classes — acceptable and simplest.

### Backend approach: admin-or-guru route group + dedicated murid/ortu endpoints

Refined from the original "reuse the `/users/{id}` PATCH with a field
whitelist" idea: the `/users/*` admin routes stay **fully admin-only**, and the
wali surface for students lives on **dedicated `/murid` and `/ortu` endpoints**.
This eliminates the only real risk the original approach carried — branching
authz on the god-mode user PATCH that can also set role/password — because the
new endpoints' request DTO physically has no privileged fields. It still reuses
the `store` layer and the `OrtuPicker`/kelas dialogs, so the code cost is small.

Route grouping: kelas mutation routes and the new murid/ortu routes move into a
new `mng` group gated `auth.RequireAnyRole(admin, guru)`, with row-level
ownership enforced inside each handler.

**Kelas** (`internal/handler/kelas.go`, routes in `cmd/server/main.go`):

- Move these OFF the admin-only route group into `mng`; gate **inside** the
  handler via `canManageKelas`:
  - `Update` (PATCH kelas)
  - `AddAnggota`, `RemoveAnggota`
  - `AddGuruAnggota`, `RemoveGuruAnggota`
- Keep admin-only: `Create`, `Delete`.
- Wali guardrails inside the handlers:
  - `Update` by a non-admin **forces** `guru_user_id` to the existing primary
    (primary wali reassignment stays admin-only). Descriptive fields +
    co-teacher set may change.
  - `RemoveGuruAnggota` by a non-admin **rejects removing the primary guru**
    (`guru_user_id`) — prevents a wali removing themselves/the wali.

**Student profile + ortu** (new `internal/handler/murid.go`, `mng` group):

- `GET /api/murid/{id}`: load a student + ortu links. Gate `canManageMurid`;
  target must be role `murid`.
- `PATCH /api/murid/{id}`: safe-field profile update + ortu link/unlink. Gate
  `canManageMurid`. The request DTO (`muridUpdateBody`) **is** the whitelist —
  it contains only name, nickname, date_of_birth, gender, no_hp, phone_region,
  alamat, level, tempat_lahir, notes, and ortu links (ayahId, ibuId,
  clearAyahId, clearIbuId). No role/password/active/email/username/user_code
  field exists on it, so a wali cannot set them at all.
- `GET /api/ortu?q=` (search) and `POST /api/ortu` (create): admin-or-guru.
  `POST /api/ortu` **forces** `role='ortu'` server-side, so a wali cannot mint
  a privileged user. (Ortu accounts have no login UI; the placeholder password
  is unusable.)

The admin-only `/api/users/*` routes are unchanged; the admin UI keeps using
them. The shared `OrtuPicker` is pointed at `/api/ortu` so it works for both
admin and wali.

### Frontend (`web/app/src/`)

Entry point is the **Kelas roster**, not the global Users admin page.

- `pages/sections/KelasListSection.tsx`: compute `isWali(k) = k.guruUserId ===
  user?.id`. Show edit / add-student / manage-teacher controls when
  `isAdmin || isWali(k)` (today they are `isAdmin`-only). Keep delete +
  primary-wali reassignment `isAdmin`-only.
- Class roster student row: for `isAdmin || isWali`, open a student editor that
  reuses `OrtuPicker` (ayah/ibu) + a safe-fields profile form, calling the
  existing user GET/PATCH endpoints.
- Reuse existing kelas member/guru dialogs; just widen their visibility
  condition from `isAdmin` to `isAdmin || isWali`.

## Security guardrails (do not simplify away)

1. Wali = `guru_user_id` only (primary guru), never secondary `kelas_guru`.
2. Every wali action re-checks ownership server-side (`canManageKelas` /
   `canManageMurid`) — never trust the client's role or a passed kelasId alone.
3. The `/api/murid/{id}` PATCH DTO is the privilege boundary: it has no
   role/password/active/email/username/user_code field, so those are
   unsettable by construction. The admin-only `/api/users/*` routes are never
   opened to non-admins. Covered by a dedicated test.
4. Wali cannot reassign primary wali, delete classes, remove the primary guru,
   or create privileged users.
5. Ortu creation forces `role='ortu'` + inactive server-side regardless of
   payload.

## Testing

- **Go unit/handler tests:** `canManageKelas` / `canManageMurid` truth tables;
  wali Update rejects `guru_user_id` change; RemoveGuru rejects primary guru;
  non-admin PATCH rejects each forbidden field; wali cannot touch a murid
  outside their class; ortu create forces role/active.
- **`make test` + `make typecheck`.**
- **Chrome DevTools flow (per TEST.md)** against a local dev container:
  log in as a wali guru, edit own class, add/remove a student, add a
  co-teacher, edit a student's profile + link an ortu; confirm a non-owned
  class shows no edit controls and the API 403s if forced.

## Out of scope

- Schema changes (none needed).
- Secondary-teacher (`kelas_guru`) powers.
- Wali deleting classes or reassigning wali-ship.
- Editing student login identity / role / password by wali.
- Bulk operations.
