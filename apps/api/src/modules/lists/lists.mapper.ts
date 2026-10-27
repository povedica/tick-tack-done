import type { Column, Folder, Project } from '@prisma/client';
import { iso } from '../../http/json.js';
import type { ColumnResponseDto, FolderResponseDto, ProjectResponseDto } from './lists.dto.js';

export type ProjectStatusName = 'active' | 'paused';
export type ProjectStateName = 'active' | 'paused' | 'archived';

export interface FolderTotals {
  readonly project_count: number;
  readonly active_task_count: number;
}

export const EMPTY_FOLDER_TOTALS: FolderTotals = { project_count: 0, active_task_count: 0 };

/**
 * Visible project state. Archived is the list's `closed` flag: there is no
 * separate "done" status. Pausing keeps `projectStatus` so a later unarchive
 * can return to En marcha, or an explicit state can restore Paused.
 */
export function projectState(row: {
  readonly closed: boolean;
  readonly projectStatus: ProjectStatusName;
}): ProjectStateName {
  if (row.closed) {
    return 'archived';
  }
  return row.projectStatus;
}

/** Trim the outcome. An empty string is stored as null and does not clear other fields. */
export function normalizeOutcome(value: string | null | undefined): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * `projectStatusChangedAt` moves only when the stored status changes.
 * Sending the current value again leaves the timestamp alone.
 */
export function projectStatusAssignment(
  current: ProjectStatusName,
  incoming: ProjectStatusName | undefined,
  now: Date,
): { projectStatus?: ProjectStatusName; projectStatusChangedAt?: Date } {
  if (incoming === undefined || incoming === current) {
    return {};
  }
  return { projectStatus: incoming, projectStatusChangedAt: now };
}

/** Archiving stamps `closedAt`. Unarchiving clears it. */
export function closureAssignment(
  closed: boolean,
  now: Date,
): { closed: boolean; closedAt: Date | null } {
  return { closed, closedAt: closed ? now : null };
}

export function toFolderJson(
  row: Folder,
  totals: FolderTotals = EMPTY_FOLDER_TOTALS,
): FolderResponseDto {
  return {
    id: row.id,
    name: row.name,
    sort_order: row.sortOrder.toString(),
    project_count: totals.project_count,
    active_task_count: totals.active_task_count,
    created_at: iso(row.createdAt) ?? '',
    updated_at: iso(row.updatedAt) ?? '',
  };
}

export function toProjectJson(row: Project, activeTaskCount: number): ProjectResponseDto {
  return {
    id: row.id,
    owner_id: row.ownerId,
    name: row.name,
    color: row.color,
    folder_id: row.folderId,
    view_mode: row.viewMode,
    kind: row.kind,
    closed: row.closed,
    closed_at: iso(row.closedAt),
    is_inbox: row.isInbox,
    is_project: row.isProject,
    project_status: row.projectStatus,
    state: projectState(row),
    outcome: row.outcome,
    project_status_changed_at: iso(row.projectStatusChangedAt),
    project_reviewed_at: iso(row.projectReviewedAt),
    default_reminder_trigger: row.defaultReminderTrigger,
    sort_order: row.sortOrder.toString(),
    active_task_count: activeTaskCount,
    created_at: iso(row.createdAt) ?? '',
    updated_at: iso(row.updatedAt) ?? '',
  };
}

export function toColumnJson(row: Column): ColumnResponseDto {
  return {
    id: row.id,
    project_id: row.projectId,
    name: row.name,
    collapsed: row.collapsed,
    wip_limit: row.wipLimit,
    sort_order: row.sortOrder.toString(),
    created_at: iso(row.createdAt) ?? '',
    updated_at: iso(row.updatedAt) ?? '',
  };
}
