-- Keep the newest active row per (project_id, member_id). Ties keep the greatest id.
-- The same pass then runs for (project_id, token_id). Soft-deletes are not restored by down.sql.
WITH ranked_members AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY project_id, member_id
           ORDER BY updated_at DESC, id DESC
         ) AS rn
  FROM project_members
  WHERE deleted_at IS NULL
    AND member_id IS NOT NULL
)
UPDATE project_members
SET deleted_at = now()
WHERE id IN (SELECT id FROM ranked_members WHERE rn > 1);

WITH ranked_tokens AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY project_id, token_id
           ORDER BY updated_at DESC, id DESC
         ) AS rn
  FROM project_members
  WHERE deleted_at IS NULL
    AND token_id IS NOT NULL
)
UPDATE project_members
SET deleted_at = now()
WHERE id IN (SELECT id FROM ranked_tokens WHERE rn > 1);

CREATE UNIQUE INDEX project_members_active_member_uq ON project_members (project_id, member_id) WHERE deleted_at IS NULL AND member_id IS NOT NULL;
CREATE UNIQUE INDEX project_members_active_token_uq ON project_members (project_id, token_id) WHERE deleted_at IS NULL AND token_id IS NOT NULL;
