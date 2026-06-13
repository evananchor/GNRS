-- 046 — Library media: PPT (slides) + Video embeds shown in the Library and
-- ad-hoc on the Live Stage. URL is an embeddable link (Google Slides/Canva/YouTube);
-- no file storage. sesi.live_media_id is the media currently shown on the stage.
CREATE TABLE library_media (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL CHECK (type IN ('ppt','video')),
  title       TEXT NOT NULL,
  url         TEXT NOT NULL,
  description TEXT,
  created_by  TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
ALTER TABLE sesi ADD COLUMN live_media_id TEXT;
