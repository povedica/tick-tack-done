import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Put,
  ValidationPipe,
} from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn } from 'class-validator';
import { DomainEvent } from '../events/domain-events.js';
import { EventRecorder } from '../events/event-recorder.js';
import { asJson } from '../http/json.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { actorOf, type AuthUser } from './auth-user.js';
import { CurrentUser } from './current-user.decorator.js';
import { Scopes } from './scopes.decorator.js';

class ViewPreferenceDto {
  @ApiProperty({ enum: ['list', 'kanban', 'timeline', 'matrix'] })
  @IsIn(['list', 'kanban', 'timeline', 'matrix'])
  view!: string;
  @ApiProperty({ enum: ['none', 'section', 'date', 'tag', 'priority', 'due', 'list'] })
  @IsIn(['none', 'section', 'date', 'tag', 'priority', 'due', 'list'])
  group!: string;
  @ApiProperty({ enum: ['manual', 'date', 'priority', 'title', 'created', 'due'] })
  @IsIn(['manual', 'date', 'priority', 'title', 'created', 'due'])
  sort!: string;
  @ApiProperty({ enum: ['asc', 'desc'] }) @IsIn(['asc', 'desc']) order!: string;
  @ApiProperty() @IsBoolean() showDetails!: boolean;
  @ApiProperty() @IsBoolean() hideCompleted!: boolean;
  @ApiProperty({ enum: ['side', 'popup'] }) @IsIn(['side', 'popup']) detailLayout!: string;
  @ApiProperty() @IsBoolean() syncAcrossDevices!: boolean;
}

@ApiTags('me')
@Controller('me/view-preferences')
export class ViewPreferencesController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventRecorder) private readonly events: EventRecorder,
  ) {}

  @Get(':key')
  @Scopes('profile:read')
  @ApiOperation({ summary: 'Read view preferences for the current account (TTD-AUD-59)' })
  async get(@CurrentUser() user: AuthUser, @Param('key') key: string) {
    if (key.length === 0 || key.length > 200) throw new BadRequestException('Invalid view key');
    const row = await this.prisma.viewPreference.findUnique({
      where: { ownerId_key: { ownerId: user.id, key } },
    });
    return { preferences: row?.preferences ?? null };
  }

  @Put(':key')
  @Scopes('profile:write')
  @ApiOperation({ summary: 'Persist view preferences across devices (TTD-AUD-59)' })
  async put(
    @CurrentUser() user: AuthUser,
    @Param('key') key: string,
    @Body(
      new ValidationPipe({
        expectedType: ViewPreferenceDto,
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    dto: ViewPreferenceDto,
  ) {
    if (key.length === 0 || key.length > 200) throw new BadRequestException('Invalid view key');
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.viewPreference.upsert({
        where: { ownerId_key: { ownerId: user.id, key } },
        create: { ownerId: user.id, key, preferences: asJson(dto) },
        update: { preferences: asJson(dto) },
      });
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.viewPreferenceUpdated,
        entityType: 'view_preference',
        entityId: user.id,
        action: 'updated',
        data: { key, preferences: asJson(dto) },
        previous: null,
      });
      return { preferences: row.preferences };
    });
  }
}
