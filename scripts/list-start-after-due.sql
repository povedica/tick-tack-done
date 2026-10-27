SELECT t.id, t.title, t.start_date, t.due_date, t.time_zone
FROM tasks t
WHERE t.deleted_at IS NULL AND t.status = 'active'
  AND t.start_date IS NOT NULL AND t.due_date IS NOT NULL
  AND (t.start_date AT TIME ZONE t.time_zone)::date > (t.due_date AT TIME ZONE t.time_zone)::date
ORDER BY t.start_date;
