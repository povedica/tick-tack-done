import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Filter, FilterMode } from '@prisma/client';
import {
  parseFilterRules,
  parseTaskView,
  savedFilterClause,
  type FilterClock,
  type FilterClause,
  type FilterRules,
} from '@reflexionia/domain';
import { actorOf, type AuthUser } from '../../auth/auth-user.js';
import { DomainEvent } from '../../events/domain-events.js';
import { EventRecorder } from '../../events/event-recorder.js';
import { decodeCursor, slicePage, type Page } from '../../http/cursor.js';
import { DomainException } from '../../http/domain.exception.js';
import { asJson, iso } from '../../http/json.js';
import { normalizeIdempotencyKey, requestFingerprint } from '../../idempotency/fingerprint.js';
import { IdempotencyService } from '../../idempotency/idempotency.service.js';
import { placementPlan } from '../../ordering/placement.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Tx } from '../../prisma/tx.js';
import type { ViewPageJson } from '../../reading/view-page.js';
import { countViewTasks, pageViewTasks } from '../../reading/view-query.js';
import type {
  CreateFilterDto,
  FilterResponseDto,
  PreviewFilterDto,
  UpdateFilterDto,
} from './filters.dto.js';

@Injectable()
export class FiltersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventRecorder) private readonly events: EventRecorder,
    @Inject(IdempotencyService) private readonly idempotency: IdempotencyService,
  ) {}

  async list(
    user: AuthUser,
    limit: number,
    cursorRaw: string | undefined,
  ): Promise<Page<FilterResponseDto>> {
    const cursor =
      cursorRaw === undefined || cursorRaw.length === 0 ? undefined : decodeCursor(cursorRaw);
    const rows = await this.prisma.filter.findMany({
      where: {
        ownerId: user.id,
        deletedAt: null,
        ...(cursor === undefined
          ? {}
          : {
              OR: [
                { sortOrder: { gt: cursor.sortOrder } },
                { sortOrder: cursor.sortOrder, id: { gt: cursor.id } },
              ],
            }),
      },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      take: limit + 1,
    });
    const clock = this.clock(user);
    const counts = await Promise.all(
      rows.map((row) => countViewTasks(this.prisma, user.id, this.clause(row, clock), clock)),
    );
    return slicePage(
      rows.map((row, index) => this.toJson(row, counts[index] ?? 0)),
      limit,
    );
  }

  create(
    user: AuthUser,
    dto: CreateFilterDto,
    keyRaw: string | undefined,
  ): Promise<{ statusCode: number; body: FilterResponseDto; replayed: boolean }> {
    const rules = this.parse(dto.mode, dto.rules);
    const key = normalizeIdempotencyKey(keyRaw);
    return this.idempotency.run({
      ownerId: user.id,
      key,
      fingerprint: requestFingerprint('POST', '/api/v1/filters', dto),
      statusCode: 201,
      execute: (tx) => this.insert(tx, user, dto, rules),
    });
  }

  async preview(
    user: AuthUser,
    dto: PreviewFilterDto,
    groupBy: string | undefined,
    sort: string | undefined,
    limit: number,
    cursorRaw: string | undefined,
  ): Promise<ViewPageJson> {
    const rules = this.parse(dto.mode, dto.rules);
    const clock = this.clock(user);
    return this.page(user, savedFilterClause(rules, clock), clock, groupBy, sort, limit, cursorRaw);
  }

  async get(user: AuthUser, id: string): Promise<FilterResponseDto> {
    const row = await this.require(this.prisma, user.id, id);
    const clock = this.clock(user);
    return this.toJson(
      row,
      await countViewTasks(this.prisma, user.id, this.clause(row, clock), clock),
    );
  }

  async tasks(
    user: AuthUser,
    id: string,
    groupBy: string | undefined,
    sort: string | undefined,
    limit: number,
    cursorRaw: string | undefined,
  ): Promise<ViewPageJson> {
    const row = await this.require(this.prisma, user.id, id);
    const clock = this.clock(user);
    return this.page(user, this.clause(row, clock), clock, groupBy, sort, limit, cursorRaw);
  }

  async update(user: AuthUser, id: string, dto: UpdateFilterDto): Promise<FilterResponseDto> {
    if (dto.pin === true && (dto.before_id !== undefined || dto.move_to_end === true)) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'pin cannot be combined with another placement',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const current = await this.require(tx, user.id, id);
      const mode = dto.mode ?? current.mode;
      const rules = dto.rules === undefined ? this.readRules(current) : this.parse(mode, dto.rules);
      if (dto.rules === undefined && dto.mode !== undefined && dto.mode !== current.mode) {
        this.parse(dto.mode, rules);
      }
      const rows = await tx.filter.findMany({
        where: { ownerId: user.id, deletedAt: null },
        select: { id: true, sortOrder: true },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      });
      const beforeId = dto.pin === true ? this.firstOther(rows, id) : (dto.before_id ?? undefined);
      const reorder = dto.pin === true || dto.before_id != null || dto.move_to_end === true;
      const plan = reorder ? placementPlan(rows, id, beforeId, dto.move_to_end) : null;
      if (plan !== null) {
        for (const update of plan.updates) {
          await tx.filter.update({
            where: { id: update.id },
            data: { sortOrder: update.sortOrder },
          });
        }
      }
      const row = await tx.filter.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: this.cleanName(dto.name) } : {}),
          ...(dto.icon !== undefined ? { icon: blankToNull(dto.icon) } : {}),
          ...(dto.color !== undefined ? { color: dto.color } : {}),
          ...(dto.mode !== undefined || dto.rules !== undefined
            ? { mode, rules: asJson(rules) }
            : {}),
          ...(plan !== null ? { sortOrder: plan.movingSortOrder } : {}),
        },
      });
      const clock = this.clock(user);
      const body = this.toJson(
        row,
        await countViewTasks(tx, user.id, this.clause(row, clock), clock),
      );
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.filterUpdated,
        entityType: 'filter',
        entityId: id,
        action: 'updated',
        data: { filter: asJson(body) },
        previous: asJson(this.toJson(current, 0)),
      });
      return body;
    });
  }

  async remove(user: AuthUser, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const current = await this.require(tx, user.id, id);
      const row = await tx.filter.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.filterDeleted,
        entityType: 'filter',
        entityId: id,
        action: 'deleted',
        data: { filter: { id, name: current.name, deleted_at: iso(row.deletedAt) } },
        previous: { name: current.name },
      });
    });
  }

  private async insert(
    tx: Tx,
    user: AuthUser,
    dto: CreateFilterDto,
    rules: FilterRules,
  ): Promise<FilterResponseDto> {
    const rows = await tx.filter.findMany({
      where: { ownerId: user.id, deletedAt: null },
      select: { id: true, sortOrder: true },
    });
    const plan = placementPlan(rows, null, dto.before_id ?? undefined, undefined);
    for (const update of plan.updates) {
      await tx.filter.update({ where: { id: update.id }, data: { sortOrder: update.sortOrder } });
    }
    const row = await tx.filter.create({
      data: {
        ownerId: user.id,
        name: this.cleanName(dto.name),
        icon: blankToNull(dto.icon),
        color: dto.color ?? null,
        mode: dto.mode,
        rules: asJson(rules),
        sortOrder: plan.movingSortOrder,
      },
    });
    const clock = this.clock(user);
    const body = this.toJson(
      row,
      await countViewTasks(tx, user.id, savedFilterClause(rules, clock), clock),
    );
    await this.events.record(tx, actorOf(user), {
      type: DomainEvent.filterCreated,
      entityType: 'filter',
      entityId: row.id,
      action: 'created',
      data: { filter: asJson(body) },
      previous: null,
    });
    return body;
  }

  private async page(
    user: AuthUser,
    clause: FilterClause,
    clock: FilterClock,
    groupBy: string | undefined,
    sort: string | undefined,
    limit: number,
    cursorRaw: string | undefined,
  ): Promise<ViewPageJson> {
    const view = this.view(groupBy, sort);
    return pageViewTasks(this.prisma, {
      ownerId: user.id,
      clause,
      clock,
      groupBy: view.groupBy,
      sort: view.sort,
      limit,
      cursor: this.cursor(cursorRaw),
    });
  }

  private clause(row: Filter, clock: FilterClock): FilterClause {
    return savedFilterClause(this.readRules(row), clock);
  }

  private parse(mode: FilterMode, rules: unknown): FilterRules {
    const parsed = parseFilterRules(rules, mode);
    if (!parsed.ok) {
      throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', parsed.reason);
    }
    return parsed.rules;
  }

  private readRules(row: Filter): FilterRules {
    const parsed = parseFilterRules(row.rules, row.mode);
    if (!parsed.ok) {
      throw new DomainException(HttpStatus.INTERNAL_SERVER_ERROR, 'invalid_rules', parsed.reason);
    }
    return parsed.rules;
  }

  private view(
    groupBy: string | undefined,
    sort: string | undefined,
  ): {
    groupBy: 'none' | 'section' | 'date' | 'tag' | 'priority';
    sort: 'manual' | 'date' | 'priority' | 'title' | 'created';
  } {
    const parsed = parseTaskView(groupBy, sort);
    if (!parsed.ok) {
      throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', parsed.reason);
    }
    return parsed;
  }

  private cursor(raw: string | undefined): { index: number; id: string } | null {
    if (raw === undefined || raw.length === 0) {
      return null;
    }
    const cursor = decodeCursor(raw);
    return { index: Number(cursor.sortOrder), id: cursor.id };
  }

  private async require(db: PrismaService | Tx, ownerId: string, id: string): Promise<Filter> {
    const row = await db.filter.findFirst({ where: { id, ownerId, deletedAt: null } });
    if (row === null) {
      throw new DomainException(HttpStatus.NOT_FOUND, 'filter_not_found', 'Filter was not found');
    }
    return row;
  }

  private firstOther(
    rows: readonly { id: string; sortOrder: bigint }[],
    id: string,
  ): string | undefined {
    const ordered = [...rows].sort((left, right) =>
      left.sortOrder < right.sortOrder ? -1 : left.sortOrder > right.sortOrder ? 1 : 0,
    );
    const first = ordered.find((row) => row.id !== id);
    return first?.id;
  }

  private cleanName(name: string): string {
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed.length > 80) {
      throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', 'invalid name');
    }
    return trimmed;
  }

  private clock(user: AuthUser): FilterClock {
    return { now: new Date().toISOString(), timeZone: user.timeZone };
  }

  private toJson(row: Filter, taskCount: number): FilterResponseDto {
    return {
      id: row.id,
      name: row.name,
      icon: row.icon,
      color: row.color,
      mode: row.mode,
      rules: this.readRules(row) as FilterResponseDto['rules'],
      sort_order: row.sortOrder.toString(),
      task_count: taskCount,
      created_at: iso(row.createdAt) ?? '',
      updated_at: iso(row.updatedAt) ?? '',
    };
  }
}

function blankToNull(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}
