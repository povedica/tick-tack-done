import { describe, expect, it, vi } from 'vitest';
import { densityScopeFor, fetchCalendarSummary, summaryPath } from './calendar-density';

describe('densityScopeFor', () => {
  const base = { from: '2026-01-01', to: '2026-12-31', projectId: undefined, tagId: undefined };

  it('asks for the whole window when nothing is selected', () => {
    const request = densityScopeFor({ ...base, lists: null, tags: null, cals: null });
    expect(request.empty).toBe(false);
    expect(request.lists).toBeUndefined();
    expect(request.include).toBeUndefined();
    expect(summaryPath(request)).toContain('granularity=day');
    expect(summaryPath(request)).not.toContain('lists=');
  });

  it('keeps an empty list or calendar selection off the summary', () => {
    expect(densityScopeFor({ ...base, lists: '-', tags: null, cals: null }).include).toBe('events');
    expect(densityScopeFor({ ...base, lists: '-', tags: null, cals: '-' }).empty).toBe(true);
  });

  it('narrows to one list and drops a list outside the selection', () => {
    const project = '11111111-1111-4111-8111-111111111111';
    const other = '22222222-2222-4222-8222-222222222222';
    expect(
      densityScopeFor({ ...base, lists: null, tags: null, cals: null, projectId: project }).lists,
    ).toBe(project);
    expect(
      densityScopeFor({
        ...base,
        lists: other,
        tags: null,
        cals: '-',
        projectId: project,
      }).empty,
    ).toBe(true);
  });
});

describe('fetchCalendarSummary', () => {
  it('CA-R1-3: the second load sends If-None-Match and keeps the body on 304', async () => {
    const store = new Map<string, string>();
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    });
    const body = {
      time_zone: 'Europe/Madrid',
      version: '4',
      granularity: 'day',
      days: { '2026-01-05': { n: 1, c: ['#112233'] } },
      truncated: false,
    };
    const headers: string[] = [];
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      const sent = new Headers(init?.headers).get('If-None-Match');
      headers.push(sent ?? '');
      if (sent === 'W/"v4-year"') {
        return Promise.resolve(new Response(null, { status: 304 }));
      }
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { etag: 'W/"v4-year"', 'content-type': 'application/json' },
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const request = densityScopeFor({
      from: '2026-01-01',
      to: '2026-12-31',
      lists: null,
      tags: null,
      cals: null,
      projectId: undefined,
      tagId: undefined,
    });
    const first = await fetchCalendarSummary(request);
    const second = await fetchCalendarSummary(request);
    expect(first.days['2026-01-05']?.n).toBe(1);
    expect(second).toEqual(first);
    expect(headers).toEqual(['', 'W/"v4-year"']);
    vi.unstubAllGlobals();
  });
});
