-- Reverses 20261017105855_init_domain_model.
-- Drops the section 5 tables, enums and the citext extension created by that migration.

DROP TABLE IF EXISTS
    "weekly_reports",
    "dashboard_layouts",
    "templates",
    "countdowns",
    "activity_log",
    "comments",
    "attachments",
    "external_events",
    "calendar_subscriptions",
    "sticky_notes",
    "focus_sessions",
    "habit_logs",
    "habits",
    "reminders",
    "filters",
    "smart_lists",
    "checklist_items",
    "task_tags",
    "tasks",
    "tags",
    "columns",
    "projects",
    "folders",
    "focus_settings",
    "users"
CASCADE;

DROP TYPE IF EXISTS
    "SmartListKey",
    "WeekStart",
    "Theme",
    "ActivityAction",
    "CalendarSyncDirection",
    "FocusSessionType",
    "ReminderChannel",
    "ReminderType",
    "FilterMode",
    "ProjectKind",
    "ProjectViewMode",
    "ChecklistStatus",
    "TaskSource",
    "RepeatFrom",
    "Priority",
    "TaskStatus",
    "TaskKind";

DROP EXTENSION IF EXISTS citext;
