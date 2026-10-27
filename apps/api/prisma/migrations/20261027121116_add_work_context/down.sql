-- Reverting removes work-context membership. Tasks, folders, lists and tags stay.
ALTER TABLE "users" DROP COLUMN "hide_work_outside_hours",
DROP COLUMN "show_work_until",
DROP COLUMN "work_days",
DROP COLUMN "work_folder_ids",
DROP COLUMN "work_project_ids",
DROP COLUMN "work_tag_ids";
