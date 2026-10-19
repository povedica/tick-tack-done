import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { parseSearchQuery } from '@reflexionia/domain';
import type { AuthUser } from '../../auth/auth-user.js';
import { DomainException } from '../../http/domain.exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { toViewJson, loadViewTasks, type ViewTaskJson } from '../../reading/view-tasks.js';
import type { SearchGroupDto, SearchHitDto, SearchResponseDto } from './search.dto.js';

const TYPES = ['task', 'note', 'list', 'tag'] as const;
type SearchType = (typeof TYPES)[number];
const LIMIT = 30;

@Injectable()
export class SearchService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async search(
    user: AuthUser,
    q: string | undefined,
    typesRaw: string | undefined,
  ): Promise<SearchResponseDto> {
    const query = (q ?? '').trim();
    if (query.length > 200) {
      throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', 'query is too long');
    }
    const types = this.allowedTypes(user, this.types(typesRaw));
    const parsed = parseSearchQuery(query);
    const groups: SearchGroupDto[] = [];
    if (types.has('task') || types.has('note')) {
      const tasks = await this.tasks(user.id, parsed);
      if (types.has('task')) {
        groups.push({
          type: 'task',
          items: tasks.filter((task) => task.kind === 'task').slice(0, LIMIT),
        });
      }
      if (types.has('note')) {
        groups.push({
          type: 'note',
          items: tasks.filter((task) => task.kind === 'note').slice(0, LIMIT),
        });
      }
    }
    if (types.has('list') && parsed.text.length > 0) {
      groups.push({ type: 'list', items: await this.named(user.id, 'project', parsed.text) });
    }
    if (types.has('tag') && parsed.text.length > 0) {
      groups.push({ type: 'tag', items: await this.named(user.id, 'tag', parsed.text) });
    }
    return {
      text: parsed.text,
      list: parsed.listName,
      tags: [...parsed.tagNames],
      priority: parsed.priority,
      done: parsed.done,
      groups: groups.filter((group) => group.items.length > 0),
    };
  }

  private async tasks(
    ownerId: string,
    parsed: ReturnType<typeof parseSearchQuery>,
  ): Promise<ViewTaskJson[]> {
    const projects = await this.prisma.project.findMany({
      where: { ownerId, deletedAt: null },
      select: { id: true, name: true, isInbox: true },
    });
    const projectIds = this.projectIds(projects, parsed.listName);
    if (projectIds !== null && projectIds.length === 0) {
      return [];
    }
    const tagIds = await this.tagIds(ownerId, parsed.tagNames);
    if (tagIds !== null && tagIds.length === 0) {
      return [];
    }
    const textIds = await this.textIds(ownerId, parsed.text);
    if (textIds !== null && textIds.size === 0) {
      return [];
    }
    const where: Prisma.TaskWhereInput = {
      ownerId,
      deletedAt: null,
      status:
        parsed.done === true ? 'completed' : parsed.done === false ? 'active' : { not: 'archived' },
      ...(projectIds === null ? {} : { projectId: { in: projectIds } }),
      ...(tagIds === null ? {} : { tags: { some: { tagId: { in: tagIds } } } }),
      ...(parsed.priority === null ? {} : { priority: parsed.priority }),
      ...(textIds === null ? {} : { id: { in: [...textIds] } }),
    };
    const rows = await loadViewTasks(this.prisma, where);
    return rows.slice(0, LIMIT * 2).map((row) => toViewJson(row));
  }

  private projectIds(
    projects: readonly { id: string; name: string; isInbox: boolean }[],
    listName: string | null,
  ): string[] | null {
    if (listName === null) {
      return null;
    }
    const needle = listName.toLocaleLowerCase();
    return projects
      .filter(
        (project) =>
          project.name.toLocaleLowerCase() === needle || (needle === 'inbox' && project.isInbox),
      )
      .map((project) => project.id);
  }

  private async tagIds(ownerId: string, names: readonly string[]): Promise<string[] | null> {
    if (names.length === 0) {
      return null;
    }
    const wanted = new Set(names.map((name) => name.toLocaleLowerCase()));
    const tags = await this.prisma.tag.findMany({
      where: { ownerId, deletedAt: null },
      select: { id: true, name: true },
    });
    return tags.filter((tag) => wanted.has(tag.name.toLocaleLowerCase())).map((tag) => tag.id);
  }

  private async textIds(ownerId: string, text: string): Promise<Set<string> | null> {
    if (text.length === 0) {
      return null;
    }
    const contains = await this.prisma.task.findMany({
      where: {
        ownerId,
        deletedAt: null,
        OR: [
          { title: { contains: text, mode: 'insensitive' } },
          { content: { contains: text, mode: 'insensitive' } },
          {
            checklist: {
              some: { deletedAt: null, title: { contains: text, mode: 'insensitive' } },
            },
          },
        ],
      },
      select: { id: true },
    });
    const ids = new Set(contains.map((row) => row.id));
    try {
      const rows = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM tasks
        WHERE owner_id = ${ownerId}::uuid
          AND deleted_at IS NULL
          AND search_vector @@ plainto_tsquery('simple', ${text})
      `;
      for (const row of rows) {
        ids.add(row.id);
      }
    } catch {
      return ids;
    }
    return ids;
  }

  private async named(
    ownerId: string,
    kind: 'project' | 'tag',
    text: string,
  ): Promise<SearchHitDto[]> {
    const where = {
      ownerId,
      deletedAt: null,
      name: { contains: text, mode: 'insensitive' as const },
    };
    const rows =
      kind === 'project'
        ? await this.prisma.project.findMany({
            where,
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
            take: LIMIT,
          })
        : await this.prisma.tag.findMany({
            where,
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
            take: LIMIT,
          });
    return rows.map((row) => ({ id: row.id, name: row.name }));
  }

  private allowedTypes(user: AuthUser, types: Set<SearchType>): Set<SearchType> {
    const scopeByType: Record<SearchType, string> = {
      task: 'tasks:read',
      note: 'notes:read',
      list: 'lists:read',
      tag: 'tags:read',
    };
    const allowed = new Set<SearchType>();
    for (const type of types) {
      if (user.scopes.includes(scopeByType[type])) {
        allowed.add(type);
      }
    }
    return allowed;
  }

  private types(raw: string | undefined): Set<SearchType> {
    if (raw === undefined || raw.trim().length === 0) {
      return new Set(TYPES);
    }
    const parts = raw
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    if (parts.length === 0) {
      throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', 'types are invalid');
    }
    const selected = new Set<SearchType>();
    for (const part of parts) {
      if (!isSearchType(part)) {
        throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', 'types are invalid');
      }
      selected.add(part);
    }
    return selected;
  }
}

function isSearchType(value: string): value is SearchType {
  return TYPES.some((type) => type === value);
}
