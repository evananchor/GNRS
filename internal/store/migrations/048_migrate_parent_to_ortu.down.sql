-- Remove migrated links first (FK constraint).
DELETE FROM murid_ortu
WHERE ortu_id LIKE 'ortu-migr-%';

-- Remove migrated ortu accounts.
DELETE FROM users
WHERE id LIKE 'ortu-migr-%';
