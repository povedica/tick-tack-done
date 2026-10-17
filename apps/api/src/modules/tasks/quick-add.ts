import { HttpStatus } from '@nestjs/common';
import { parseQuickAdd, normalizeTaskTitle, tagNameKey, type Priority } from '@reflexionia/domain';
import type { AuthUser } from '../../auth/auth-user';
import { DomainException } from '../../http/domain.exception';
import type { Tx } from '../../prisma/tx';
import type { CreateTaskDto } from './tasks.dto';

export interface CaptureWarning {
  readonly code: 'list_not_found' | 'tag_not_found' | 'reminder_without_date';
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

/** RF-102 and RF-107. Does not create a missing list or tag. */
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
  const title = normalizeTaskTitle(dto.title ?? parsed.title);
  if (!title.ok) {
    throw new DomainException(HttpStatus.BAD_REQUEST, 'empty_title', 'title is required');
  }

  const warnings: CaptureWarning[] = [];
  const projectId =
    dto.project_id ?? (await resolveList(tx, user.id, parsed.listName, warnings));
  const tagIds = dto.tag_ids ?? (await resolveTags(tx, user.id, parsed.tagNames, warnings));
  const dueDate = dto.due_date !== undefined ? dto.due_date : (parsed.due?.date ?? null);
  const isAllDay =
    dto.is_all_day ??
    (dto.due_date !== undefined ? false : (parsed.due?.isAllDay ?? false));
  const repeatRule = dto.repeat_rule !== undefined ? dto.repeat_rule : parsed.repeatRule;
  let reminderTrigger = parsed.reminderTrigger;
  if (reminderTrigger !== null && dueDate === null) {
    warnings.push({ code: 'reminder_without_date' });
    reminderTrigger = null;
  }

  return {
    projectId,
    title: title.title,
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
  ownerId: string,
  listName: string | null,
  warnings: CaptureWarning[],
): Promise<string> {
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
    warnings.push({ code: 'list_not_found', name: listName });
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
  ownerId: string,
  names: readonly string[],
  warnings: CaptureWarning[],
): Promise<string[]> {
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
      warnings.push({ code: 'tag_not_found', name });
      continue;
    }
    if (!ids.includes(id)) {
      ids.push(id);
    }
  }
  return ids;
}
