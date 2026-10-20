import { Controller, Get, Header, Inject, Query, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { AuthUser } from '../../auth/auth-user.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { Scopes } from '../../auth/scopes.decorator.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { patEventPrefixes, syncAndFilters } from '../sync/sync-visibility.js';

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
    let cursor = parseCursor(since);
    const prefixes = user.tokenId === null ? [] : patEventPrefixes(user.scopes);
    const write = async (): Promise<void> => {
      const typeFilter =
        prefixes.length === 0
          ? {}
          : { OR: prefixes.map((prefix) => ({ type: { startsWith: prefix } })) };
      const cursorFilter =
        cursor === null
          ? null
          : {
              OR: [
                { occurredAt: { gt: cursor.occurredAt } },
                { occurredAt: cursor.occurredAt, id: { gt: cursor.id } },
              ],
            };
      const and = syncAndFilters(typeFilter, cursorFilter);
      const rows = await this.prisma.outboxEvent.findMany({
        where: {
          ownerId: user.id,
          ...(and.length > 0 ? { AND: [...and] } : {}),
        },
        orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
        take: 50,
      });
      for (const row of rows) {
        res.write(
          `id: ${row.occurredAt.toISOString()}|${row.id}\nevent: ${row.type}\ndata: ${JSON.stringify({ id: row.id, type: row.type })}\n\n`,
        );
        cursor = { occurredAt: row.occurredAt, id: row.id };
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

function parseCursor(since: string | undefined): { occurredAt: Date; id: string } | null {
  if (since === undefined || since.length === 0) {
    return null;
  }
  const pipe = since.indexOf('|');
  if (pipe > 0) {
    const occurredAt = new Date(since.slice(0, pipe));
    const id = since.slice(pipe + 1);
    if (!Number.isNaN(occurredAt.getTime()) && id.length > 0) {
      return { occurredAt, id };
    }
  }
  const occurredAt = new Date(since);
  if (Number.isNaN(occurredAt.getTime())) {
    return null;
  }
  return { occurredAt, id: '' };
}
