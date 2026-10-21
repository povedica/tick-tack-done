import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { isIanaTimeZone } from '@reflexionia/domain';
import { hashInboundToken, inboundAddress, newInboundToken } from '../inbound/email-address.js';
import { DomainException } from '../http/domain.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthUser } from './auth-user.js';
import { featureFlags } from './feature-flags.js';
import type {
  InboundEmailAddressDto,
  InboundEmailStatusDto,
  MeResponseDto,
  NotificationHealthDto,
  PushSubscriptionDto,
  UpdateMeDto,
} from './me.dto.js';

@Injectable()
export class MeService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async get(user: AuthUser): Promise<MeResponseDto> {
    const row = await this.require(user.id);
    return this.toJson(row);
  }

  async update(user: AuthUser, dto: UpdateMeDto): Promise<MeResponseDto> {
    if (dto.time_zone !== undefined && !isIanaTimeZone(dto.time_zone)) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'time_zone is not a valid IANA name',
      );
    }
    const row = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        ...(dto.display_name !== undefined ? { displayName: dto.display_name.trim() } : {}),
        ...(dto.time_zone !== undefined ? { timeZone: dto.time_zone } : {}),
        ...(dto.task_complete_children !== undefined
          ? { taskCompleteChildren: dto.task_complete_children }
          : {}),
        ...(dto.daily_reminder_time !== undefined
          ? { dailyReminderTime: this.dailyTime(dto.daily_reminder_time) }
          : {}),
        ...(dto.locale !== undefined ? { locale: dto.locale } : {}),
        ...(dto.week_start !== undefined ? { weekStart: dto.week_start } : {}),
        ...(dto.theme !== undefined ? { theme: dto.theme } : {}),
        ...(dto.nlp_language !== undefined ? { nlpLanguage: dto.nlp_language } : {}),
        ...(dto.density !== undefined ? { density: dto.density } : {}),
        ...(dto.accent !== undefined ? { accent: dto.accent } : {}),
        ...(dto.default_reminder_trigger !== undefined
          ? { defaultReminderTrigger: dto.default_reminder_trigger }
          : {}),
        ...(dto.quiet_hours_start !== undefined
          ? { quietHoursStart: this.clock(dto.quiet_hours_start) }
          : {}),
        ...(dto.quiet_hours_end !== undefined
          ? { quietHoursEnd: this.clock(dto.quiet_hours_end) }
          : {}),
        ...(dto.telegram_enabled !== undefined ? { telegramEnabled: dto.telegram_enabled } : {}),
        ...(dto.focus_notifications !== undefined
          ? { focusNotifications: dto.focus_notifications }
          : {}),
        ...(dto.shutdown_reminder_time !== undefined
          ? { shutdownReminderTime: this.clock(dto.shutdown_reminder_time) }
          : {}),
        ...(dto.work_day_start !== undefined
          ? { workDayStart: this.clock(dto.work_day_start) }
          : {}),
        ...(dto.work_day_end !== undefined ? { workDayEnd: this.clock(dto.work_day_end) } : {}),
        ...(dto.default_task_duration_minutes !== undefined
          ? { defaultTaskDuration: dto.default_task_duration_minutes }
          : {}),
        ...(dto.deadline_soon_days !== undefined
          ? { deadlineSoonDays: dto.deadline_soon_days }
          : {}),
        ...(dto.evening_start !== undefined
          ? { eveningStart: this.clock(dto.evening_start) ?? '18:00' }
          : {}),
        ...(dto.features !== undefined
          ? {
              featureFlags: await this.mergeFeatures(user.id, dto.features),
            }
          : {}),
      },
    });
    return this.toJson(row);
  }

  private async mergeFeatures(
    id: string,
    patch: Partial<{
      navigation_order: string[];
      countdowns: boolean;
      focus: boolean;
      matrix: boolean;
      when_deadline: boolean;
      day_load: boolean;
      day_closing: boolean;
      day_replan: boolean;
    }>,
  ) {
    const current = featureFlags(
      (
        await this.prisma.user.findFirst({
          where: { id },
          select: { featureFlags: true },
        })
      )?.featureFlags,
    );
    return {
      navigation_order: featureFlags({
        navigation_order: patch.navigation_order ?? current.navigation_order,
      }).navigation_order,
      countdowns: patch.countdowns ?? current.countdowns,
      focus: patch.focus ?? current.focus,
      matrix: patch.matrix ?? current.matrix,
      when_deadline: patch.when_deadline ?? current.when_deadline,
      day_load: patch.day_load ?? current.day_load,
      day_closing: patch.day_closing ?? current.day_closing,
      day_replan: patch.day_replan ?? current.day_replan,
    };
  }

  private async require(id: string): Promise<{
    id: string;
    email: string;
    displayName: string;
    timeZone: string;
    locale: string;
    weekStart: 'monday' | 'sunday';
    theme: 'light' | 'dark' | 'auto';
    nlpLanguage: string;
    density: string;
    accent: string;
    defaultReminderTrigger: string | null;
    taskCompleteChildren: 'ask' | 'complete' | 'leave';
    dailyReminderTime: string | null;
    quietHoursStart: string | null;
    quietHoursEnd: string | null;
    telegramEnabled: boolean;
    focusNotifications: boolean;
    shutdownReminderTime: string | null;
    workDayStart: string | null;
    workDayEnd: string | null;
    defaultTaskDuration: number;
    deadlineSoonDays: number;
    eveningStart: string;
    featureFlags: unknown;
  }> {
    const row = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        email: true,
        displayName: true,
        timeZone: true,
        locale: true,
        weekStart: true,
        theme: true,
        nlpLanguage: true,
        density: true,
        accent: true,
        defaultReminderTrigger: true,
        taskCompleteChildren: true,
        dailyReminderTime: true,
        quietHoursStart: true,
        quietHoursEnd: true,
        telegramEnabled: true,
        focusNotifications: true,
        shutdownReminderTime: true,
        workDayStart: true,
        workDayEnd: true,
        defaultTaskDuration: true,
        deadlineSoonDays: true,
        eveningStart: true,
        featureFlags: true,
      },
    });
    if (row === null) {
      throw new DomainException(HttpStatus.UNAUTHORIZED, 'unauthorized', 'Unknown user');
    }
    return row;
  }

  private toJson(row: {
    id: string;
    email: string;
    displayName: string;
    timeZone: string;
    locale: string;
    weekStart: 'monday' | 'sunday';
    theme: 'light' | 'dark' | 'auto';
    nlpLanguage: string;
    density: string;
    accent: string;
    defaultReminderTrigger: string | null;
    taskCompleteChildren: 'ask' | 'complete' | 'leave';
    dailyReminderTime: string | null;
    quietHoursStart: string | null;
    quietHoursEnd: string | null;
    telegramEnabled: boolean;
    focusNotifications: boolean;
    shutdownReminderTime: string | null;
    workDayStart: string | null;
    workDayEnd: string | null;
    defaultTaskDuration: number;
    deadlineSoonDays: number;
    eveningStart: string;
    featureFlags: unknown;
  }): MeResponseDto {
    return {
      id: row.id,
      email: row.email,
      display_name: row.displayName,
      time_zone: row.timeZone,
      locale: this.choice(row.locale),
      week_start: row.weekStart,
      theme: row.theme,
      nlp_language: this.choice(row.nlpLanguage),
      density: row.density === 'compact' ? 'compact' : 'comfortable',
      accent: this.accent(row.accent),
      default_reminder_trigger: row.defaultReminderTrigger,
      task_complete_children: row.taskCompleteChildren,
      daily_reminder_time: row.dailyReminderTime,
      quiet_hours_start: row.quietHoursStart,
      quiet_hours_end: row.quietHoursEnd,
      telegram_enabled: row.telegramEnabled,
      focus_notifications: row.focusNotifications,
      shutdown_reminder_time: row.shutdownReminderTime,
      work_day_start: row.workDayStart,
      work_day_end: row.workDayEnd,
      default_task_duration_minutes: row.defaultTaskDuration,
      deadline_soon_days: row.deadlineSoonDays,
      evening_start: row.eveningStart,
      features: featureFlags(row.featureFlags),
    };
  }

  private choice(value: string): 'auto' | 'es' | 'en' {
    if (value === 'auto' || value === 'en' || value === 'es') {
      return value;
    }
    return 'es';
  }

  private accent(value: string): 'indigo' | 'violet' | 'teal' | 'amber' | 'rose' | 'slate' {
    if (
      value === 'violet' ||
      value === 'teal' ||
      value === 'amber' ||
      value === 'rose' ||
      value === 'slate' ||
      value === 'indigo'
    ) {
      return value;
    }
    return 'indigo';
  }

  async subscribe(user: AuthUser, dto: PushSubscriptionDto): Promise<{ id: string }> {
    const row = await this.prisma.pushSubscription.upsert({
      where: { ownerId_endpoint: { ownerId: user.id, endpoint: dto.endpoint } },
      create: {
        ownerId: user.id,
        endpoint: dto.endpoint,
        p256dh: dto.p256dh,
        auth: dto.auth,
      },
      update: { p256dh: dto.p256dh, auth: dto.auth, deletedAt: null },
    });
    return { id: row.id };
  }

  async inboundEmailStatus(user: AuthUser): Promise<InboundEmailStatusDto> {
    const row = await this.prisma.user.findFirst({
      where: { id: user.id, deletedAt: null },
      select: { inboundEmailTokenHash: true },
    });
    return { active: typeof row?.inboundEmailTokenHash === 'string' };
  }

  async rotateInboundEmail(user: AuthUser): Promise<InboundEmailAddressDto> {
    const token = newInboundToken();
    await this.prisma.user.update({
      where: { id: user.id },
      data: { inboundEmailTokenHash: hashInboundToken(token) },
    });
    return { address: inboundAddress(token), token };
  }

  async revokeInboundEmail(user: AuthUser): Promise<void> {
    await this.prisma.user.update({
      where: { id: user.id },
      data: { inboundEmailTokenHash: null },
    });
  }

  async unsubscribe(user: AuthUser, id: string): Promise<void> {
    const row = await this.prisma.pushSubscription.findFirst({
      where: { id, ownerId: user.id, deletedAt: null },
    });
    if (row === null) {
      throw new DomainException(
        HttpStatus.NOT_FOUND,
        'subscription_not_found',
        'Push subscription was not found',
      );
    }
    await this.prisma.pushSubscription.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  private dailyTime(value: string | null): string | null {
    if (value === null || value.trim().length === 0) {
      return null;
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'daily_reminder_time must be HH:mm',
      );
    }
    return value;
  }

  async notificationHealth(user: AuthUser): Promise<NotificationHealthDto> {
    const rows = await this.prisma.reminderDelivery.findMany({
      where: { ownerId: user.id },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      select: {
        id: true,
        taskId: true,
        kind: true,
        status: true,
        channel: true,
        attempts: true,
        fireAt: true,
        firedAt: true,
        nextRetryAt: true,
      },
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        task_id: row.taskId,
        kind: row.kind,
        status: row.status,
        channel: row.channel,
        attempts: row.attempts,
        fire_at: row.fireAt.toISOString(),
        fired_at: row.firedAt?.toISOString() ?? null,
        next_retry_at: row.nextRetryAt?.toISOString() ?? null,
      })),
    };
  }

  private clock(value: string | null): string | null {
    if (value === null || value.trim().length === 0) {
      return null;
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'quiet hours must be HH:mm',
      );
    }
    return value;
  }
}
