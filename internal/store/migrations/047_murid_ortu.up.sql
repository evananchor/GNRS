CREATE TABLE murid_ortu (
  murid_id   TEXT NOT NULL REFERENCES users(id),
  ortu_id    TEXT NOT NULL REFERENCES users(id),
  relation   TEXT NOT NULL CHECK(relation IN ('ayah','ibu')),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (murid_id, relation)
);
CREATE INDEX idx_murid_ortu_ortu ON murid_ortu(ortu_id);
