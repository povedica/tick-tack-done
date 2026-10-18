import { Body, Controller, Get, HttpStatus, Inject, Put, Req, Res } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional } from 'class-validator';
import type { Request, Response } from 'express';
import { DEFAULT_QUADRANT_EFFECTS, MATRIX_QUADRANTS, type MatrixQuadrant } from '@reflexionia/domain';
import { actorOf, type AuthUser } from '../../auth/auth-user';
import { CurrentUser } from '../../auth/current-user.decorator';
import { Scopes } from '../../auth/scopes.decorator';
import { DomainEvent } from '../../events/domain-events';
import { EventRecorder } from '../../events/event-recorder';
import { asJson } from '../../http/json';
import { DomainException } from '../../http/domain.exception';
import { respondJson } from '../../http/respond';
import { PrismaService } from '../../prisma/prisma.service';

class MatrixRuleDto {
  @ApiProperty({ enum: MATRIX_QUADRANTS })
  @IsIn([...MATRIX_QUADRANTS])
  quadrant!: MatrixQuadrant;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsObject()
  rules?: Record<string, unknown> | null;

  @ApiProperty()
  @IsObject()
  effect!: Record<string, unknown>;
}

@ApiTags('matrix')
@Controller('matrix')
export class MatrixController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventRecorder) private readonly events: EventRecorder,
  ) {}

  @Get('rules')
  @Scopes('tasks:read')
  @ApiOperation({ summary: 'Eisenhower rules. Missing rows use the spec defaults (RF-1004).' })
  async list(@CurrentUser() user: AuthUser, @Req() req: Request, @Res() res: Response): Promise<void> {
    const rows = await this.prisma.matrixRule.findMany({
      where: { ownerId: user.id, deletedAt: null },
    });
    const byQuadrant = new Map(rows.map((row) => [row.quadrant, row]));
    respondJson(
      req,
      res,
      200,
      {
        items: MATRIX_QUADRANTS.map((quadrant) => {
          const saved = byQuadrant.get(quadrant);
          return {
            quadrant,
            rules: saved?.rules ?? null,
            effect: saved?.effect ?? DEFAULT_QUADRANT_EFFECTS[quadrant],
            custom: saved !== undefined,
          };
        }),
      },
      false,
    );
  }

  @Put('rules')
  @Scopes('tasks:write')
  @ApiOperation({ summary: 'Replace one quadrant rule (RF-1004)' })
  async save(
    @CurrentUser() user: AuthUser,
    @Body() dto: MatrixRuleDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    if (!isEffect(dto.effect)) {
      throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', 'effect is invalid');
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.matrixRule.upsert({
        where: { ownerId_quadrant: { ownerId: user.id, quadrant: dto.quadrant } },
        create: {
          ownerId: user.id,
          quadrant: dto.quadrant,
          rules: dto.rules == null ? Prisma.DbNull : asJson(dto.rules),
          effect: asJson(dto.effect),
        },
        update: {
          rules: dto.rules == null ? Prisma.DbNull : asJson(dto.rules),
          effect: asJson(dto.effect),
          deletedAt: null,
        },
      });
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.matrixUpdated,
        entityType: 'matrix_rule',
        entityId: saved.id,
        action: 'updated',
        data: asJson({ quadrant: dto.quadrant }),
        previous: null,
      });
      return saved;
    });
    respondJson(req, res, 200, { id: row.id, quadrant: row.quadrant, effect: row.effect }, false);
  }
}

function isEffect(value: Record<string, unknown>): boolean {
  const priority = value.priority;
  const due = value.due;
  return (
    (priority === 'none' || priority === 'low' || priority === 'medium' || priority === 'high') &&
    (due === 'within_24h' || due === 'after_24h' || due === 'clear')
  );
}
