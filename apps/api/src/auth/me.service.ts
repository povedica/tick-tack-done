import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { isIanaTimeZone } from '@reflexionia/domain';
import { hashInboundToken, inboundAddress, newInboundToken } from '../inbound/email-address.js';
import { DomainException } from '../http/domain.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthUser } from './auth-user.js';
import type {
  InboundEmailAddressDto,
  InboundEmailStatusDto,
  MeResponseDto,
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
      },
    });
    return this.toJson(row);
  }

  private async require(id: string): Promise<{
    id: string;
    email: string;
    displayName: string;
    timeZone: string;
    locale: string;
    taskCompleteChildren: 'ask' | 'complete' | 'leave';
    dailyReminderTime: string | null;
  }> {
    const row = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        email: true,
        displayName: true,
        timeZone: true,
        locale: true,
        taskCompleteChildren: true,
        dailyReminderTime: true,
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
    taskCompleteChildren: 'ask' | 'complete' | 'leave';
    dailyReminderTime: string | null;
  }): MeResponseDto {
    return {
      id: row.id,
      email: row.email,
      display_name: row.displayName,
      time_zone: row.timeZone,
      locale: row.locale,
      task_complete_children: row.taskCompleteChildren,
      daily_reminder_time: row.dailyReminderTime,
    };
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
}
