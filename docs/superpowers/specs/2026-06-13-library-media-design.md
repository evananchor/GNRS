# PPT & Video in Library + ad-hoc live display (switch-level mirroring)

**Date:** 2026-06-13 · **Status:** Approved (option 1) · **Track:** gnrs-evan

Add **PPT** (Google Slides/Canva embed) and **Video** (YouTube embed) as a managed
Library catalog (embed URLs only), and let a teacher display one **ad-hoc** on the live
stage. Mirrors to all viewers via the existing 5s live-state poll (**switch-level**:
everyone gets the same embed when the teacher picks/clears it; in-content slide/timestamp
sync is a later follow-on — "option 2").

## 1. Data model — migration **046** (additive, safe)
- `CREATE TABLE library_media (id TEXT PK, type TEXT NOT NULL CHECK(type IN ('ppt','video')), title TEXT NOT NULL, url TEXT NOT NULL, description TEXT, created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`.
- `ALTER TABLE sesi ADD COLUMN live_media_id TEXT;` (nullable — the media shown ad-hoc on the live stage).
- Down: drop the column-less way isn't trivial in SQLite; down can `DROP TABLE library_media` and recreate `sesi` without the column **or** simply note the column is harmless. Follow the repo's existing down-migration style (most just reverse the up).

## 2. Embed normalization — Go helper (`internal/handler/media.go` or util)
`embedURL(raw string) string`:
- YouTube `watch?v=ID` / `youtu.be/ID` / `shorts/ID` → `https://www.youtube.com/embed/ID`
- Google Slides `/presentation/d/ID/...` → `https://docs.google.com/presentation/d/ID/embed`
- Canva `…/view` (or design link) → append `?embed`
- otherwise return `raw` unchanged.
API returns both `url` (raw) and `embedUrl` (derived).

## 3. Backend — store + handler + routes
- `LibraryMediaStore` (new `internal/store/media.go`): `List(ctx)`, `Get(ctx,id)`, `Create`, `Update`, `Delete`. ULID ids.
- `LibraryMedia` handler (`internal/handler/media.go`): List (returns embedUrl per row), Create, Update, Delete. Validate `type ∈ {ppt,video}`, `title`/`url` required (`url` max 2000).
- Routes (`cmd/server/main.go`): `GET /api/library/media` under the authed group `p` (any signed-in role can view). `POST`/`PATCH`/`DELETE /api/library/media[/{id}]` — **admin+guru**; gate in-handler (check `auth.ClaimsFrom` role ∈ {admin,guru}; 403 otherwise), registered under `p` (like pencapaian writes), since the `adm` group is admin-only.

## 4. Backend — live media state on sesi
- `Sesi` struct + scan + select/insert: add `LiveMediaID *string` (`json:"liveMediaId,omitempty"`). The end-sesi reset (`live_materi_id = NULL …`) also sets `live_media_id = NULL`.
- `SetLive(ctx, id, materiID, displayMode, mediaID *string)` — add `mediaID` to the SET builder (empty string → NULL, like the others).
- handler `sesiLiveBody`: add `LiveMediaID *string`; pass to `SetLive`.

## 5. Frontend — API clients
- `web/app/src/api/media.ts`: `LibraryMedia = { id, type:'ppt'|'video', title, url, embedUrl, description?, createdAt }`; `LibraryMediaInput`; `listMedia()`, `createMedia()`, `updateMedia()`, `deleteMedia()`.
- `web/app/src/api/sesi.ts`: add `liveMediaId?: string | null` to `SesiLiveInput` and the `Sesi` type.

## 6. Frontend — Library catalog
- Pustaka hub (`Pustaka.tsx`): add a BigCard "Media (PPT & Video)" → `/pustaka/media`.
- Route in `App.tsx`: `/pustaka/media` → `PustakaMediaPage`.
- `web/app/src/pages/PustakaMedia.tsx`: grid of media cards (icon by type — `Presentation`/`Video` lucide; title; type badge; "Buka" link to the raw url). For admin+guru: **Tambah** button + per-card Edit/Hapus. Form (modal): type (PPT/Video), title, URL, optional description. Delete uses the shared `ConfirmDialog`. Equal-height cards (reuse the `h-full` pattern).

## 7. Frontend — ad-hoc live display
- `LiveSesi.tsx`: a **"Tampilkan media"** control (in the bottom bar) → opens a picker listing `listMedia()` → selecting calls `setSesiLive({ liveMediaId: id })`; a **"Tutup media"** clears it (`setSesiLive({ liveMediaId: '' })`). Both server-synced (5s poll → mirrors to students).
- `StageContent`: when `sesi.liveMediaId` is set, render a new **`MediaStage`** (full-screen `<iframe>` of the media's `embedUrl`, `allowfullscreen`) **over** the normal materi view, regardless of `displayMode`. `MediaStage` resolves the embedUrl from `listMedia()` (cached) by id. Clearing returns to the materi view.
- i18n id+en: `live.showMedia`, `live.closeMedia`, `live.pickMedia`; `pustaka.media.*` (title, addBtn, typePpt, typeVideo, urlLabel, etc.); `pustaka.hub.mediaTitle/mediaSub`.

## Out of scope (now)
- **Lockstep playback sync** (same slide / video timestamp pushed to viewers) — explicitly a later follow-on ("option 2").
- File upload (embed URLs only). Per-tingkat tagging.

## Testing
- `go vet` + `go test`; migration applies on rebuild (additive — safe on `gnrs_gnrs-data`).
- Browser on `:8300`: add a YouTube + a Google-Slides item in `/pustaka/media`; in a live sesi, "Tampilkan media" → iframe renders on the stage; a second device on the same live URL shows it within ~5s; "Tutup media" → back to materi. API CRUD + role gate (guru can add, murid cannot; murid can view list).

## Commit plan (one PR)
1. migration 046 (table + sesi column)
2. backend store + embed util + handler + routes
3. backend sesi live_media_id (SetLive + struct)
4. frontend api clients (media + sesi liveMediaId)
5. frontend Library page + hub card + route (+ i18n)
6. frontend live-stage MediaStage + picker (+ i18n)
