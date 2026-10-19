import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Prisma, type Tag } from '@prisma/client';
import { createsTagCycle, normalizeTagName } from '@reflexionia/domain';
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
import type { CreateTagDto, MergeTagsDto, TagResponseDto, UpdateTagDto } from './tags.dto.js';

@Injectable()
export class TagsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventRecorder) private readonly events: EventRecorder,
    @Inject(IdempotencyService) private readonly idempotency: IdempotencyService,
  ) {}

  async list(
    user: AuthUser,
    limit: number,
    cursorRaw: string | undefined,
  ): Promise<Page<TagResponseDto>> {
    const cursor =
      cursorRaw === undefined || cursorRaw.length === 0 ? undefined : decodeCursor(cursorRaw);
    const rows = await this.prisma.tag.findMany({
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
    const counts = await this.counts(
      user.id,
      rows.map((row) => row.id),
    );
    return slicePage(
      rows.map((row) => this.toJson(row, counts.get(row.id) ?? 0)),
      limit,
    );
  }

  create(
    user: AuthUser,
    dto: CreateTagDto,
    keyRaw: string | undefined,
  ): Promise<{ statusCode: number; body: TagResponseDto; replayed: boolean }> {
    const key = normalizeIdempotencyKey(keyRaw);
    return this.idempotency.run({
      ownerId: user.id,
      key,
      fingerprint: requestFingerprint('POST', '/api/v1/tags', dto),
      statusCode: 201,
      execute: (tx) => this.insert(tx, user, dto),
    });
  }

  async get(user: AuthUser, id: string): Promise<TagResponseDto> {
    const row = await this.require(this.prisma, user.id, id);
    const counts = await this.counts(user.id, [id]);
    return this.toJson(row, counts.get(id) ?? 0);
  }

  async update(user: AuthUser, id: string, dto: UpdateTagDto): Promise<TagResponseDto> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const current = await this.require(tx, user.id, id);
        if (dto.parent_id !== undefined) {
          await this.assertParent(tx, user.id, id, dto.parent_id);
        }
        if (dto.name !== undefined) {
          await this.assertNameFree(tx, user.id, dto.name, id);
        }
        const reorder = dto.before_id !== undefined || dto.move_to_end === true;
        const rows = await tx.tag.findMany({
          where: { ownerId: user.id, deletedAt: null },
          select: { id: true, sortOrder: true },
        });
        const plan = reorder ? placementPlan(rows, id, dto.before_id, dto.move_to_end) : null;
        if (plan !== null) {
          for (const update of plan.updates) {
            await tx.tag.update({
              where: { id: update.id },
              data: { sortOrder: update.sortOrder },
            });
          }
        }
        const row = await tx.tag.update({
          where: { id },
          data: {
            ...(dto.name !== undefined ? { name: this.cleanName(dto.name) } : {}),
            ...(dto.color !== undefined ? { color: dto.color } : {}),
            ...(dto.parent_id !== undefined ? { parentId: dto.parent_id } : {}),
            ...(plan !== null ? { sortOrder: plan.movingSortOrder } : {}),
          },
        });
        const body = this.toJson(row, (await this.counts(user.id, [id], tx)).get(id) ?? 0);
        await this.events.record(tx, actorOf(user), {
          type: DomainEvent.tagUpdated,
          entityType: 'tag',
          entityId: id,
          action: 'updated',
          data: { tag: asJson(body) },
          previous: asJson(this.toJson(current, body.active_task_count)),
        });
        return body;
      });
    } catch (error) {
      this.rethrowNameConflict(error);
      throw error;
    }
  }

  async remove(user: AuthUser, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const current = await this.require(tx, user.id, id);
      await tx.tag.updateMany({
        where: { ownerId: user.id, parentId: id },
        data: { parentId: current.parentId },
      });
      const row = await tx.tag.update({
        where: { id },
        data: { deletedAt: new Date(), name: id },
      });
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.tagDeleted,
        entityType: 'tag',
        entityId: id,
        action: 'deleted',
        data: { tag: { id, name: current.name, deleted_at: iso(row.deletedAt) } },
        previous: { name: current.name },
      });
    });
  }

  merge(
    user: AuthUser,
    dto: MergeTagsDto,
    keyRaw: string | undefined,
  ): Promise<{ statusCode: number; body: TagResponseDto; replayed: boolean }> {
    const key = normalizeIdempotencyKey(keyRaw);
    return this.idempotency.run({
      ownerId: user.id,
      key,
      fingerprint: requestFingerprint('POST', '/api/v1/tags/merge', dto),
      statusCode: 200,
      execute: async (tx) => {
        if (dto.source_id === dto.target_id) {
          throw new DomainException(
            HttpStatus.BAD_REQUEST,
            'validation_failed',
            'source and target must differ',
          );
        }
        const source = await this.require(tx, user.id, dto.source_id);
        const target = await this.require(tx, user.id, dto.target_id);
        const tags = await tx.tag.findMany({
          where: { ownerId: user.id, deletedAt: null },
          select: { id: true, parentId: true },
        });
        const parents = new Map(tags.map((tag) => [tag.id, tag.parentId]));
        if (createsTagCycle(source.id, target.id, parents)) {
          throw new DomainException(
            HttpStatus.CONFLICT,
            'tag_cycle',
            'Cannot merge a tag into its descendant',
          );
        }
        if (target.parentId === source.id) {
          await tx.tag.update({ where: { id: target.id }, data: { parentId: source.parentId } });
        }
        await tx.tag.updateMany({
          where: { ownerId: user.id, parentId: source.id },
          data: { parentId: target.id },
        });
        const links = await tx.taskTag.findMany({
          where: { tagId: source.id },
          select: { taskId: true },
        });
        for (const link of links) {
          await tx.taskTag.upsert({
            where: { taskId_tagId: { taskId: link.taskId, tagId: target.id } },
            create: { taskId: link.taskId, tagId: target.id },
            update: {},
          });
        }
        await tx.taskTag.deleteMany({ where: { tagId: source.id } });
        await tx.tag.update({
          where: { id: source.id },
          data: { deletedAt: new Date(), name: source.id },
        });
        const merged = await this.require(tx, user.id, target.id);
        const body = this.toJson(
          merged,
          (await this.counts(user.id, [target.id], tx)).get(target.id) ?? 0,
        );
        await this.events.record(tx, actorOf(user), {
          type: DomainEvent.tagMerged,
          entityType: 'tag',
          entityId: target.id,
          action: 'updated',
          data: { tag: asJson(body), source_id: source.id, source_name: source.name },
          previous: { name: target.name },
        });
        return body;
      },
    });
  }

  private async insert(tx: Tx, user: AuthUser, dto: CreateTagDto): Promise<TagResponseDto> {
    const name = this.cleanName(dto.name);
    await this.assertNameFree(tx, user.id, name, null);
    if (dto.parent_id !== undefined && dto.parent_id !== null) {
      await this.require(tx, user.id, dto.parent_id);
    }
    const rows = await tx.tag.findMany({
      where: { ownerId: user.id, deletedAt: null },
      select: { id: true, sortOrder: true },
    });
    const plan = placementPlan(rows, null, dto.before_id, dto.move_to_end);
    for (const update of plan.updates) {
      await tx.tag.update({ where: { id: update.id }, data: { sortOrder: update.sortOrder } });
    }
    try {
      const row = await tx.tag.create({
        data: {
          ownerId: user.id,
          name,
          color: dto.color ?? null,
          parentId: dto.parent_id ?? null,
          sortOrder: plan.movingSortOrder,
        },
      });
      const body = this.toJson(row, 0);
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.tagCreated,
        entityType: 'tag',
        entityId: row.id,
        action: 'created',
        data: { tag: asJson(body) },
        previous: null,
      });
      return body;
    } catch (error) {
      this.rethrowNameConflict(error);
      throw error;
    }
  }

  private async assertParent(
    tx: Tx,
    ownerId: string,
    tagId: string,
    parentId: string | null,
  ): Promise<void> {
    if (parentId === null) {
      return;
    }
    if (parentId === tagId) {
      throw new DomainException(HttpStatus.CONFLICT, 'tag_cycle', 'A tag cannot be its own parent');
    }
    await this.require(tx, ownerId, parentId);
    const tags = await tx.tag.findMany({
      where: { ownerId, deletedAt: null },
      select: { id: true, parentId: true },
    });
    const parents = new Map(tags.map((tag) => [tag.id, tag.parentId]));
    if (createsTagCycle(tagId, parentId, parents)) {
      throw new DomainException(
        HttpStatus.CONFLICT,
        'tag_cycle',
        'That parent would create a cycle',
      );
    }
  }

  private async assertNameFree(
    tx: Tx,
    ownerId: string,
    name: string,
    exceptId: string | null,
  ): Promise<void> {
    const existing = await tx.tag.findFirst({
      where: {
        ownerId,
        name,
        deletedAt: null,
        ...(exceptId === null ? {} : { NOT: { id: exceptId } }),
      },
      select: { id: true },
    });
    if (existing !== null) {
      throw new DomainException(
        HttpStatus.CONFLICT,
        'tag_name_taken',
        'A tag with that name already exists',
      );
    }
  }

  private async require(tx: Tx | PrismaService, ownerId: string, id: string): Promise<Tag> {
    const row = await tx.tag.findFirst({ where: { id, ownerId, deletedAt: null } });
    if (row === null) {
      throw new DomainException(HttpStatus.NOT_FOUND, 'tag_not_found', 'Tag was not found');
    }
    return row;
  }

  private async counts(
    ownerId: string,
    ids: string[],
    tx: Tx | PrismaService = this.prisma,
  ): Promise<Map<string, number>> {
    if (ids.length === 0) {
      return new Map();
    }
    const grouped = await tx.taskTag.groupBy({
      by: ['tagId'],
      where: { tagId: { in: ids }, task: { ownerId, status: 'active', deletedAt: null } },
      _count: { _all: true },
    });
    return new Map(grouped.map((row) => [row.tagId, row._count._all]));
  }

  private cleanName(name: string): string {
    const normalized = normalizeTagName(name);
    if (normalized === null) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'tag name is required',
      );
    }
    return normalized;
  }

  private rethrowNameConflict(error: unknown): void {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new DomainException(
        HttpStatus.CONFLICT,
        'tag_name_taken',
        'A tag with that name already exists',
      );
    }
  }

  private toJson(row: Tag, activeTaskCount: number): TagResponseDto {
    return {
      id: row.id,
      name: row.name,
      color: row.color,
      parent_id: row.parentId,
      sort_order: row.sortOrder.toString(),
      active_task_count: activeTaskCount,
      created_at: iso(row.createdAt) ?? '',
      updated_at: iso(row.updatedAt) ?? '',
    };
  }
}
