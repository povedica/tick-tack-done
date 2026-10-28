DROP INDEX IF EXISTS project_members_active_member_uq;
DROP INDEX IF EXISTS project_members_active_token_uq;

-- Deduplication is not reversed: rows soft-deleted by this migration stay deleted.
