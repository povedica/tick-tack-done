-- Solo con la versión anterior de la aplicación detenida y copia de seguridad.
-- Rechaza deshacer si implicaría perder sesiones de cronómetro o preferencias.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM focus_sessions WHERE type::text = 'stopwatch') THEN
    RAISE EXCEPTION 'Exportar y resolver las sesiones stopwatch antes del rollback';
  END IF;
  IF EXISTS (SELECT 1 FROM focus_sessions WHERE paused_at IS NOT NULL OR paused_seconds <> 0) THEN
    RAISE EXCEPTION 'Resolver las pausas antes del rollback';
  END IF;
  IF EXISTS (SELECT 1 FROM view_preferences) THEN
    RAISE EXCEPTION 'Exportar las preferencias antes del rollback';
  END IF;
END $$;
DROP TABLE view_preferences;
ALTER TABLE focus_sessions DROP COLUMN paused_at, DROP COLUMN paused_seconds;
ALTER TYPE "FocusSessionType" RENAME TO "FocusSessionType_old";
CREATE TYPE "FocusSessionType" AS ENUM ('focus', 'short_break', 'long_break');
ALTER TABLE focus_sessions ALTER COLUMN type TYPE "FocusSessionType" USING type::text::"FocusSessionType";
DROP TYPE "FocusSessionType_old";
COMMIT;
