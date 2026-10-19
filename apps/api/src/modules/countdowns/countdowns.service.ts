import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { type Countdown, type CountdownReminder } from '@prisma/client';
import { calendarDate, countdownDaysLabel, COUNTDOWN_COLORS } from '@reflexionia/domain';
import { actorOf, type AuthUser } from '../../auth/auth-user.js';
import { DomainEvent } from '../../events/domain-events.js';
import { EventRecorder } from '../../events/event-recorder.js';
import { DomainException } from '../../http/domain.exception.js';
import { asJson, iso } from '../../http/json.js';
import { normalizeIdempotencyKey, requestFingerprint } from '../../idempotency/fingerprint.js';
import { IdempotencyService } from '../../idempotency/idempotency.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Tx } from '../../prisma/tx.js';
import type {
  CountdownPageDto,
  CountdownResponseDto,
  CreateCountdownDto,
  UpdateCountdownDto,
} from './countdowns.dto.js';

type Row = Countdown & { reminders: CountdownReminder[] };

@Injectable()
export class CountdownsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventRecorder) private readonly events: EventRecorder,
    @Inject(IdempotencyService) private readonly idempotency: IdempotencyService,
  ) {}

  async list(user: AuthUser, archived: boolean, dueWithinDays?: number): Promise<CountdownPageDto> {
    const today = this.today(user);
    const rows = await this.prisma.countdown.findMany({
      where: { ownerId: user.id, deletedAt: null, archivedAt: archived ? { not: null } : null },
      include: { reminders: true },
    });
    const items = rows
      .map((row) => this.toJson(row, today, user.timeZone))
      .filter(
        (row) => dueWithinDays === undefined || (row.kind !== 'since' && row.days <= dueWithinDays),
      )
      .sort(compareCountdowns);
    return { items, next_cursor: null };
  }

  async get(user: AuthUser, id: string): Promise<CountdownResponseDto> {
    return this.toJson(
      await this.require(this.prisma, user.id, id),
      this.today(user),
      user.timeZone,
    );
  }

  create(user: AuthUser, dto: CreateCountdownDto, keyRaw: string | undefined) {
    return this.idempotency.run({
      ownerId: user.id,
      key: normalizeIdempotencyKey(keyRaw),
      fingerprint: requestFingerprint('POST', '/api/v1/countdowns', dto),
      statusCode: 201,
      execute: (tx) => this.insert(tx, user, dto),
    });
  }

  async update(user: AuthUser, id: string, dto: UpdateCountdownDto): Promise<CountdownResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const current = await this.require(tx, user.id, id);
      this.validate(dto);
      if (
        dto.target_date !== undefined ||
        dto.repeat_rule !== undefined ||
        dto.reminders !== undefined
      ) {
        await tx.reminderDelivery.deleteMany({ where: { countdownId: id, status: 'scheduled' } });
      }
      if (dto.reminders !== undefined)
        await tx.countdownReminder.deleteMany({ where: { countdownId: id } });
      const row = await tx.countdown.update({
        where: { id },
        data: {
          ...(dto.title === undefined ? {} : { title: this.title(dto.title) }),
          ...(dto.target_date === undefined ? {} : { targetDate: dateValue(dto.target_date) }),
          ...(dto.type === undefined ? {} : { type: dto.type }),
          ...(dto.emoji === undefined ? {} : { emoji: blankToNull(dto.emoji) }),
          ...(dto.color === undefined ? {} : { color: dto.color }),
          ...(dto.repeat_rule === undefined ? {} : { repeatRule: dto.repeat_rule }),
          ...(dto.day_mode === undefined ? {} : { dayMode: dto.day_mode }),
          ...(dto.notes === undefined ? {} : { notes: blankToNull(dto.notes) }),
          ...(dto.style === undefined ? {} : { style: blankToNull(dto.style) }),
          ...(dto.show_in_sidebar === undefined ? {} : { showInSidebar: dto.show_in_sidebar }),
          ...(dto.show_in_smart_list === undefined
            ? {}
            : { showInSmartList: dto.show_in_smart_list }),
          ...(dto.pinned === undefined ? {} : { pinned: dto.pinned }),
          ...(dto.sort_order === undefined ? {} : { sortOrder: dto.sort_order }),
          ...(dto.reminders === undefined
            ? {}
            : { reminders: { create: dto.reminders.map(reminderData) } }),
        },
        include: { reminders: true },
      });
      const body = this.toJson(row, this.today(user), user.timeZone);
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.countdownUpdated,
        entityType: 'countdown',
        entityId: id,
        action: 'updated',
        data: asJson({ countdown: body }),
        previous: asJson({ title: current.title }),
      });
      return body;
    });
  }

  async archive(user: AuthUser, id: string, archived: boolean): Promise<CountdownResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      await this.require(tx, user.id, id);
      if (archived) {
        await tx.reminderDelivery.deleteMany({ where: { countdownId: id, status: 'scheduled' } });
      }
      const row = await tx.countdown.update({
        where: { id },
        data: { archivedAt: archived ? new Date() : null },
        include: { reminders: true },
      });
      const body = this.toJson(row, this.today(user), user.timeZone);
      await this.events.record(tx, actorOf(user), {
        type: archived ? DomainEvent.countdownArchived : DomainEvent.countdownUnarchived,
        entityType: 'countdown',
        entityId: id,
        action: 'updated',
        data: asJson({ countdown: body }),
        previous: null,
      });
      return body;
    });
  }

  async remove(user: AuthUser, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const row = await this.require(tx, user.id, id);
      await tx.countdown.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.countdownDeleted,
        entityType: 'countdown',
        entityId: id,
        action: 'deleted',
        data: { countdown: { id, title: row.title } },
        previous: null,
      });
    });
  }

  async restore(user: AuthUser, id: string): Promise<CountdownResponseDto> {
    const row = await this.prisma.countdown.findFirst({
      where: { id, ownerId: user.id, deletedAt: { not: null } },
      include: { reminders: true },
    });
    if (row === null)
      throw new DomainException(
        HttpStatus.NOT_FOUND,
        'countdown_not_found',
        'Countdown was not found',
      );
    const restored = await this.prisma.countdown.update({
      where: { id },
      data: { deletedAt: null },
      include: { reminders: true },
    });
    return this.toJson(restored, this.today(user), user.timeZone);
  }

  private async insert(
    tx: Tx,
    user: AuthUser,
    dto: CreateCountdownDto,
  ): Promise<CountdownResponseDto> {
    this.validate(dto);
    const type = dto.type ?? 'countdown';
    const row = await tx.countdown.create({
      data: {
        ownerId: user.id,
        title: this.title(dto.title),
        targetDate: dateValue(dto.target_date),
        type,
        emoji: blankToNull(dto.emoji),
        color: dto.color ?? null,
        repeatRule:
          dto.repeat_rule ?? (type === 'anniversary' || type === 'birthday' ? 'yearly' : 'none'),
        dayMode: dto.day_mode ?? 'standard',
        notes: blankToNull(dto.notes),
        showInSidebar: dto.show_in_sidebar ?? true,
        showInSmartList: dto.show_in_smart_list ?? true,
        reminders: { create: (dto.reminders ?? []).map(reminderData) },
      },
      include: { reminders: true },
    });
    const body = this.toJson(row, this.today(user), user.timeZone);
    await this.events.record(tx, actorOf(user), {
      type: DomainEvent.countdownCreated,
      entityType: 'countdown',
      entityId: row.id,
      action: 'created',
      data: asJson({ countdown: body }),
      previous: null,
    });
    return body;
  }

  private async require(tx: Tx | PrismaService, ownerId: string, id: string): Promise<Row> {
    const row = await tx.countdown.findFirst({
      where: { id, ownerId, deletedAt: null },
      include: { reminders: true },
    });
    if (row === null)
      throw new DomainException(
        HttpStatus.NOT_FOUND,
        'countdown_not_found',
        'Countdown was not found',
      );
    return row;
  }

  private toJson(row: Row, today: string, timeZone: string): CountdownResponseDto {
    const calculation = countdownDaysLabel(
      { targetDate: dateKey(row.targetDate), repeatRule: row.repeatRule, dayMode: row.dayMode },
      today,
      timeZone,
    );
    return {
      id: row.id,
      title: row.title,
      type: row.type,
      emoji: row.emoji,
      target_date: dateKey(row.targetDate),
      repeat_rule: row.repeatRule,
      day_mode: row.dayMode,
      color: row.color,
      notes: row.notes,
      show_in_sidebar: row.showInSidebar,
      show_in_smart_list: row.showInSmartList,
      pinned: row.pinned,
      sort_order: String(row.sortOrder),
      archived_at: iso(row.archivedAt),
      reminders: row.reminders.map((r) => ({ offset_days: r.offsetDays, constant: r.constant })),
      kind: calculation.kind,
      days: calculation.days,
      effective_date: calculation.effectiveDate,
    };
  }
  private today(user: AuthUser): string {
    return calendarDate(new Date().toISOString(), user.timeZone) ?? dateKey(new Date());
  }
  private title(value: string): string {
    const clean = value.trim();
    if (clean.length < 1 || clean.length > 200)
      throw new DomainException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'validation_failed',
        'invalid_title',
      );
    return clean;
  }
  private validate(
    dto: Partial<Pick<CreateCountdownDto, 'target_date' | 'color' | 'reminders'>>,
  ): void {
    if (
      dto.target_date !== undefined &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(dto.target_date) ||
        Number.isNaN(Date.parse(`${dto.target_date}T00:00:00Z`)))
    )
      throw new DomainException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'validation_failed',
        'invalid_target_date',
      );
    if (dto.color !== undefined && dto.color !== null && !COUNTDOWN_COLORS.includes(dto.color))
      throw new DomainException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'validation_failed',
        'invalid_color',
      );
    const offsets = (dto.reminders ?? []).map(
      (item) => `${String(item.offset_days)}:${String(item.constant === true)}`,
    );
    if (new Set(offsets).size !== offsets.length)
      throw new DomainException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'validation_failed',
        'duplicate_reminder_offset',
      );
    if ((dto.reminders ?? []).filter((item) => item.constant === true).length > 1)
      throw new DomainException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'validation_failed',
        'multiple_constant_reminders',
      );
  }
}

function reminderData(reminder: { offset_days: number; constant?: boolean }) {
  return { offsetDays: reminder.offset_days, constant: reminder.constant ?? false };
}
function dateValue(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}
function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}
function blankToNull(value: string | null | undefined): string | null {
  const clean = value?.trim();
  return clean === undefined || clean.length === 0 ? null : clean;
}
function compareCountdowns(a: CountdownResponseDto, b: CountdownResponseDto): number {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  if (a.pinned) return Number(a.sort_order) - Number(b.sort_order);
  if (a.kind === 'since' && b.kind !== 'since') return 1;
  if (b.kind === 'since' && a.kind !== 'since') return -1;
  return (
    a.effective_date.localeCompare(b.effective_date) || Number(a.sort_order) - Number(b.sort_order)
  );
}
