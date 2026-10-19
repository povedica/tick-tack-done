import { Controller, Get, Header, Inject, Query, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { AuthUser } from '../../auth/auth-user.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { Scopes } from '../../auth/scopes.decorator.js';
import { PrismaService } from '../../prisma/prisma.service.js';

/** RF-13013. SSE of bus events. The offline queue and delta sync stay. */
@ApiTags('sync')
@Controller('events')
export class RealtimeController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get('stream')
  @Scopes('tasks:read')
  @Header('Content-Type', 'text/event-stream')
  @Header('Cache-Control', 'no-cache')
  @ApiOperation({ summary: 'Push domain events to open clients (RF-13013)' })
  async stream(
    @CurrentUser() user: AuthUser,
    @Query('since') since: string | undefined,
    @Query('once') once: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    res.flushHeaders();
    let cursor = since ?? '';
    const write = async (): Promise<void> => {
      const rows = await this.prisma.outboxEvent.findMany({
        where: {
          ownerId: user.id,
          ...(cursor.length === 0 ? {} : { occurredAt: { gt: new Date(cursor) } }),
        },
        orderBy: { occurredAt: 'asc' },
        take: 50,
      });
      for (const row of rows) {
        res.write(
          `id: ${row.id}\nevent: ${row.type}\ndata: ${JSON.stringify({ id: row.id, type: row.type })}\n\n`,
        );
        cursor = row.occurredAt.toISOString();
      }
    };
    await write();
    if (once === '1') {
      res.end();
      return;
    }
    const timer = setInterval(() => {
      void write();
    }, 2000);
    req.on('close', () => {
      clearInterval(timer);
    });
  }
}
