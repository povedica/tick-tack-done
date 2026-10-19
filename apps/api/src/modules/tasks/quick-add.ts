import { HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  normalizeTagName,
  normalizeTaskTitle,
  parseQuickAdd,
  tagNameKey,
  type Priority,
} from '@reflexionia/domain';
import { actorOf, type AuthUser } from '../../auth/auth-user.js';
import { DomainEvent } from '../../events/domain-events.js';
import { EventRecorder } from '../../events/event-recorder.js';
import { DomainException } from '../../http/domain.exception.js';
import { asJson, iso } from '../../http/json.js';
import type { Tx } from '../../prisma/tx.js';
import type { CreateTaskDto } from './tasks.dto.js';

const SORT_GAP = 65536n;
const events = new EventRecorder();

export interface CaptureWarning {
  readonly code:
    'list_not_found' | 'list_created' | 'tag_not_found' | 'tag_created' | 'reminder_without_date';
  readonly name?: string;
}

/** Fields taken from raw_text after explicit body fields have overridden the parse. */
export interface ResolvedCapture {
  readonly projectId: string;
  readonly title: string;
  readonly priority: Priority;
  readonly isAllDay: boolean;
  readonly dueDate: string | null;
  readonly repeatRule: string | null;
  readonly tagIds: readonly string[];
  readonly reminderTrigger: string | null;
  readonly warnings: readonly CaptureWarning[];
}

/** RF-102 and RF-107. A missing ^list or #tag is created in this transaction. */
export async function resolveQuickAdd(
  tx: Tx,
  user: AuthUser,
  dto: CreateTaskDto,
  now: string,
): Promise<ResolvedCapture> {
  const text = dto.raw_text ?? '';
  const profile = await tx.user.findFirst({
    where: { id: user.id, deletedAt: null },
    select: { nlpLanguage: true },
  });
  const language = profile?.nlpLanguage === 'en' ? 'en' : 'es';
  const timeZone = dto.time_zone ?? user.timeZone;
  const parsed = parseQuickAdd(text, language, { now, timeZone });
  const title = capturedTitle(dto.title, parsed.title);

  const warnings: CaptureWarning[] = [];
  const projectId = dto.project_id ?? (await resolveList(tx, user, parsed.listName, warnings));
  const tagIds = dto.tag_ids ?? (await resolveTags(tx, user, parsed.tagNames, warnings));
  const dueDate = dto.due_date !== undefined ? dto.due_date : (parsed.due?.date ?? null);
  const isAllDay =
    dto.is_all_day ?? (dto.due_date !== undefined ? false : (parsed.due?.isAllDay ?? false));
  const repeatRule = dto.repeat_rule !== undefined ? dto.repeat_rule : parsed.repeatRule;
  let reminderTrigger = parsed.reminderTrigger;
  if (reminderTrigger !== null && dueDate === null) {
    warnings.push({ code: 'reminder_without_date' });
    reminderTrigger = null;
  }

  return {
    projectId,
    title,
    priority: dto.priority ?? parsed.priority ?? 'none',
    isAllDay,
    dueDate,
    repeatRule,
    tagIds,
    reminderTrigger,
    warnings,
  };
}

async function resolveList(
  tx: Tx,
  user: AuthUser,
  listName: string | null,
  warnings: CaptureWarning[],
): Promise<string> {
  const ownerId = user.id;
  if (listName !== null) {
    const rows = await tx.project.findMany({
      where: { ownerId, deletedAt: null, name: { equals: listName, mode: 'insensitive' } },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true },
    });
    const exact = rows.find((row) => row.name === listName);
    const found = exact ?? rows[0];
    if (found !== undefined) {
      return found.id;
    }
    const created = await createCapturedList(tx, user, listName);
    if (created === null) {
      warnings.push({ code: 'list_not_found', name: listName });
    } else {
      warnings.push({ code: 'list_created', name: created.name });
      return created.id;
    }
  }
  const inbox = await tx.project.findFirst({
    where: { ownerId, isInbox: true, deletedAt: null },
    select: { id: true },
  });
  if (inbox === null) {
    throw new DomainException(HttpStatus.CONFLICT, 'inbox_missing', 'Inbox was not found');
  }
  return inbox.id;
}

async function resolveTags(
  tx: Tx,
  user: AuthUser,
  names: readonly string[],
  warnings: CaptureWarning[],
): Promise<string[]> {
  const ownerId = user.id;
  if (names.length === 0) {
    return [];
  }
  const rows = await tx.tag.findMany({
    where: { ownerId, deletedAt: null, name: { in: [...names], mode: 'insensitive' } },
    select: { id: true, name: true },
  });
  const byKey = new Map(rows.map((row) => [tagNameKey(row.name), row.id]));
  const ids: string[] = [];
  for (const name of names) {
    const id = byKey.get(tagNameKey(name));
    if (id === undefined) {
      const created = await createCapturedTag(tx, user, name);
      if (created === null) {
        warnings.push({ code: 'tag_not_found', name });
        continue;
      }
      if (created.fresh) {
        warnings.push({ code: 'tag_created', name: created.name });
      }
      byKey.set(tagNameKey(created.name), created.id);
      ids.push(created.id);
      continue;
    }
    if (!ids.includes(id)) {
      ids.push(id);
    }
  }
  return ids;
}

function capturedTitle(explicit: string | undefined, parsed: string): string {
  if (explicit !== undefined) {
    const title = normalizeTaskTitle(explicit);
    if (!title.ok) {
      throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', 'title is required');
    }
    return title.title;
  }
  const title = normalizeTaskTitle(parsed);
  if (!title.ok || title.title.trim().length === 0) {
    throw new DomainException(HttpStatus.BAD_REQUEST, 'empty_title', 'title is required');
  }
  return title.title;
}

/**
 * Minimal project insert. Keep the row and `project.created` shape aligned with
 * `createProject` in `apps/api/src/modules/lists/lists.service.ts`. Tasks must not import ListsModule.
 */
async function createCapturedList(
  tx: Tx,
  user: AuthUser,
  listName: string,
): Promise<{ id: string; name: string } | null> {
  const name = listName.trim();
  if (name.length === 0 || name.length > 200) {
    return null;
  }
  const sortOrder = await nextSort(tx, 'project', user.id);
  const row = await tx.project.create({
    data: {
      ownerId: user.id,
      name,
      color: null,
      folderId: null,
      viewMode: 'list',
      kind: 'TASK',
      isInbox: false,
      sortOrder,
    },
  });
  const body = {
    id: row.id,
    name: row.name,
    color: row.color,
    folder_id: row.folderId,
    view_mode: row.viewMode,
    kind: row.kind,
    closed: row.closed,
    is_inbox: row.isInbox,
    sort_order: row.sortOrder.toString(),
    active_task_count: 0,
    created_at: iso(row.createdAt) ?? '',
    updated_at: iso(row.updatedAt) ?? '',
  };
  await events.record(tx, actorOf(user), {
    type: DomainEvent.projectCreated,
    entityType: 'project',
    entityId: row.id,
    action: 'created',
    data: { project: asJson(body) },
    previous: null,
  });
  return { id: row.id, name: row.name };
}

/**
 * Minimal tag insert. Keep the row and `tag.created` shape aligned with
 * `insert` in `apps/api/src/modules/tags/tags.service.ts`. Tasks must not import TagsModule.
 */
async function createCapturedTag(
  tx: Tx,
  user: AuthUser,
  rawName: string,
): Promise<{ id: string; name: string; fresh: boolean } | null> {
  const name = normalizeTagName(rawName);
  if (name === null) {
    return null;
  }
  const sortOrder = await nextSort(tx, 'tag', user.id);
  try {
    const row = await tx.tag.create({
      data: {
        ownerId: user.id,
        name,
        color: null,
        parentId: null,
        sortOrder,
      },
    });
    const body = {
      id: row.id,
      name: row.name,
      color: row.color,
      parent_id: row.parentId,
      sort_order: row.sortOrder.toString(),
      active_task_count: 0,
      created_at: iso(row.createdAt) ?? '',
      updated_at: iso(row.updatedAt) ?? '',
    };
    await events.record(tx, actorOf(user), {
      type: DomainEvent.tagCreated,
      entityType: 'tag',
      entityId: row.id,
      action: 'created',
      data: { tag: asJson(body) },
      previous: null,
    });
    return { id: row.id, name: row.name, fresh: true };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
      throw error;
    }
    const existing = await tx.tag.findFirst({
      where: { ownerId: user.id, deletedAt: null, name: { equals: name, mode: 'insensitive' } },
      select: { id: true, name: true },
    });
    return existing === null ? null : { id: existing.id, name: existing.name, fresh: false };
  }
}

async function nextSort(tx: Tx, model: 'project' | 'tag', ownerId: string): Promise<bigint> {
  const max =
    model === 'project'
      ? await tx.project.aggregate({
          where: { ownerId, deletedAt: null },
          _max: { sortOrder: true },
        })
      : await tx.tag.aggregate({
          where: { ownerId, deletedAt: null },
          _max: { sortOrder: true },
        });
  return max._max.sortOrder === null ? SORT_GAP : max._max.sortOrder + SORT_GAP;
}
