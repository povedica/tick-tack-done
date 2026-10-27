import { HttpStatus } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  isWorkTask,
  isWorkTime,
  nextWorkStart,
  weekdayCodes,
  weekdayNumbers,
  workHiddenNow,
  type WeekdayCode,
} from '@reflexionia/domain';
import { DomainException } from '../http/domain.exception.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { Tx } from '../prisma/tx.js';

export type WorkContextMode = 'all' | 'work' | 'personal' | 'auto';
export type WorkFilterMode = 'all' | 'work' | 'personal';

type Db = PrismaService | Tx;

export interface WorkRow {
  timeZone: string;
  workDayStart: string | null;
  workDayEnd: string | null;
  workDays: number[];
  workFolderIds: string[];
  workProjectIds: string[];
  workTagIds: string[];
  hideWorkOutsideHours: boolean;
  showWorkUntil: Date | null;
}

export interface WorkPatch {
  work_day_start?: string | null;
  work_day_end?: string | null;
  work_days?: string[];
  work_folder_ids?: string[];
  work_project_ids?: string[];
  work_tag_ids?: string[];
  hide_work_outside_hours?: boolean;
  show_work?: boolean;
}

export const WORK_SELECT = {
  timeZone: true,
  workDayStart: true,
  workDayEnd: true,
  workDays: true,
  workFolderIds: true,
  workProjectIds: true,
  workTagIds: true,
  hideWorkOutsideHours: true,
  showWorkUntil: true,
} as const;

export function parseWorkContext(raw: string | undefined): WorkContextMode {
  if (raw === undefined || raw.length === 0 || raw === 'all') {
    return 'all';
  }
  if (raw === 'work' || raw === 'personal' || raw === 'auto') {
    return raw;
  }
  throw new DomainException(
    HttpStatus.BAD_REQUEST,
    'validation_failed',
    'context must be all, work, personal or auto',
  );
}

export function resolvedWorkMode(mode: WorkContextMode, hidden: boolean): WorkFilterMode {
  if (mode === 'auto') {
    return hidden ? 'personal' : 'all';
  }
  return mode;
}

export function workTaskWhere(row: WorkRow, mode: WorkFilterMode): Prisma.TaskWhereInput | null {
  if (mode === 'all') {
    return null;
  }
  const parts: Prisma.TaskWhereInput[] = [];
  if (row.workProjectIds.length > 0) {
    parts.push({ projectId: { in: row.workProjectIds } });
  }
  if (row.workFolderIds.length > 0) {
    parts.push({ project: { folderId: { in: row.workFolderIds } } });
  }
  if (row.workTagIds.length > 0) {
    parts.push({ tags: { some: { tagId: { in: row.workTagIds } } } });
  }
  const work: Prisma.TaskWhereInput = parts.length === 0 ? { id: { in: [] } } : { OR: parts };
  if (mode === 'work') {
    return work;
  }
  // NOT (folder IN …) drops rows whose folder is null, because NULL IN (…) is unknown.
  const personal: Prisma.TaskWhereInput[] = [];
  if (row.workProjectIds.length > 0) {
    personal.push({ projectId: { notIn: row.workProjectIds } });
  }
  if (row.workFolderIds.length > 0) {
    personal.push({
      OR: [
        { project: { folderId: null } },
        { project: { folderId: { notIn: row.workFolderIds } } },
      ],
    });
  }
  if (row.workTagIds.length > 0) {
    personal.push({ tags: { none: { tagId: { in: row.workTagIds } } } });
  }
  return personal.length === 0 ? {} : { AND: personal };
}

export async function loadWorkRow(db: Db, ownerId: string): Promise<WorkRow> {
  const row = await db.user.findFirst({
    where: { id: ownerId, deletedAt: null },
    select: WORK_SELECT,
  });
  if (row === null) {
    throw new DomainException(HttpStatus.UNAUTHORIZED, 'unauthorized', 'Unknown user');
  }
  return row;
}

export function workSchedule(row: WorkRow): {
  start: string | null;
  end: string | null;
  days: number[];
} {
  return { start: row.workDayStart, end: row.workDayEnd, days: row.workDays };
}

export function workView(row: WorkRow, now: Date) {
  const nowIso = now.toISOString();
  const schedule = workSchedule(row);
  const showWorkUntil = row.showWorkUntil?.toISOString() ?? null;
  return {
    work_day_start: row.workDayStart,
    work_day_end: row.workDayEnd,
    work_days: weekdayCodes(row.workDays),
    work_folder_ids: row.workFolderIds,
    work_project_ids: row.workProjectIds,
    work_tag_ids: row.workTagIds,
    hide_work_outside_hours: row.hideWorkOutsideHours,
    show_work_until: showWorkUntil,
    is_work_time_now: isWorkTime(nowIso, row.timeZone, schedule),
    work_hidden_now: workHiddenNow(
      {
        ...schedule,
        hideWorkOutsideHours: row.hideWorkOutsideHours,
        showWorkUntil,
        timeZone: row.timeZone,
      },
      nowIso,
    ),
    next_work_start: nextWorkStart(nowIso, row.timeZone, schedule),
  };
}

export async function workCounts(db: Db, ownerId: string, row: WorkRow) {
  const listWhere: Prisma.ProjectWhereInput[] = [];
  if (row.workProjectIds.length > 0) {
    listWhere.push({ id: { in: row.workProjectIds } });
  }
  if (row.workFolderIds.length > 0) {
    listWhere.push({ folderId: { in: row.workFolderIds } });
  }
  const [lists, tags, activeTasks] = await Promise.all([
    listWhere.length === 0
      ? Promise.resolve(0)
      : db.project.count({
          where: { ownerId, deletedAt: null, OR: listWhere },
        }),
    row.workTagIds.length === 0
      ? Promise.resolve(0)
      : db.tag.count({
          where: { ownerId, deletedAt: null, id: { in: row.workTagIds } },
        }),
    db.task.count({
      where: {
        ownerId,
        deletedAt: null,
        status: 'active',
        parentId: null,
        ...(workTaskWhere(row, 'work') ?? {}),
      },
    }),
  ]);
  return { lists, tags, active_tasks: activeTasks };
}

export async function workFilterFor(
  db: Db,
  ownerId: string,
  mode: WorkContextMode,
  now = new Date(),
): Promise<Prisma.TaskWhereInput | null> {
  if (mode === 'all') {
    return null;
  }
  const row = await loadWorkRow(db, ownerId);
  const hidden = workHiddenNow(
    {
      ...workSchedule(row),
      hideWorkOutsideHours: row.hideWorkOutsideHours,
      showWorkUntil: row.showWorkUntil?.toISOString() ?? null,
      timeZone: row.timeZone,
    },
    now.toISOString(),
  );
  return workTaskWhere(row, resolvedWorkMode(mode, hidden));
}

export function clockOrNull(value: string | null | undefined): string | null {
  if (value === undefined || value === null || value.trim().length === 0) {
    return null;
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', 'time must be HH:mm');
  }
  return value;
}

/** Columns to merge into a user update. Validates ownership of every id. */
export async function workUpdateData(
  tx: Tx,
  ownerId: string,
  timeZone: string,
  current: WorkRow,
  patch: WorkPatch,
  now: Date,
): Promise<Prisma.UserUpdateInput> {
  const data: Prisma.UserUpdateInput = {};
  let start = current.workDayStart;
  let end = current.workDayEnd;
  if (patch.work_day_start !== undefined) {
    start = clockOrNull(patch.work_day_start);
    data.workDayStart = start;
  }
  if (patch.work_day_end !== undefined) {
    end = clockOrNull(patch.work_day_end);
    data.workDayEnd = end;
  }
  let days = current.workDays;
  if (patch.work_days !== undefined) {
    const parsed = weekdayNumbers(patch.work_days);
    if (parsed === null) {
      throw new DomainException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'validation_failed',
        'work_days must use MO, TU, WE, TH, FR, SA, SU',
      );
    }
    days = parsed;
    data.workDays = parsed;
  }
  if (patch.work_folder_ids !== undefined) {
    data.workFolderIds = await ownedIds(tx, ownerId, 'folder', unique(patch.work_folder_ids));
  }
  if (patch.work_project_ids !== undefined) {
    data.workProjectIds = await ownedIds(tx, ownerId, 'project', unique(patch.work_project_ids));
  }
  if (patch.work_tag_ids !== undefined) {
    data.workTagIds = await ownedIds(tx, ownerId, 'tag', unique(patch.work_tag_ids));
  }
  if (patch.hide_work_outside_hours !== undefined) {
    data.hideWorkOutsideHours = patch.hide_work_outside_hours;
  }
  if (patch.show_work === true) {
    const until = nextWorkStart(now.toISOString(), timeZone, { start, end, days });
    if (until === null) {
      throw new DomainException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'validation_failed',
        'No upcoming work start',
      );
    }
    data.showWorkUntil = new Date(until);
  } else if (patch.show_work === false) {
    data.showWorkUntil = null;
  }
  return data;
}

export function workPatchTouched(patch: WorkPatch): boolean {
  return (
    patch.work_day_start !== undefined ||
    patch.work_day_end !== undefined ||
    patch.work_days !== undefined ||
    patch.work_folder_ids !== undefined ||
    patch.work_project_ids !== undefined ||
    patch.work_tag_ids !== undefined ||
    patch.hide_work_outside_hours !== undefined ||
    patch.show_work !== undefined
  );
}

export async function detachWorkReference(
  tx: Tx,
  ownerId: string,
  field: 'workFolderIds' | 'workProjectIds' | 'workTagIds',
  id: string,
): Promise<void> {
  const row = await tx.user.findUnique({
    where: { id: ownerId },
    select: { workFolderIds: true, workProjectIds: true, workTagIds: true },
  });
  if (!row?.[field].includes(id)) {
    return;
  }
  await tx.user.update({
    where: { id: ownerId },
    data: { [field]: row[field].filter((item) => item !== id) },
  });
}

export async function annotateWork(
  db: Db,
  ownerId: string,
  items: readonly { project_id: string; tag_ids: readonly string[] }[],
): Promise<boolean[]> {
  if (items.length === 0) {
    return [];
  }
  const row = await loadWorkRow(db, ownerId);
  const projectIds = [...new Set(items.map((item) => item.project_id))];
  const projects = await db.project.findMany({
    where: { id: { in: projectIds }, ownerId },
    select: { id: true, folderId: true },
  });
  const folders = new Map(projects.map((project) => [project.id, project.folderId]));
  return items.map((item) =>
    isWorkTask(
      { projectId: item.project_id, tagIds: item.tag_ids },
      {
        workFolderIds: row.workFolderIds,
        workProjectIds: row.workProjectIds,
        workTagIds: row.workTagIds,
        folderOf: (projectId) => folders.get(projectId) ?? null,
      },
    ),
  );
}

async function ownedIds(
  tx: Tx,
  ownerId: string,
  kind: 'folder' | 'project' | 'tag',
  ids: string[],
): Promise<string[]> {
  if (ids.length === 0) {
    return [];
  }
  const found =
    kind === 'folder'
      ? await tx.folder.findMany({
          where: { ownerId, deletedAt: null, id: { in: ids } },
          select: { id: true },
        })
      : kind === 'project'
        ? await tx.project.findMany({
            where: { ownerId, deletedAt: null, id: { in: ids } },
            select: { id: true },
          })
        : await tx.tag.findMany({
            where: { ownerId, deletedAt: null, id: { in: ids } },
            select: { id: true },
          });
  if (found.length !== ids.length) {
    throw new DomainException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'validation_failed',
      'Unknown work folder, list or tag',
    );
  }
  return ids;
}

function unique(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

export type WorkDayCode = WeekdayCode;
