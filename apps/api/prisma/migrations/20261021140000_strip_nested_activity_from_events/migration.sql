-- TTD-AUD-65: compact inflated activity_log / outbox_events payloads that nested
-- task.activity inside themselves. Idempotent: safe to run twice.

CREATE OR REPLACE FUNCTION ttd_strip_activity_json(value jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  result jsonb;
  key text;
  child jsonb;
BEGIN
  IF value IS NULL THEN
    RETURN NULL;
  END IF;
  IF jsonb_typeof(value) = 'array' THEN
    result := '[]'::jsonb;
    FOR child IN SELECT elem FROM jsonb_array_elements(value) AS elem
    LOOP
      result := result || jsonb_build_array(ttd_strip_activity_json(child));
    END LOOP;
    RETURN result;
  END IF;
  IF jsonb_typeof(value) <> 'object' THEN
    RETURN value;
  END IF;
  result := '{}'::jsonb;
  FOR key, child IN SELECT * FROM jsonb_each(value)
  LOOP
    IF key = 'activity' THEN
      CONTINUE;
    END IF;
    result := result || jsonb_build_object(key, ttd_strip_activity_json(child));
  END LOOP;
  RETURN result;
END;
$$;

UPDATE activity_log
SET changes = ttd_strip_activity_json(changes)
WHERE deleted_at IS NULL
  AND entity_type IN ('task', 'note')
  AND changes::text LIKE '%"activity"%';

UPDATE outbox_events
SET
  data = ttd_strip_activity_json(data),
  previous = CASE
    WHEN previous IS NULL THEN NULL
    ELSE ttd_strip_activity_json(previous)
  END
WHERE type LIKE 'task.%' OR type LIKE 'note.%';

-- Keep the helper for a possible second deploy; drop on next cleanup migration if desired.
