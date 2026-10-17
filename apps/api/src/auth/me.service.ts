import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { isIanaTimeZone } from '@reflexionia/domain';
import { DomainException } from '../http/domain.exception';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from './auth-user';
import type { MeResponseDto, UpdateMeDto } from './me.dto';

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
  }): MeResponseDto {
    return {
      id: row.id,
      email: row.email,
      display_name: row.displayName,
      time_zone: row.timeZone,
      locale: row.locale,
      task_complete_children: row.taskCompleteChildren,
    };
  }
}
