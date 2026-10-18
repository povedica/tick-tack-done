import type { Column, Folder, Project } from '@prisma/client';
import { iso } from '../../http/json';
import type { ColumnResponseDto, FolderResponseDto, ProjectResponseDto } from './lists.dto';

export function toFolderJson(row: Folder): FolderResponseDto {
  return {
    id: row.id,
    name: row.name,
    sort_order: row.sortOrder.toString(),
    created_at: iso(row.createdAt) ?? '',
    updated_at: iso(row.updatedAt) ?? '',
  };
}

export function toProjectJson(row: Project, activeTaskCount: number): ProjectResponseDto {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    folder_id: row.folderId,
    view_mode: row.viewMode,
    kind: row.kind,
    closed: row.closed,
    is_inbox: row.isInbox,
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
