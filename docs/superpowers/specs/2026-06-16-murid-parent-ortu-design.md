# Murid — Identitas Orang Tua (Ortu sebagai User)

**Date:** 2026-06-16  
**Status:** Approved  

## Background

Sistem GNRS saat ini menyimpan informasi orang tua murid sebagai field free-form di tabel `users` (`parent_name`, `parent_phone`, `parent_phone_region`, dll). Field ini dipakai untuk kirim laporan WhatsApp setelah sesi mengajar via `EndSesiSummaryDialog`.

Kebutuhan baru: orang tua (ayah dan ibu) diperlakukan sebagai **user aplikasi** dengan role `ortu` — akun penuh yang suatu saat bisa login — bukan sekadar data kontak teks. Murid perlu dilink ke akun ortu masing-masing untuk ayah dan ibu secara terpisah.

## Goals

- Orang tua menjadi user berakun role `ortu` (sementara `active=false`, tanpa username/password)
- Murid dilink ke ortu ayah dan/atau ibu via junction table
- Form murid menampilkan section "Identitas Orang Tua" dengan picker ortu
- Laporan WA setelah sesi menggunakan nomor ortu user, dengan guru bisa pilih kirim ke ayah, ibu, atau keduanya
- Data parent lama (free-form fields) dimigrasikan ke akun ortu baru

## Data Model

### Tabel baru: `murid_ortu`

```sql
CREATE TABLE murid_ortu (
  murid_id   INTEGER NOT NULL REFERENCES users(id),
  ortu_id    INTEGER NOT NULL REFERENCES users(id),
  relation   TEXT    NOT NULL CHECK(relation IN ('ayah','ibu')),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (murid_id, relation)
);
```

`PRIMARY KEY (murid_id, relation)` menjamin maks 1 ayah + 1 ibu per murid. Satu ortu bisa dilink ke banyak murid (kakak-adik share satu akun ortu).

### Kolom baru di `users`

```sql
ALTER TABLE users ADD COLUMN phone_region TEXT NOT NULL DEFAULT 'ID';
```

Menggantikan `parent_phone_region` yang sekarang ada di murid. Untuk ortu user, `phone_region` menyimpan region kode telepon mereka sendiri (ID/SG/US/CA) untuk normalisasi E.164 ke WhatsApp.

### Kolom yang dihapus dari `users`

Setelah migrasi data, drop: `parent_name`, `parent_title`, `parent_phone`, `parent_phone_region`, `parent_email`.

### Urutan migrasi (dimulai dari 046)

| # | Isi |
|---|-----|
| 046 | Tambah `phone_region` ke `users` |
| 047 | Buat tabel `murid_ortu` |
| 048 | Migrasi data: buat akun ortu dari `parent_name`/`parent_phone`, link ke murid sebagai `ayah` |
| 049 | Drop kolom `parent_*` dari `users` (SQLite: recreate table) |

#### Logika migrasi 048

```sql
-- Buat akun ortu dari parent fields yang terisi
INSERT INTO users (name, no_hp, phone_region, role, active, created_at, updated_at)
SELECT parent_name,
       parent_phone,
       COALESCE(parent_phone_region, 'ID'),
       'ortu', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM users
WHERE role = 'murid'
  AND parent_name IS NOT NULL AND trim(parent_name) != '';

-- Link ke murid_ortu sebagai 'ayah' (default untuk data lama)
INSERT INTO murid_ortu (murid_id, ortu_id, relation, created_at)
SELECT u.id,
       (SELECT id FROM users
        WHERE name = u.parent_name AND role = 'ortu'
        ORDER BY created_at DESC LIMIT 1),
       'ayah', CURRENT_TIMESTAMP
FROM users u
WHERE u.role = 'murid'
  AND u.parent_name IS NOT NULL AND trim(u.parent_name) != '';
```

Data lama di-assign ke `ayah` secara default — admin bisa re-link ke `ibu` via UI setelah migrasi.

## Backend

### Model (`internal/model/model.go`)

- Tambah `PhoneRegion string` ke `User` struct
- Hapus `ParentName`, `ParentTitle`, `ParentPhone`, `ParentPhoneRegion`, `ParentEmail` dari `User` struct
- Tambah struct baru:

```go
type OrtuLink struct {
    Relation string `json:"relation"` // "ayah" | "ibu"
    User     User   `json:"user"`
}
```

### Store (`internal/store/users.go`)

Tambah fungsi:
- `GetMuridOrtu(ctx, muridID) ([]OrtuLink, error)` — ambil linked ortu untuk satu murid
- `SetMuridOrtu(ctx, muridID, relation, ortuID) error` — insert/replace link (upsert)
- `RemoveMuridOrtu(ctx, muridID, relation) error` — hapus link
- `ListOrtuUsers(ctx) ([]User, error)` — list semua user role=ortu untuk picker frontend

Update SELECT query di `GetUser` / `ListUsers` untuk include `phone_region`, hapus `parent_*` columns.

### Handlers (`internal/handler/users.go`)

**`userCreateBody` / `userUpdateBody`:** Hapus field `ParentName`, `ParentTitle`, `ParentPhone`, `ParentPhoneRegion`, `ParentEmail`. Tambah `AyahID *int` dan `IbuID *int`.

**`PUT /api/users/:id`:** Setelah update user, jika `AyahID` atau `IbuID` disertakan dalam body, update junction table dalam transaksi yang sama. Kalau dikirim `null`, hapus link.

**`GET /api/users/:id`:** Response include field `ortu: []OrtuLink` (hasil `GetMuridOrtu`).

**`GET /api/users?role=ortu`:** Endpoint existing sudah support filter role — dipakai frontend untuk picker.

### Phone Region Validation

Tambah `phone_region` ke enum validation di handler (sama seperti `parent_phone_region` sekarang): `ID | SG | US | CA`.

## Frontend

### API Types (`web/app/src/api/types.ts`)

- Hapus `parentName`, `parentTitle`, `parentPhone`, `parentPhoneRegion`, `parentEmail` dari `StudentInput` dan `TeacherInput`
- Tambah `phoneRegion?: 'ID' | 'SG' | 'US' | 'CA'` ke `User` type
- Tambah `OrtuLink` type dan `ayahId?: number`, `ibuId?: number` ke `StudentInput`
- Tambah `OrtuUser` type (subset User: id, name, noHp, phoneRegion)

### StudentForm (`web/app/src/components/StudentForm.tsx`)

Hapus field `parentName`, `parentPhone`, `parentEmail` dari form schema dan UI.

Tambah section **"Identitas Orang Tua"** yang muncul hanya ketika `role === 'murid'`. Section ini berisi dua subsection identik (Ayah / Ibu):

- **Combobox picker**: ketik nama → search dari `GET /api/users?role=ortu` → pilih existing user
- Opsi **"+ Tambah [nama] sebagai ortu baru"** di dropdown → mini inline form (Nama, No HP, Phone Region)
- Saat submit dengan ortu baru: `POST /api/users` (role=ortu, active=false) dulu, dapat ID-nya, lalu submit murid form dengan `ayah_id` / `ibu_id`
- Jika ortu sudah linked: tampil card ringkas (nama + no HP) + tombol **Hapus link** (unlink saja, tidak delete akun)

### User Form / UserNew Page

Tambah `phone_region` field ke form ortu user (muncul di create/edit user dengan role=ortu).

### EndSesiSummaryDialog (`web/app/src/components/EndSesiSummaryDialog.tsx`)

Update logika WhatsApp:
1. Untuk setiap murid: fetch `ortu` links via `GET /api/users/:muridId` (response sudah include `ortu: []OrtuLink`)
2. Tampilkan checkboxes per murid:
   ```
   Ahmad Fauzi
     ☑ Ayah — Bpk. Rudi   0812-xxxx (ID)
     ☑ Ibu  — Ibu Sari    0857-xxxx (ID)
   ```
   Default: semua tercentang kalau nomor ada
3. Nomor yang dipakai: ortu user's `noHp` + `phoneRegion` → `toE164()`
4. Salutation di template: `{salutation}` → "Bapak" untuk ayah, "Ibu" untuk ibu (dari `relation`)

### Locale Strings

Tambah key baru di `id` dan `en`:
- `identitas_orang_tua`, `ayah`, `ibu`, `cari_ortu`, `tambah_ortu_baru`, `hapus_link_ortu`, `pilih_atau_tambah_ortu`

## What's Not Changing

- Endpoint `GET /api/users?role=ortu` sudah ada — tidak perlu endpoint baru
- `toE164()` function di `EndSesiSummaryDialog` tetap dipakai, hanya sumber data berubah
- WA template system dan `wa_summary_template` setting tidak berubah
- Role `ortu` sudah ada di schema — tidak perlu tambah role baru
