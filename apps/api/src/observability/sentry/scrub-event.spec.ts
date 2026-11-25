import type { ErrorEvent } from '@sentry/core';
import { describe, expect, it } from 'vitest';
import { leaks, TRAP } from '../../../test/helpers/pii-trap.js';
import { repoPath, scrubEvent } from './scrub-event.js';

describe('scrubEvent', () => {
  it('CA-05: keeps only the allowlist, whatever the SDK or the app attached', () => {
    const event = {
      type: undefined,
      event_id: 'e1',
      level: 'error',
      release: 'ttd-api@0.3.0+abcdef1',
      environment: 'production',
      message: `failed for ${TRAP.email}`,
      server_name: 'vps-host-01',
      request: {
        url: `https://todo.example.test/feeds/${TRAP.feedToken}?${TRAP.query}`,
        headers: { authorization: `Bearer ${TRAP.pat}`, cookie: TRAP.session },
        data: { title: TRAP.title, raw_text: TRAP.rawText },
      },
      extra: { title: TRAP.title },
      contexts: { task: { title: TRAP.title } },
      tags: {
        component: 'worker',
        job: 'reminders',
        title: TRAP.title,
        route: `GET /feeds/${TRAP.feedToken}`,
      },
      user: { id: 'u-1', email: TRAP.email, ip_address: '203.0.113.7' },
      breadcrumbs: [
        { category: 'fetch', type: 'http', data: { url: `/x?${TRAP.query}` }, message: TRAP.title },
      ],
      exception: {
        values: [
          {
            type: 'Error',
            value: `boom ${TRAP.oauthRefresh}`,
            stacktrace: {
              frames: [{ filename: '/app/src/main.ts', lineno: 3, vars: { title: TRAP.title } }],
            },
          },
        ],
      },
    } as unknown as ErrorEvent;

    const clean = scrubEvent(event);

    expect(Object.keys(clean).sort()).toEqual(
      [
        'breadcrumbs',
        'environment',
        'event_id',
        'exception',
        'level',
        'message',
        'release',
        'tags',
        'type',
        'user',
      ].sort(),
    );
    expect(clean.user).toEqual({ id: 'u-1' });
    expect(clean.tags).toEqual({
      component: 'worker',
      job: 'reminders',
      route: 'GET /feeds/:token',
    });
    expect(clean.breadcrumbs).toEqual([{ category: 'fetch', type: 'http' }]);
    expect(clean.exception?.values?.[0]?.stacktrace?.frames).toEqual([
      { filename: 'apps/api/src/main.ts', lineno: 3 },
    ]);
    expect(leaks(JSON.stringify(clean))).toEqual([]);
  });

  it('rewrites host, CI and container paths to repo paths', () => {
    expect(repoPath('/app/dist/main.js')).toBe('apps/api/dist/main.js');
    expect(repoPath('/home/runner/work/ttd/apps/api/src/x.ts')).toBe('apps/api/src/x.ts');
    expect(repoPath('/app/node_modules/.pnpm/a/node_modules/@nestjs/core/x.js')).toBe(
      'node_modules/@nestjs/core/x.js',
    );
    expect(repoPath('node:internal/process/task_queues')).toBe('node:internal/process/task_queues');
  });
});
