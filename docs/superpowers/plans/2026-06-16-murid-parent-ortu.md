# Murid — Identitas Orang Tua (Ortu sebagai User) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace free-form `parent_*` fields on murid users with proper `ortu` user accounts linked via a `murid_ortu` junction table, so parents become first-class users and the WhatsApp report dialog can send to ayah/ibu independently.

**Architecture:** Four SQL migrations (046-049) add `phone_region` to users, create the `murid_ortu` junction table, migrate existing `parent_*` data into new `ortu` accounts, then drop the old columns. Backend model/store/handler are updated throughout. Frontend gets a new `OrtuPicker` component used in the user edit form, and `EndSesiSummaryDialog` is updated to iterate over `ortu` links.

**Tech Stack:** Go + chi + SQLite (backend), Vite + React 18 + TanStack Router, Tailwind v3, react-hook-form + zod, @tanstack/react-query, react-i18next.

---

## File Map

| File | Change |
|------|--------|
| `internal/store/migrations/046_add_phone_region.{up,down}.sql` | New: ADD phone_region column |
| `internal/store/migrations/047_murid_ortu.{up,down}.sql` | New: CREATE murid_ortu table |
| `internal/store/migrations/048_migrate_parent_to_ortu.{up,down}.sql` | New: data migration |
| `internal/store/migrations/049_drop_parent_fields.{up,down}.sql` | New: DROP parent_* columns |
| `internal/model/model.go` | Add PhoneRegion + OrtuLink; remove parent fields from User/Student/Teacher |
| `internal/store/users.go` | Update column list, scan, UserCreateInput/UserUpdateInput; add GetMuridOrtu/SetMuridOrtu/RemoveMuridOrtu |
| `internal/store/students.go` | Remove parent_* from column list, INSERT, UPDATE, scan |
| `internal/store/teachers.go` | Remove parent_* from column list, INSERT, UPDATE, scan |
| `internal/handler/users.go` | Remove parent fields from bodies; add PhoneRegion, AyahID/IbuID, ClearAyahID/ClearIbuID; enrich Get/Update/Create with ortu logic |
| `web/app/src/api/users.ts` | Add OrtuLink type; update ManagedUser, UserCreateInput, UserUpdateInput |
| `web/app/src/api/types.ts` | Remove parent fields from Student/Teacher/input types |
| `web/app/src/components/OrtuPicker.tsx` | New: search/create/link component for one ortu slot |
| `web/app/src/pages/Users.tsx` | Add ortu section to UserEditForm (murid role only) |
| `web/app/src/components/EndSesiSummaryDialog.tsx` | Update WA send to use ortu links with per-parent checkboxes |
| `web/app/src/locales/id.json` | Update ortu/parent locale keys |
| `web/app/src/locales/en.json` | Same in English |

---

## Task 1: Migration 046 — Add phone_region to users

**Files:**
- Create: `internal/store/migrations/046_add_phone_region.up.sql`
- Create: `internal/store/migrations/046_add_phone_region.down.sql`

- [ ] **Step 1: Write up migration**

```sql
-- internal/store/migrations/046_add_phone_region.up.sql
ALTER TABLE users ADD COLUMN phone_region TEXT NOT NULL DEFAULT 'ID';
```

- [ ] **Step 2: Write down migration**

```sql
-- internal/store/migrations/046_add_phone_region.down.sql
ALTER TABLE users DROP COLUMN phone_region;
```

- [ ] **Step 3: Commit**

```bash
git add internal/store/migrations/046_add_phone_region.up.sql \
        internal/store/migrations/046_add_phone_region.down.sql
git commit -m "feat(db): add phone_region column to users (mig 046)"
```

---

## Task 2: Migration 047 — Create murid_ortu table

**Files:**
- Create: `internal/store/migrations/047_murid_ortu.up.sql`
- Create: `internal/store/migrations/047_murid_ortu.down.sql`

- [ ] **Step 1: Write up migration**

```sql
-- internal/store/migrations/047_murid_ortu.up.sql
CREATE TABLE murid_ortu (
  murid_id   TEXT NOT NULL REFERENCES users(id),
  ortu_id    TEXT NOT NULL REFERENCES users(id),
  relation   TEXT NOT NULL CHECK(relation IN ('ayah','ibu')),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (murid_id, relation)
);
CREATE INDEX idx_murid_ortu_ortu ON murid_ortu(ortu_id);
```

- [ ] **Step 2: Write down migration**

```sql
-- internal/store/migrations/047_murid_ortu.down.sql
DROP INDEX IF EXISTS idx_murid_ortu_ortu;
DROP TABLE IF EXISTS murid_ortu;
```

- [ ] **Step 3: Commit**

```bash
git add internal/store/migrations/047_murid_ortu.up.sql \
        internal/store/migrations/047_murid_ortu.down.sql
git commit -m "feat(db): create murid_ortu junction table (mig 047)"
```

---

## Task 3: Migration 048 — Migrate parent data into ortu accounts

**Files:**
- Create: `internal/store/migrations/048_migrate_parent_to_ortu.up.sql`
- Create: `internal/store/migrations/048_migrate_parent_to_ortu.down.sql`

Each migrated ortu user gets a deterministic ID: `'ortu-migr-' || murid_id`. This allows the second INSERT to join without a subquery. Placeholder email is unique per murid.

- [ ] **Step 1: Write up migration**

```sql
-- internal/store/migrations/048_migrate_parent_to_ortu.up.sql

-- Step 1: Create ortu user accounts from murid parent_* fields.
-- ID is deterministic so we can reference it in step 2 without a subquery.
-- Email placeholder is unique (murid IDs are unique).
-- password='' and active=0 — no login possible until activated by admin.
INSERT INTO users (
  id, email, username, password,
  name, no_hp, phone_region,
  role, active,
  created_at, updated_at
)
SELECT
  'ortu-migr-' || id,
  'ortu.' || id || '@placeholder.local',
  NULL,
  '',
  parent_name,
  parent_phone,
  COALESCE(parent_phone_region, 'ID'),
  'ortu',
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM users
WHERE role = 'murid'
  AND parent_name IS NOT NULL
  AND trim(parent_name) != '';

-- Step 2: Link each murid to its new ortu user as 'ayah' (default for legacy data).
-- Admin can re-link as 'ibu' via UI if needed.
INSERT INTO murid_ortu (murid_id, ortu_id, relation, created_at)
SELECT
  id,
  'ortu-migr-' || id,
  'ayah',
  CURRENT_TIMESTAMP
FROM users
WHERE role = 'murid'
  AND parent_name IS NOT NULL
  AND trim(parent_name) != '';
```

- [ ] **Step 2: Write down migration**

```sql
-- internal/store/migrations/048_migrate_parent_to_ortu.down.sql

-- Remove migrated links first (FK constraint).
DELETE FROM murid_ortu
WHERE ortu_id LIKE 'ortu-migr-%';

-- Remove migrated ortu accounts.
DELETE FROM users
WHERE id LIKE 'ortu-migr-%';
```

- [ ] **Step 3: Commit**

```bash
git add internal/store/migrations/048_migrate_parent_to_ortu.up.sql \
        internal/store/migrations/048_migrate_parent_to_ortu.down.sql
git commit -m "feat(db): migrate parent_* fields to ortu user accounts (mig 048)"
```

---

## Task 4: Migration 049 — Drop parent_* columns

**Files:**
- Create: `internal/store/migrations/049_drop_parent_fields.up.sql`
- Create: `internal/store/migrations/049_drop_parent_fields.down.sql`

- [ ] **Step 1: Write up migration**

```sql
-- internal/store/migrations/049_drop_parent_fields.up.sql
ALTER TABLE users DROP COLUMN parent_name;
ALTER TABLE users DROP COLUMN parent_title;
ALTER TABLE users DROP COLUMN parent_phone;
ALTER TABLE users DROP COLUMN parent_phone_region;
ALTER TABLE users DROP COLUMN parent_email;
```

- [ ] **Step 2: Write down migration** (best-effort — data is gone)

```sql
-- internal/store/migrations/049_drop_parent_fields.down.sql
ALTER TABLE users ADD COLUMN parent_name TEXT;
ALTER TABLE users ADD COLUMN parent_title TEXT;
ALTER TABLE users ADD COLUMN parent_phone TEXT;
ALTER TABLE users ADD COLUMN parent_phone_region TEXT;
ALTER TABLE users ADD COLUMN parent_email TEXT;
```

- [ ] **Step 3: Commit**

```bash
git add internal/store/migrations/049_drop_parent_fields.up.sql \
        internal/store/migrations/049_drop_parent_fields.down.sql
git commit -m "feat(db): drop legacy parent_* columns from users (mig 049)"
```

---

## Task 5: Update Go model.go

**Files:**
- Modify: `internal/model/model.go`

- [ ] **Step 1: Update User struct**

In `internal/model/model.go`, inside the `User` struct, replace the entire "Education + family ties" section:

Old block (lines ~99-106):
```go
	// Education + family ties (kept available to all roles — same fields
	// across every membership category per the unified-user mechanism).
	Level             *StudentLevel `json:"level,omitempty"`
	ParentName        *string       `json:"parentName,omitempty"`
	ParentTitle       *string       `json:"parentTitle,omitempty"`
	ParentPhone       *string       `json:"parentPhone,omitempty"`
	ParentPhoneRegion *string       `json:"parentPhoneRegion,omitempty"`
	ParentEmail       *string       `json:"parentEmail,omitempty"`
```

New block:
```go
	// Education level (murid only).
	Level *StudentLevel `json:"level,omitempty"`

	// Phone region for E.164 normalization (primarily used by ortu users).
	// One of: ID, SG, US, CA. Defaults to "ID".
	PhoneRegion string `json:"phoneRegion"`

	// Ortu links (populated only on single-user GET for murid role).
	Ortu []OrtuLink `json:"ortu,omitempty"`
```

- [ ] **Step 2: Update Student struct**

Remove the parent fields block from `Student` (lines ~163-167):
```go
	ParentName        *string       `json:"parentName,omitempty"`
	ParentTitle       *string       `json:"parentTitle,omitempty"`
	ParentPhone       *string       `json:"parentPhone,omitempty"`
	ParentPhoneRegion *string       `json:"parentPhoneRegion,omitempty"`
	ParentEmail       *string       `json:"parentEmail,omitempty"`
```

- [ ] **Step 3: Update Teacher struct**

Remove the parent fields block from `Teacher` (lines ~213-217):
```go
	ParentName        *string       `json:"parentName,omitempty"`
	ParentTitle       *string       `json:"parentTitle,omitempty"`
	ParentPhone       *string       `json:"parentPhone,omitempty"`
	ParentPhoneRegion *string       `json:"parentPhoneRegion,omitempty"`
	ParentEmail       *string       `json:"parentEmail,omitempty"`
```

- [ ] **Step 4: Add OrtuLink type**

After the `Teacher` struct (end of file), add:
```go
// OrtuLink represents one parent (ayah or ibu) linked to a murid.
// Returned by GET /api/users/:id when the user has role=murid.
type OrtuLink struct {
	Relation string `json:"relation"` // "ayah" or "ibu"
	User     User   `json:"user"`
}
```

- [ ] **Step 5: Commit**

```bash
git add internal/model/model.go
git commit -m "feat(model): replace parent fields with PhoneRegion + OrtuLink"
```

---

## Task 6: Update store/users.go

**Files:**
- Modify: `internal/store/users.go`

- [ ] **Step 1: Update userColumns constant**

Replace the `userColumns` const (lines ~28-35):

Old:
```go
const userColumns = `id, email, username, password, name, role, active,
	nickname, date_of_birth, gender, no_hp, alamat, kelompok,
	level, parent_name, parent_title, parent_phone, parent_phone_region, parent_email,
	desa, daerah, notes,
	photo_path, timezone,
	user_code, tempat_lahir, pendidikan, pekerjaan,
	urutan, hide_dob, tgl_daftar,
	created_at, updated_at`
```

New:
```go
const userColumns = `id, email, username, password, name, role, active,
	nickname, date_of_birth, gender, no_hp, alamat, kelompok,
	level, phone_region,
	desa, daerah, notes,
	photo_path, timezone,
	user_code, tempat_lahir, pendidikan, pekerjaan,
	urutan, hide_dob, tgl_daftar,
	created_at, updated_at`
```

- [ ] **Step 2: Update readUserRow scan**

In `readUserRow`, replace the `s.Scan(...)` call to scan `phone_region` instead of five parent columns:

Old scan fields (partial):
```go
		&level, &u.ParentName, &u.ParentTitle, &u.ParentPhone, &u.ParentPhoneRegion, &u.ParentEmail,
		&u.Desa, &u.Daerah, &u.Notes,
```

New:
```go
		&level, &u.PhoneRegion,
		&u.Desa, &u.Daerah, &u.Notes,
```

- [ ] **Step 3: Update UserCreateInput**

Remove `ParentName`, `ParentTitle`, `ParentPhone`, `ParentPhoneRegion`, `ParentEmail` from the struct. Add `PhoneRegion string`:

```go
type UserCreateInput struct {
	// Auth
	ID       string
	Email    string
	Username *string
	Password string
	Name     string
	Role     model.Role

	// Shared profile
	Nickname    *string
	DateOfBirth *time.Time
	Gender      *string
	NoHP        *string
	Alamat      *string
	Kelompok    *string

	// Education + phone region
	Level       *model.StudentLevel
	PhoneRegion string // "ID" | "SG" | "US" | "CA"; defaults to "ID" if empty

	// Locality + free-form notes
	Desa   *string
	Daerah *string
	Notes  *string

	// Taaruf-style biodata (all optional).
	UserCode    *string
	TempatLahir *string
	Pendidikan  *string
	Pekerjaan   *string
	Urutan      int
	HideDob     bool
	TglDaftar   *time.Time
}
```

- [ ] **Step 4: Update createWithHash INSERT**

Replace the INSERT in `createWithHash` to remove parent columns and add `phone_region`:

```go
	_, err := u.db.ExecContext(ctx,
		`INSERT INTO users (
		   id, email, username, password, name, role, active,
		   nickname, date_of_birth, gender, no_hp, alamat, kelompok,
		   level, phone_region,
		   desa, daerah, notes,
		   user_code, tempat_lahir, pendidikan, pekerjaan,
		   urutan, hide_dob, tgl_daftar,
		   created_at, updated_at
		 ) VALUES (?, ?, ?, ?, ?, ?, 1,
		           ?, ?, ?, ?, ?, ?,
		           ?, ?,
		           ?, ?, ?,
		           ?, ?, ?, ?,
		           ?, ?, ?,
		           ?, ?)`,
		id, in.Email, in.Username, hash, in.Name, string(in.Role),
		in.Nickname, nullableDate(in.DateOfBirth), in.Gender, in.NoHP, in.Alamat, in.Kelompok,
		nullableLevel(in.Level), in.PhoneRegion,
		in.Desa, in.Daerah, in.Notes,
		in.UserCode, in.TempatLahir, in.Pendidikan, in.Pekerjaan,
		in.Urutan, hideDobInt, nullableDate(in.TglDaftar),
		now, now,
	)
```

- [ ] **Step 5: Update UserUpdateInput**

Remove `ParentName`, `ParentTitle`, `ParentPhone`, `ParentPhoneRegion`, `ParentEmail` from the struct. Add `PhoneRegion *string`:

```go
type UserUpdateInput struct {
	Email            *string
	Username         *string
	Name             *string
	Role             *model.Role
	Active           *bool
	Nickname         *string
	DateOfBirth      *time.Time
	ClearDateOfBirth bool
	Gender           *string
	NoHP             *string
	Alamat           *string
	Kelompok         *string
	Level            *model.StudentLevel
	ClearLevel       bool
	PhoneRegion      *string // NEW — set to update, nil to leave unchanged
	Desa             *string
	Daerah           *string
	Notes            *string
	Timezone         *string
	ClearTimezone    bool

	// Taaruf-style biodata.
	UserCode       *string
	TempatLahir    *string
	Pendidikan     *string
	Pekerjaan      *string
	Urutan         *int
	HideDob        *bool
	TglDaftar      *time.Time
	ClearTglDaftar bool
}
```

- [ ] **Step 6: Update Update() method**

Remove the five `addStr("parent_*", ...)` calls and add `addStr("phone_region", in.PhoneRegion)` after `addStr("kelompok", in.Kelompok)`:

Old lines to remove:
```go
	addStr("parent_name", in.ParentName)
	addStr("parent_title", in.ParentTitle)
	addStr("parent_phone", in.ParentPhone)
	addStr("parent_phone_region", in.ParentPhoneRegion)
	addStr("parent_email", in.ParentEmail)
```

New line to add (after the kelompok/level block):
```go
	addStr("phone_region", in.PhoneRegion)
```

- [ ] **Step 7: Add murid_ortu store functions**

Append to `internal/store/users.go`:

```go
// GetMuridOrtu returns the ortu accounts linked to a murid user.
// The returned slice has at most 2 entries (ayah, ibu).
// Returns an empty slice (not an error) when the murid has no linked ortu.
func (u *Users) GetMuridOrtu(ctx context.Context, muridID string) ([]model.OrtuLink, error) {
	rows, err := u.db.QueryContext(ctx,
		`SELECT mo.relation, `+userColumns+`
		 FROM murid_ortu mo
		 JOIN users ou ON ou.id = mo.ortu_id
		 WHERE mo.murid_id = ?
		 ORDER BY mo.relation`, muridID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.OrtuLink
	for rows.Next() {
		var relation string
		var ou model.User
		var role string
		var active int
		var dob sql.NullTime
		var level sql.NullString
		var hideDob int
		var tglDaftar sql.NullTime
		if err := rows.Scan(
			&relation,
			&ou.ID, &ou.Email, &ou.Username, &ou.Password, &ou.Name, &role, &active,
			&ou.Nickname, &dob, &ou.Gender, &ou.NoHP, &ou.Alamat, &ou.Kelompok,
			&level, &ou.PhoneRegion,
			&ou.Desa, &ou.Daerah, &ou.Notes,
			&ou.PhotoPath, &ou.Timezone,
			&ou.UserCode, &ou.TempatLahir, &ou.Pendidikan, &ou.Pekerjaan,
			&ou.Urutan, &hideDob, &tglDaftar,
			&ou.CreatedAt, &ou.UpdatedAt,
		); err != nil {
			return nil, err
		}
		ou.Role = model.Role(role)
		ou.Active = active == 1
		ou.HideDob = hideDob == 1
		if dob.Valid {
			v := dob.Time
			ou.DateOfBirth = &v
		}
		if level.Valid {
			v := model.StudentLevel(level.String)
			ou.Level = &v
		}
		if tglDaftar.Valid {
			v := tglDaftar.Time
			ou.TglDaftar = &v
		}
		ou.PhotoURL = model.PhotoURL(ou.PhotoPath)
		ou.Password = "" // never leak
		out = append(out, model.OrtuLink{Relation: relation, User: ou})
	}
	return out, rows.Err()
}

// SetMuridOrtu links an ortu user to a murid with the given relation ("ayah" or "ibu").
// Replaces an existing link for the same relation (upsert).
func (u *Users) SetMuridOrtu(ctx context.Context, muridID, relation, ortuID string) error {
	_, err := u.db.ExecContext(ctx,
		`INSERT INTO murid_ortu (murid_id, ortu_id, relation, created_at)
		 VALUES (?, ?, ?, CURRENT_TIMESTAMP)
		 ON CONFLICT(murid_id, relation) DO UPDATE SET ortu_id = excluded.ortu_id`,
		muridID, ortuID, relation)
	return err
}

// RemoveMuridOrtu removes the ortu link for the given relation from a murid.
// A no-op if the link does not exist.
func (u *Users) RemoveMuridOrtu(ctx context.Context, muridID, relation string) error {
	_, err := u.db.ExecContext(ctx,
		`DELETE FROM murid_ortu WHERE murid_id = ? AND relation = ?`,
		muridID, relation)
	return err
}
```

- [ ] **Step 8: Commit**

```bash
git add internal/store/users.go
git commit -m "feat(store): update users store for phone_region + murid_ortu"
```

---

## Task 7: Update store/students.go and store/teachers.go

Both files reference `parent_*` columns in their column lists, INSERT, UPDATE, and scan. Update each to remove those references.

**Files:**
- Modify: `internal/store/students.go`
- Modify: `internal/store/teachers.go`

### students.go

- [ ] **Step 1: Update column list in students.go**

Find the column list (line ~74) and remove the `parent_name, parent_title, parent_phone, parent_phone_region, parent_email` part. The `StudentInput` struct fields `ParentName`, `ParentTitle`, `ParentPhone`, `ParentPhoneRegion`, `ParentEmail` (lines ~39-43) should also be removed.

- [ ] **Step 2: Update INSERT in students.go**

Remove parent columns from the INSERT statement (line ~114) and its corresponding values (line ~128).

- [ ] **Step 3: Update UPDATE in students.go**

Remove parent column assignments from the UPDATE statement (line ~163) and values (line ~172).

- [ ] **Step 4: Update scan in students.go**

Remove `&st.ParentName, &st.ParentTitle, &st.ParentPhone, &st.ParentPhoneRegion, &st.ParentEmail` from the Scan call (line ~402).

### teachers.go

- [ ] **Step 5: Apply the same four changes to teachers.go**

Grep for `parent_` in `internal/store/teachers.go` and remove all occurrences (lines ~47-50, ~77, ~117, ~131, ~166, ~174, ~407).

- [ ] **Step 6: Run Go tests to confirm compile + test pass**

```bash
make test
```

Expected: all tests pass (no compile errors from removed parent fields).

- [ ] **Step 7: Commit**

```bash
git add internal/store/students.go internal/store/teachers.go
git commit -m "feat(store): remove parent_* fields from students/teachers store"
```

---

## Task 8: Update handler/users.go

**Files:**
- Modify: `internal/handler/users.go`

- [ ] **Step 1: Update userCreateBody**

Replace the `// Murid` section in `userCreateBody` (lines ~45-51):

Old:
```go
	// Murid
	Level             *string `json:"level,omitempty"             validate:"omitempty,oneof=Caberawit 'Pra Remaja' Remaja 'Pra Nikah'"`
	ParentName        *string `json:"parentName,omitempty"        validate:"omitempty,max=200"`
	ParentTitle       *string `json:"parentTitle,omitempty"       validate:"omitempty,max=80"`
	ParentPhone       *string `json:"parentPhone,omitempty"       validate:"omitempty,max=64"`
	ParentPhoneRegion *string `json:"parentPhoneRegion,omitempty" validate:"omitempty,oneof=ID SG US CA"`
	ParentEmail       *string `json:"parentEmail,omitempty"       validate:"omitempty,email"`
```

New:
```go
	// Murid / level
	Level *string `json:"level,omitempty" validate:"omitempty,oneof=Caberawit 'Pra Remaja' Remaja 'Pra Nikah'"`

	// Phone region for E.164 normalization (primarily ortu users).
	PhoneRegion *string `json:"phoneRegion,omitempty" validate:"omitempty,oneof=ID SG US CA"`

	// Ortu links (only processed if role=murid).
	AyahID *string `json:"ayahId,omitempty"`
	IbuID  *string `json:"ibuId,omitempty"`
```

- [ ] **Step 2: Update userUpdateBody**

Replace the parent field block in `userUpdateBody` (lines ~82-87):

Old:
```go
	Level             *string `json:"level,omitempty"             validate:"omitempty"`
	ParentName        *string `json:"parentName,omitempty"        validate:"omitempty,max=200"`
	ParentTitle       *string `json:"parentTitle,omitempty"       validate:"omitempty,max=80"`
	ParentPhone       *string `json:"parentPhone,omitempty"       validate:"omitempty,max=64"`
	ParentPhoneRegion *string `json:"parentPhoneRegion,omitempty" validate:"omitempty,oneof=ID SG US CA"`
	ParentEmail       *string `json:"parentEmail,omitempty"       validate:"omitempty"`
```

New:
```go
	Level       *string `json:"level,omitempty"       validate:"omitempty"`
	PhoneRegion *string `json:"phoneRegion,omitempty" validate:"omitempty,oneof=ID SG US CA"`

	// Ortu links (murid only). Set AyahID/IbuID to link; ClearAyahID/ClearIbuID to unlink.
	AyahID     *string `json:"ayahId,omitempty"`
	ClearAyahID bool   `json:"clearAyahId,omitempty"`
	IbuID      *string `json:"ibuId,omitempty"`
	ClearIbuID  bool   `json:"clearIbuId,omitempty"`
```

- [ ] **Step 3: Update Create handler**

In the `Create` handler, replace the `in := store.UserCreateInput{...}` block to remove parent fields and add `PhoneRegion`. The region defaults to "ID" if not provided:

Old lines in the in struct (lines ~176-180):
```go
		ParentName:        trimOptional(b.ParentName),
		ParentTitle:       trimOptional(b.ParentTitle),
		ParentPhone:       trimOptional(b.ParentPhone),
		ParentPhoneRegion: trimOptional(b.ParentPhoneRegion),
		ParentEmail:       trimOptional(b.ParentEmail),
```

Replace with:
```go
		PhoneRegion: func() string {
			if b.PhoneRegion != nil && *b.PhoneRegion != "" {
				return *b.PhoneRegion
			}
			return "ID"
		}(),
```

Then, after `httpx.JSON(w, http.StatusCreated, u)` (at the end of Create), add ortu link handling BEFORE the JSON write:

Replace the final lines of Create:
```go
	u, err := h.users.Create(r.Context(), in)
	if err != nil {
		if isUniqueConflict(err) {
			httpx.Error(w, http.StatusConflict, "conflict", "Email atau nama pengguna sudah terpakai")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menyimpan pengguna")
		return
	}
	if model.Role(b.Role) == model.RoleMurid {
		if b.AyahID != nil && *b.AyahID != "" {
			_ = h.users.SetMuridOrtu(r.Context(), u.ID, "ayah", *b.AyahID)
		}
		if b.IbuID != nil && *b.IbuID != "" {
			_ = h.users.SetMuridOrtu(r.Context(), u.ID, "ibu", *b.IbuID)
		}
		if links, err2 := h.users.GetMuridOrtu(r.Context(), u.ID); err2 == nil {
			u.Ortu = links
		}
	}
	httpx.JSON(w, http.StatusCreated, u)
```

- [ ] **Step 4: Update Get handler**

Replace:
```go
func (h *Users) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	u, err := h.users.FindByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Pengguna tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil data pengguna")
		return
	}
	httpx.JSON(w, http.StatusOK, u)
}
```

With:
```go
func (h *Users) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	u, err := h.users.FindByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Pengguna tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil data pengguna")
		return
	}
	if u.Role == model.RoleMurid {
		if links, err2 := h.users.GetMuridOrtu(r.Context(), id); err2 == nil {
			u.Ortu = links
		}
	}
	httpx.JSON(w, http.StatusOK, u)
}
```

- [ ] **Step 5: Update Update handler**

In the `in := store.UserUpdateInput{...}` block, remove parent fields and add PhoneRegion:

Old lines:
```go
		ParentName:        b.ParentName,
		ParentTitle:       b.ParentTitle,
		ParentPhone:       b.ParentPhone,
		ParentPhoneRegion: b.ParentPhoneRegion,
		ParentEmail:       b.ParentEmail,
```

Replace with:
```go
		PhoneRegion: b.PhoneRegion,
```

Then, after `u, err := h.users.Update(r.Context(), id, in)` succeeds, add ortu link handling BEFORE `httpx.JSON(w, http.StatusOK, u)`:

```go
	u, err := h.users.Update(r.Context(), id, in)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Pengguna tidak ditemukan")
			return
		}
		if isUniqueConflict(err) {
			httpx.Error(w, http.StatusConflict, "conflict", "Email atau nama pengguna sudah terpakai")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal memperbarui pengguna")
		return
	}
	if u.Role == model.RoleMurid {
		if b.ClearAyahID {
			_ = h.users.RemoveMuridOrtu(r.Context(), id, "ayah")
		} else if b.AyahID != nil && *b.AyahID != "" {
			if err2 := h.users.SetMuridOrtu(r.Context(), id, "ayah", *b.AyahID); err2 != nil {
				httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menghubungkan ortu ayah")
				return
			}
		}
		if b.ClearIbuID {
			_ = h.users.RemoveMuridOrtu(r.Context(), id, "ibu")
		} else if b.IbuID != nil && *b.IbuID != "" {
			if err2 := h.users.SetMuridOrtu(r.Context(), id, "ibu", *b.IbuID); err2 != nil {
				httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menghubungkan ortu ibu")
				return
			}
		}
		if links, err2 := h.users.GetMuridOrtu(r.Context(), id); err2 == nil {
			u.Ortu = links
		}
	}
	httpx.JSON(w, http.StatusOK, u)
```

- [ ] **Step 6: Run Go tests**

```bash
make test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add internal/handler/users.go
git commit -m "feat(handler): add ortu link management to user create/get/update"
```

---

## Task 9: Update frontend api/users.ts

**Files:**
- Modify: `web/app/src/api/users.ts`

- [ ] **Step 1: Add OrtuLink type and update ManagedUser**

Replace the entire file content with:

```typescript
import { apiFetch } from './client'

export const USER_ROLES = ['admin', 'pengurus', 'guru', 'ortu', 'murid'] as const
export type UserRole = (typeof USER_ROLES)[number]

export const STUDENT_LEVELS = ['Caberawit', 'Pra Remaja', 'Remaja', 'Pra Nikah'] as const
export type StudentLevel = (typeof STUDENT_LEVELS)[number]

export type Gender = 'male' | 'female'

export type PhoneRegion = 'ID' | 'SG' | 'US' | 'CA'

export type OrtuLink = {
  relation: 'ayah' | 'ibu'
  user: {
    id: string
    name: string
    noHp?: string
    phoneRegion?: PhoneRegion
    email?: string
    active: boolean
  }
}

export type ManagedUser = {
  // Auth
  id: string
  email: string
  username?: string
  name: string
  role: UserRole
  active: boolean

  // Shared profile
  nickname?: string
  dateOfBirth?: string
  gender?: Gender
  noHp?: string
  alamat?: string
  kelompok?: string
  phoneRegion?: PhoneRegion

  // Murid
  level?: StudentLevel
  ortu?: OrtuLink[] // linked parent accounts (populated on single-user GET)

  // Locality + free-form notes
  desa?: string
  daerah?: string
  notes?: string

  // Photo
  photoUrl?: string

  // Taaruf-style biodata extensions.
  userCode?: string | null
  tempatLahir?: string | null
  pendidikan?: string | null
  pekerjaan?: string | null
  urutan?: number
  hideDob?: boolean
  tglDaftar?: string | null
  timezone?: string | null

  createdAt: string
  updatedAt: string
}

export type ManagedUserList = {
  items: ManagedUser[]
  total: number
}

export type UserCreateInput = {
  email: string
  username?: string
  name: string
  password: string
  role: UserRole
  nickname?: string
  dateOfBirth?: string
  gender?: Gender
  noHp?: string
  alamat?: string
  kelompok?: string
  phoneRegion?: PhoneRegion
  level?: StudentLevel
  ayahId?: string
  ibuId?: string
  desa?: string
  daerah?: string
  notes?: string
  userCode?: string
  tempatLahir?: string
  pendidikan?: string
  pekerjaan?: string
  urutan?: number
  hideDob?: boolean
  tglDaftar?: string
}

export type UserUpdateInput = Partial<Omit<UserCreateInput, 'password'>> & {
  active?: boolean
  clearAyahId?: boolean
  clearIbuId?: boolean
}

export function listUsers(
  params: { q?: string; role?: UserRole; active?: boolean; limit?: number; offset?: number } = {},
) {
  const sp = new URLSearchParams()
  if (params.q) sp.set('q', params.q)
  if (params.role) sp.set('role', params.role)
  if (params.active !== undefined) sp.set('active', String(params.active))
  if (params.limit) sp.set('limit', String(params.limit))
  if (params.offset) sp.set('offset', String(params.offset))
  const qs = sp.toString()
  return apiFetch<ManagedUserList>(`/api/users${qs ? `?${qs}` : ''}`)
}

export function getUser(id: string) {
  return apiFetch<ManagedUser>(`/api/users/${id}`)
}

export function createUser(input: UserCreateInput) {
  return apiFetch<ManagedUser>('/api/users', { method: 'POST', body: input })
}

export function updateUser(id: string, input: UserUpdateInput) {
  return apiFetch<ManagedUser>(`/api/users/${id}`, { method: 'PATCH', body: input })
}

export function deleteUser(id: string) {
  return apiFetch<void>(`/api/users/${id}`, { method: 'DELETE' })
}

export function setUserPassword(id: string, password: string) {
  return apiFetch<void>(`/api/users/${id}/password`, {
    method: 'POST',
    body: { password },
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add web/app/src/api/users.ts
git commit -m "feat(api): add OrtuLink type; remove parent fields from ManagedUser"
```

---

## Task 10: Update frontend api/types.ts

**Files:**
- Modify: `web/app/src/api/types.ts`

Remove `parentName`, `parentTitle`, `parentPhone`, `parentPhoneRegion`, `parentEmail` from `Student`, `StudentInput`, `Teacher`, `TeacherInput`. These fields no longer exist in the backend response.

- [ ] **Step 1: Update Student type**

Remove from the `Student` type (lines ~39-43):
```typescript
  parentName?: string
  parentTitle?: string
  parentPhone?: string
  parentPhoneRegion?: 'ID' | 'SG' | 'US' | 'CA'
  parentEmail?: string
```

- [ ] **Step 2: Update StudentInput type**

Remove from `StudentInput` (lines ~79-83):
```typescript
  parentName?: string
  parentTitle?: string
  parentPhone?: string
  parentPhoneRegion?: 'ID' | 'SG' | 'US' | 'CA'
  parentEmail?: string
```

- [ ] **Step 3: Update Teacher type**

Remove from `Teacher` (lines ~118-122):
```typescript
  parentName?: string
  parentTitle?: string
  parentPhone?: string
  parentPhoneRegion?: 'ID' | 'SG' | 'US' | 'CA'
  parentEmail?: string
```

- [ ] **Step 4: Update TeacherInput type**

Remove from `TeacherInput` (lines ~155-159):
```typescript
  parentName?: string
  parentTitle?: string
  parentPhone?: string
  parentPhoneRegion?: 'ID' | 'SG' | 'US' | 'CA'
  parentEmail?: string
```

- [ ] **Step 5: Run typecheck**

```bash
make typecheck
```

Fix any TypeScript errors from removed fields (e.g., in StudentForm.tsx where parentName/parentPhone/parentEmail are referenced — those references will be removed in Task 11).

- [ ] **Step 6: Commit**

```bash
git add web/app/src/api/types.ts
git commit -m "feat(types): remove legacy parent fields from Student/Teacher types"
```

---

## Task 11: Update StudentForm.tsx — remove old parent section

**Files:**
- Modify: `web/app/src/components/StudentForm.tsx`

The `StudentForm` is used by the legacy Generus page. Remove the old parent section entirely (the new ortu management is in the Users edit form — see Task 12).

- [ ] **Step 1: Remove parentName/parentPhone/parentEmail from schema**

In `StudentForm.tsx`, remove from the zod schema (lines ~38-40):
```typescript
  parentName: z.string().max(200).optional().or(z.literal('')),
  parentPhone: z.string().max(64).optional().or(z.literal('')),
  parentEmail: z.string().email('Format email tidak valid').optional().or(z.literal('')),
```

- [ ] **Step 2: Remove from defaultValues**

Remove from `useForm` defaultValues (lines ~74-76):
```typescript
      parentName: initial?.parentName ?? '',
      parentPhone: initial?.parentPhone ?? '',
      parentEmail: initial?.parentEmail ?? '',
```

- [ ] **Step 3: Remove from onSubmit mapping**

Remove from `handleSubmit` callback (lines ~97-99):
```typescript
          parentName: v.parentName || undefined,
          parentPhone: v.parentPhone || undefined,
          parentEmail: v.parentEmail || undefined,
```

- [ ] **Step 4: Remove the "Orang Tua (opsional)" Section from JSX**

Remove the entire section (lines ~200-217):
```tsx
      <Section title="Orang Tua (opsional)">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nama Orang Tua" htmlFor="parentName" error={errors.parentName?.message}>
            <Input id="parentName" {...register('parentName')} />
          </Field>
          <Field label="Telepon Orang Tua" htmlFor="parentPhone" error={errors.parentPhone?.message}>
            <Input id="parentPhone" {...register('parentPhone')} />
          </Field>
          <Field
            label="Email Orang Tua"
            htmlFor="parentEmail"
            error={errors.parentEmail?.message}
            className="sm:col-span-2"
          >
            <Input id="parentEmail" type="email" {...register('parentEmail')} />
          </Field>
        </div>
      </Section>
```

- [ ] **Step 5: Typecheck**

```bash
make typecheck
```

Expected: no errors from StudentForm.

- [ ] **Step 6: Commit**

```bash
git add web/app/src/components/StudentForm.tsx
git commit -m "feat(StudentForm): remove legacy parent fields"
```

---

## Task 12: Create OrtuPicker component

**Files:**
- Create: `web/app/src/components/OrtuPicker.tsx`

This component handles one ortu slot (ayah OR ibu). It shows a search combobox for existing ortu users, an inline creation mini-form, and a linked card with unlink button.

- [ ] **Step 1: Create OrtuPicker.tsx**

```tsx
// web/app/src/components/OrtuPicker.tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'

import {
  listUsers,
  createUser,
  type OrtuLink,
  type PhoneRegion,
} from '@/api/users'
import { Button } from './Button'
import { Input } from './Input'
import { Field } from './Field'

const PHONE_REGIONS: PhoneRegion[] = ['ID', 'SG', 'US', 'CA']

type Props = {
  /** "ayah" or "ibu" */
  relation: 'ayah' | 'ibu'
  /** Currently linked ortu, if any */
  linked?: OrtuLink['user']
  /** Called when user picks an existing ortu or creates a new one */
  onLink: (ortuId: string) => void
  /** Called when user clicks unlink */
  onUnlink: () => void
  disabled?: boolean
}

export function OrtuPicker({ relation, linked, onLink, onUnlink, disabled }: Props) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [query, setQuery] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newRegion, setNewRegion] = useState<PhoneRegion>('ID')

  const searchQ = useQuery({
    queryKey: ['ortu-search', query],
    queryFn: () => listUsers({ role: 'ortu', q: query, limit: 20 }),
    enabled: query.length >= 1,
  })

  const createMut = useMutation({
    mutationFn: () =>
      createUser({
        name: newName.trim(),
        email: `ortu.new.${Date.now()}@placeholder.local`,
        password: Math.random().toString(36).slice(2, 14),
        role: 'ortu',
        noHp: newPhone.trim() || undefined,
        phoneRegion: newRegion,
        active: false,
      } as any),
    onSuccess: (ortu) => {
      qc.invalidateQueries({ queryKey: ['ortu-search'] })
      setShowCreate(false)
      setQuery('')
      setNewName('')
      setNewPhone('')
      setNewRegion('ID')
      onLink(ortu.id)
    },
  })

  const label = relation === 'ayah' ? t('users.ortu.ayah') : t('users.ortu.ibu')

  if (linked) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-900 truncate">{linked.name}</p>
          {linked.noHp && (
            <p className="text-xs text-slate-500">
              {linked.noHp} ({linked.phoneRegion ?? 'ID'})
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onUnlink}
          disabled={disabled}
          className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 disabled:opacity-40"
          title={t('users.ortu.unlinkTitle', { label })}
        >
          <X size={14} />
        </button>
      </div>
    )
  }

  const results = searchQ.data?.items ?? []

  return (
    <div className="space-y-2">
      <div className="relative">
        <Input
          placeholder={t('users.ortu.searchPh', { label })}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setShowCreate(false)
          }}
          disabled={disabled}
        />
        {query && results.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg">
            {results.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-slate-100"
                  onClick={() => {
                    setQuery('')
                    onLink(u.id)
                  }}
                >
                  <span className="font-medium">{u.name}</span>
                  {u.noHp && <span className="ml-2 text-xs text-slate-500">{u.noHp}</span>}
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm text-emerald-700 hover:bg-emerald-50"
                onClick={() => {
                  setNewName(query)
                  setShowCreate(true)
                  setQuery('')
                }}
              >
                + {t('users.ortu.createNew', { name: query })}
              </button>
            </li>
          </ul>
        )}
        {query && results.length === 0 && !searchQ.isFetching && (
          <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg">
            <button
              type="button"
              className="w-full px-3 py-2 text-left text-sm text-emerald-700 hover:bg-emerald-50"
              onClick={() => {
                setNewName(query)
                setShowCreate(true)
                setQuery('')
              }}
            >
              + {t('users.ortu.createNew', { name: query })}
            </button>
          </div>
        )}
      </div>

      {showCreate && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-2">
          <p className="text-xs font-semibold text-emerald-800">
            {t('users.ortu.createTitle', { label })}
          </p>
          <Field label={t('users.ortu.nameLabel')} htmlFor={`ortu-name-${relation}`}>
            <Input
              id={`ortu-name-${relation}`}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('users.ortu.phoneLabel')} htmlFor={`ortu-phone-${relation}`}>
              <Input
                id={`ortu-phone-${relation}`}
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="08xx"
              />
            </Field>
            <Field label={t('users.ortu.regionLabel')} htmlFor={`ortu-region-${relation}`}>
              <select
                id={`ortu-region-${relation}`}
                value={newRegion}
                onChange={(e) => setNewRegion(e.target.value as PhoneRegion)}
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm"
              >
                {PHONE_REGIONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={!newName.trim() || createMut.isPending}
              onClick={() => createMut.mutate()}
            >
              {createMut.isPending ? t('common.saving') : t('users.ortu.saveNew')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShowCreate(false)}
            >
              {t('common.cancel')}
            </Button>
          </div>
          {createMut.isError && (
            <p className="text-xs text-red-600">{String(createMut.error)}</p>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Run typecheck**

```bash
make typecheck
```

- [ ] **Step 3: Commit**

```bash
git add web/app/src/components/OrtuPicker.tsx
git commit -m "feat(ui): add OrtuPicker component for murid-ortu linking"
```

---

## Task 13: Update Users.tsx — add ortu section to UserEditForm

**Files:**
- Modify: `web/app/src/pages/Users.tsx`

Add imports for `OrtuPicker` and `updateUser`. Add ortu state to `UserEditForm`. Add a new "Identitas Orang Tua" section that renders two `OrtuPicker` slots (ayah + ibu) — visible only when the user's role is `murid`.

- [ ] **Step 1: Add OrtuPicker import**

At the top of `Users.tsx`, add:
```tsx
import { OrtuPicker } from '@/components/OrtuPicker'
```

- [ ] **Step 2: Add ortu state to UserEditForm**

Inside `UserEditForm` (after the existing `useState<EditValues>` line), add:

```tsx
  const [ayahId, setAyahId] = useState<string | null>(
    initial.ortu?.find((o) => o.relation === 'ayah')?.user.id ?? null,
  )
  const [ibuId, setIbuId] = useState<string | null>(
    initial.ortu?.find((o) => o.relation === 'ibu')?.user.id ?? null,
  )
  const [clearAyah, setClearAyah] = useState(false)
  const [clearIbu, setClearIbu] = useState(false)

  const linkedAyah = initial.ortu?.find((o) => o.relation === 'ayah')?.user
  const linkedIbu = initial.ortu?.find((o) => o.relation === 'ibu')?.user
```

- [ ] **Step 3: Include ortu link fields in onSubmit**

In the form `onSubmit` call, add ortu link fields to the `UserUpdateInput` being passed:

After `kelompok: f.kelompok.trim(),` add:
```tsx
          ...(f.role === 'murid' ? {
            ayahId: ayahId ?? undefined,
            clearAyahId: clearAyah,
            ibuId: ibuId ?? undefined,
            clearIbuId: clearIbu,
          } : {}),
```

- [ ] **Step 4: Add "Identitas Orang Tua" section to the form JSX**

After the closing `</section>` of the Profil section (before `{apiError ...}`), add:

```tsx
      {f.role === 'murid' && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-700">
            {t('users.ortu.sectionTitle')}
          </h3>
          <div className="space-y-3">
            <div>
              <p className="mb-1.5 text-xs font-medium text-slate-600">{t('users.ortu.ayah')}</p>
              <OrtuPicker
                relation="ayah"
                linked={clearAyah ? undefined : (ayahId ? linkedAyah : undefined)}
                onLink={(id) => { setAyahId(id); setClearAyah(false) }}
                onUnlink={() => { setAyahId(null); setClearAyah(true) }}
                disabled={pending}
              />
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-slate-600">{t('users.ortu.ibu')}</p>
              <OrtuPicker
                relation="ibu"
                linked={clearIbu ? undefined : (ibuId ? linkedIbu : undefined)}
                onLink={(id) => { setIbuId(id); setClearIbu(false) }}
                onUnlink={() => { setIbuId(null); setClearIbu(true) }}
                disabled={pending}
              />
            </div>
          </div>
        </section>
      )}
```

- [ ] **Step 5: Typecheck**

```bash
make typecheck
```

- [ ] **Step 6: Commit**

```bash
git add web/app/src/pages/Users.tsx
git commit -m "feat(users): add ortu picker section to murid edit form"
```

---

## Task 14: Update EndSesiSummaryDialog.tsx

**Files:**
- Modify: `web/app/src/components/EndSesiSummaryDialog.tsx`

Replace parent contact access (`murid.parentPhone` / `murid.parentPhoneRegion`) with `murid.ortu` links. Add per-parent checkboxes so guru can choose to send to ayah, ibu, or both.

- [ ] **Step 1: Add per-parent send state**

After the `const [previewFor, setPreviewFor] = useState<string | null>(null)` line, add:

```tsx
  // per-anggota send targets: Record<muridUserId, Set<'ayah'|'ibu'>>
  const [sendTargets, setSendTargets] = useState<Record<string, Set<string>>>({})

  const toggleTarget = (muridId: string, relation: string) => {
    setSendTargets((prev) => {
      const cur = new Set(prev[muridId] ?? [])
      if (cur.has(relation)) cur.delete(relation)
      else cur.add(relation)
      return { ...prev, [muridId]: cur }
    })
  }

  const targetFor = (murid: ManagedUser) => {
    if (sendTargets[murid.id]) return sendTargets[murid.id]
    // Default: all ortu with a phone number are checked
    const defaults = new Set<string>()
    for (const link of murid.ortu ?? []) {
      if (link.user.noHp) defaults.add(link.relation)
    }
    return defaults
  }
```

- [ ] **Step 2: Update messageFor to accept an OrtuLink**

Replace the existing `messageFor` function:

```tsx
  const messageFor = (
    murid: ManagedUser | null | undefined,
    ortuLink: { relation: string; user: { name: string; noHp?: string; phoneRegion?: string } },
  ): { url: string | null; preview: string } => {
    if (!murid) return { url: null, preview: '' }
    const phone = toE164(ortuLink.user.phoneRegion, ortuLink.user.noHp)
    const salutation = ortuLink.relation === 'ayah' ? 'Bapak' : 'Ibu'
    const materiList =
      diajarkan.length === 0
        ? t('sesiDialog.summary.noMateriRecorded')
        : diajarkan.map((it) => `• ${labelFor(it)}`).join('\n')
    const reviewItems = diajarkan
      .map((it) => ({ ...it, ...(edits[it.id] ?? { review: it.needsParentReview, note: it.parentNote ?? '' }) }))
      .filter((it) => it.review)
    const reviewSection =
      reviewItems.length === 0
        ? ''
        : t('sesiDialog.summary.reviewSectionHeader') + '\n' +
          reviewItems
            .map((it) => `• ${labelFor(it)}${it.note ? `\n   ${t('sesiDialog.summary.reviewItemNote', { note: it.note })}` : ''}`)
            .join('\n')
    const msg = buildMessage(waTemplate, {
      salutation,
      parent_name: ortuLink.user.name,
      murid_name: murid.name,
      topik: sesi.topik,
      tanggal: fmtDate(sesi.tanggal, months),
      durasi: fmtDuration(sesi.startedAt, sesi.endedAt),
      materi_list: materiList,
      review_section: reviewSection,
    })
    if (!phone) return { url: null, preview: msg }
    return { url: `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, preview: msg }
  }
```

- [ ] **Step 3: Update the WA send section in JSX**

Find the section in the JSX that renders per-anggota WA buttons (the part using `messageFor`). Replace it with a section that iterates over each murid's ortu links:

```tsx
{/* WhatsApp per anggota */}
{anggota.map((a, i) => {
  const murid = userQs[i]?.data
  if (!murid) return null
  const links = murid.ortu ?? []
  const targets = targetFor(murid)
  return (
    <div key={a.muridUserId} className="rounded-lg border border-slate-200 p-3">
      <p className="mb-2 text-sm font-medium text-slate-900">{murid.name}</p>
      {links.length === 0 ? (
        <p className="text-xs text-slate-400">{t('sesiDialog.summary.contactIncomplete')}</p>
      ) : (
        <div className="space-y-1.5">
          {links.map((link) => {
            const { url } = messageFor(murid, link)
            const label = link.relation === 'ayah' ? t('users.ortu.ayah') : t('users.ortu.ibu')
            const checked = targets.has(link.relation)
            return (
              <div key={link.relation} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`wa-${murid.id}-${link.relation}`}
                  checked={checked}
                  onChange={() => toggleTarget(murid.id, link.relation)}
                  disabled={!link.user.noHp}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                />
                <label
                  htmlFor={`wa-${murid.id}-${link.relation}`}
                  className="flex-1 text-xs text-slate-700"
                >
                  {label} — {link.user.name}
                  {link.user.noHp
                    ? ` · ${link.user.noHp} (${link.user.phoneRegion ?? 'ID'})`
                    : ` · ${t('sesiDialog.summary.noPhone')}`}
                </label>
                {url && checked && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded bg-emerald-600 px-2 py-0.5 text-xs text-white hover:bg-emerald-700"
                  >
                    WA
                  </a>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
})}
```

- [ ] **Step 4: Typecheck**

```bash
make typecheck
```

- [ ] **Step 5: Commit**

```bash
git add web/app/src/components/EndSesiSummaryDialog.tsx
git commit -m "feat(sesi): update WA report to use ortu links with per-parent checkboxes"
```

---

## Task 15: Update locale files

**Files:**
- Modify: `web/app/src/locales/id.json`
- Modify: `web/app/src/locales/en.json`

- [ ] **Step 1: Update id.json**

In the `users` section, replace/update the `murid` subsection and add an `ortu` subsection. Remove old `parentTitle`, `parentName`, `parentPhone`, `parentPhoneRO`, `parentPhonePh`, `parentEmail` keys from `users.userDetail.murid`.

Add to `users` (at the same level as `userDetail`):
```json
"ortu": {
  "sectionTitle": "Identitas Orang Tua",
  "ayah": "Ayah",
  "ibu": "Ibu",
  "searchPh": "Cari {{label}}…",
  "createNew": "Tambah \"{{name}}\" sebagai akun ortu baru",
  "createTitle": "Buat akun {{label}} baru",
  "nameLabel": "Nama",
  "phoneLabel": "No. HP",
  "regionLabel": "Region",
  "saveNew": "Simpan & Hubungkan",
  "unlinkTitle": "Hapus link {{label}}"
},
```

Also add `noPhone` to `sesiDialog.summary`:
```json
"noPhone": "Belum ada nomor WA",
```

- [ ] **Step 2: Update en.json**

Add the same structure in English:
```json
"ortu": {
  "sectionTitle": "Parent Identity",
  "ayah": "Father",
  "ibu": "Mother",
  "searchPh": "Search {{label}}…",
  "createNew": "Add \"{{name}}\" as new parent account",
  "createTitle": "Create new {{label}} account",
  "nameLabel": "Name",
  "phoneLabel": "Phone",
  "regionLabel": "Region",
  "saveNew": "Save & Link",
  "unlinkTitle": "Remove {{label}} link"
},
```

```json
"noPhone": "No WA number",
```

- [ ] **Step 3: Commit**

```bash
git add web/app/src/locales/id.json web/app/src/locales/en.json
git commit -m "feat(i18n): add ortu locale keys; remove legacy parent keys"
```

---

## Task 16: Build, typecheck, and browser test

- [ ] **Step 1: Run full Go tests**

```bash
make test
```

Expected: all tests pass.

- [ ] **Step 2: Run typecheck**

```bash
make typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Rebuild container**

```bash
docker-compose up -d --build
```

- [ ] **Step 4: Smoke test healthz**

```bash
curl http://127.0.0.1:8300/healthz
```

Expected: `{"status":"ok"}` or 200 OK.

- [ ] **Step 5: Browser test — Users page (murid role)**

1. Log in as admin at `http://127.0.0.1:8300`
2. Navigate to Users (Pengguna) page
3. Open edit dialog for a murid user
4. Confirm new "Identitas Orang Tua" section appears with Ayah and Ibu OrtuPicker slots
5. Search for an existing ortu user → pick them → save → confirm link persists on reload
6. Open the linked ortu slot → click unlink → save → confirm removal

- [ ] **Step 6: Browser test — Create new ortu inline**

1. In the OrtuPicker, type a name not in the system
2. Click "Tambah [name] sebagai akun ortu baru"
3. Fill in phone + region → click "Simpan & Hubungkan"
4. Confirm the new ortu user appears in the Users list with role=ortu and active=false
5. Confirm the murid is now linked to this ortu as ayah/ibu

- [ ] **Step 7: Browser test — EndSesiSummaryDialog**

1. Start a sesi that has murid with linked ortu
2. End the sesi → open the summary dialog
3. Confirm checkboxes appear per parent (Ayah / Ibu) with name + phone
4. Uncheck one → confirm WA button disappears for that parent
5. Click WA button → confirm it opens `https://wa.me/...` with correct E.164 number

- [ ] **Step 8: Verify migrated data**

If the DB had murid with old `parent_*` fields, confirm after rebuild that:
- A new ortu user was created with `role=ortu, active=false`
- The murid shows the linked ortu under "Ayah" in the edit form
- EndSesiSummaryDialog shows the ortu contact for that murid
