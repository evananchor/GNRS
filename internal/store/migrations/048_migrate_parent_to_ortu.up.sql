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
