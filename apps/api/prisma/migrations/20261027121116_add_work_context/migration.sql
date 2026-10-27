-- AlterTable
ALTER TABLE "users" ADD COLUMN     "hide_work_outside_hours" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "show_work_until" TIMESTAMPTZ(6),
ADD COLUMN     "work_days" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
ADD COLUMN     "work_folder_ids" UUID[] DEFAULT ARRAY[]::UUID[],
ADD COLUMN     "work_project_ids" UUID[] DEFAULT ARRAY[]::UUID[],
ADD COLUMN     "work_tag_ids" UUID[] DEFAULT ARRAY[]::UUID[];
