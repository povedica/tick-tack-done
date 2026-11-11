import { gzipSync } from 'node:zlib';
import type { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import type { AuthUser } from '../../auth/auth-user.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { CalendarZoomService } from './calendar-zoom.service.js';

const user: AuthUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'zoom@example.test',
  timeZone: 'Europe/Madrid',
  completeChildren: 'leave',
  scopes: ['calendar:read'],
  tokenId: '22222222-2222-4222-8222-222222222222',
  sessionId: null,
  listIds: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
};

describe('calendar zoom ETag', () => {
  it('returns 304 from the version row and does not run the density query', async () => {
    const calls: string[] = [];
    const prisma = {
      $queryRaw: (query: Prisma.Sql) => {
        const text = query.strings.join('');
        calls.push(text);
        if (text.includes('calendar_versions')) {
          return Promise.resolve([{ version: 4n }]);
        }
        return Promise.resolve([]);
      },
    };
    const service = new CalendarZoomService(prisma as unknown as PrismaService);
    const raw = { from: '2026-01-01', to: '2026-01-31' };
    const first = await service.summary(user, raw);
    expect(first.body).not.toBeNull();
    expect(first.etag.startsWith('W/"v4-')).toBe(true);
    const before = calls.length;
    const again = await service.summary(user, raw, first.etag);
    expect(again.body).toBeNull();
    expect(again.etag).toBe(first.etag);
    const extra = calls.slice(before).join('\n');
    expect(extra).toContain('calendar_versions');
    expect(extra).not.toContain('task_days');
  });

  it('keeps a year of capped marks within 6 KB gzip', () => {
    const days: Record<string, { n: number; c: string[] }> = {};
    for (let index = 0; index < 365; index += 1) {
      const day = new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10);
      days[day] = {
        n: 12,
        c: [
          '#112233',
          '#445566',
          '#778899',
          'accent',
          'accent',
          'accent',
          'accent',
          'accent',
          'accent',
          'accent',
          'accent',
        ],
      };
    }
    const body = JSON.stringify({
      time_zone: 'Europe/Madrid',
      version: '1',
      granularity: 'day',
      days,
      truncated: true,
    });
    expect(gzipSync(body).length).toBeLessThanOrEqual(6 * 1024);
  });
});
