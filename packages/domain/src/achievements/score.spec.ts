import { describe, expect, it } from 'vitest';
import { controlScore, type ControlInput } from './score';
import { parsePluginManifest, pluginMay } from '../plugins/manifest';
import { allows, parseMentions } from '../collaboration/access';
import { isRasterImage } from '../attachments/image';
import { parseTelegramCommand } from '../integrations/telegram';
import { completionRate, parseDayBounds } from '../stats/aggregate';

const base: ControlInput = {
  planned: 0,
  onTime: 0,
  overdue: { under7: 0, d8to30: 0, over30: 0 },
  habitDone: 0,
  habitExpected: 0,
  pomodoros: 0,
  lifetimePomodoros: 0,
  usageDays: 0,
};
describe('RF-1602 Control v3', () => {
  it.each([
    [
      { overdue: { under7: 0, d8to30: 0, over30: 20 }, usageDays: 7 },
      { code: 'overdue', params: { count: 20, oldCount: 20, points: 25 } },
    ],
    [
      { planned: 20, onTime: 0, usageDays: 7 },
      { code: 'on_time', params: { actual: 0, target: 20 } },
    ],
    [
      { habitExpected: 10, habitDone: 0, usageDays: 7 },
      { code: 'habits', params: { actual: 0, target: 10 } },
    ],
    [
      { lifetimePomodoros: 1, pomodoros: 0, usageDays: 7 },
      { code: 'focus', params: { actual: 0, target: 10 } },
    ],
    [{ usageDays: 1 }, { code: 'usage', params: { actual: 1, target: 7 } }],
  ])('TTD-AUD-27: exposes a locale-independent deduction for %j', (patch, reason) => {
    expect(controlScore({ ...base, ...patch })).toMatchObject({ topDeductionReason: reason });
  });

  it('TTD-AUD-27: has no reason without a deduction, data, or enabled scoring', () => {
    for (const input of [
      base,
      { ...base, enabled: false, usageDays: 1 },
      { ...base, usageDays: 7 },
    ])
      expect(controlScore(input)).toMatchObject({ topDeductionReason: null });
  });
  it('returns no score without observed data or when disabled', () => {
    expect(controlScore(base).score).toBeNull();
    expect(controlScore({ ...base, enabled: false, usageDays: 7 }).score).toBeNull();
  });
  it.each([
    [{ planned: 3, onTime: 3, usageDays: 1 }, 79],
    [{ planned: 1, onTime: 1, usageDays: 7 }, 90],
    [
      {
        planned: 20,
        onTime: 12,
        overdue: { under7: 0, d8to30: 0, over30: 58 },
        habitDone: 5,
        habitExpected: 7,
        pomodoros: 6,
        lifetimePomodoros: 6,
        usageDays: 7,
      },
      51,
    ],
    [
      {
        planned: 20,
        onTime: 12,
        habitDone: 5,
        habitExpected: 7,
        pomodoros: 6,
        lifetimePomodoros: 6,
        usageDays: 7,
      },
      76,
    ],
    [{ planned: 20, onTime: 18, overdue: { under7: 5, d8to30: 0, over30: 0 }, usageDays: 5 }, 81],
  ])('matches the approved formula for %j', (patch, expected) => {
    expect(controlScore({ ...base, ...patch }).score).toBe(expected);
  });
  it('excludes unused focus but includes previously used focus and empty recent cohorts', () => {
    expect(controlScore({ ...base, usageDays: 7 }).components?.focus.configured).toBe(false);
    expect(
      controlScore({ ...base, usageDays: 7, lifetimePomodoros: 1 }).components?.focus,
    ).toMatchObject({ configured: true, earned: 0 });
    expect(
      controlScore({ ...base, overdue: { under7: 0, d8to30: 1, over30: 0 } }).components?.tasks
        .cumplimiento.earned,
    ).toBe(25);
  });
});

describe('stats aggregate', () => {
  it('RF-2321: completion rate counts only due tasks in range', () => {
    const bounds = parseDayBounds('2026-10-13', '2026-10-19', 'Europe/Madrid');
    expect(bounds).not.toBeNull();
    const rate = completionRate(
      [
        {
          id: '1',
          title: 'a',
          status: 'completed',
          priority: 'none',
          isAllDay: true,
          createdAt: '2026-10-10T10:00:00.000Z',
          completedAt: '2026-10-14T10:00:00.000Z',
          dueDate: '2026-10-14T22:00:00.000Z',
          listId: 'l',
          listName: 'Inbox',
          listColor: null,
          tagIds: [],
          tagNames: [],
        },
        {
          id: '2',
          title: 'b',
          status: 'active',
          priority: 'none',
          isAllDay: true,
          createdAt: '2026-10-10T10:00:00.000Z',
          completedAt: null,
          dueDate: '2026-10-15T22:00:00.000Z',
          listId: 'l',
          listName: 'Inbox',
          listColor: null,
          tagIds: [],
          tagNames: [],
        },
        {
          id: '3',
          title: 'no due',
          status: 'completed',
          priority: 'none',
          isAllDay: false,
          createdAt: '2026-10-14T10:00:00.000Z',
          completedAt: '2026-10-14T12:00:00.000Z',
          dueDate: null,
          listId: 'l',
          listName: 'Inbox',
          listColor: null,
          tagIds: [],
          tagNames: [],
        },
      ],
      '2026-10-13',
      '2026-10-19',
      'Europe/Madrid',
    );
    expect(rate.planned).toBe(2);
    expect(rate.completed).toBe(1);
    expect(rate.rate).toBe(50);
  });
});

describe('plugins', () => {
  it('accepts a manifest and rejects an unknown permission', () => {
    const parsed = parsePluginManifest({
      id: 'com.pablo.demo',
      version: '1.0.0',
      name: 'Demo',
      permissions: ['tasks:read', 'ui:widgets'],
      entrypoints: { views: './views/' },
      networkAllowlist: ['https://example.test'],
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(pluginMay(parsed.manifest, 'ui:widgets')).toBe(true);
      expect(pluginMay(parsed.manifest, 'tasks:write')).toBe(false);
    }
    const missing = parsePluginManifest({ id: 'nope', name: 'x', version: '1', permissions: [] });
    expect(missing.ok ? null : missing.reason).toBe('missing_id');
    const unknown = parsePluginManifest({
      id: 'com.pablo.demo',
      version: '1',
      name: 'Demo',
      permissions: ['root'],
      entrypoints: {},
    });
    expect(unknown.ok ? null : unknown.reason).toBe('unknown_permission');
    const broken = parsePluginManifest(null);
    expect(broken.ok ? null : broken.reason).toBe('invalid');
  });
});

describe('collaboration', () => {
  it('RF-1801: write can comment and read cannot', () => {
    expect(allows('write', 'comment')).toBe(true);
    expect(allows('read', 'comment')).toBe(false);
    expect(allows('comment', 'read')).toBe(true);
  });

  it('RF-1803: mentions are unique display names', () => {
    expect(parseMentions('Hola @Ana y @ana, mira @Luis')).toEqual(['ana', 'luis']);
  });
});

describe('attachments', () => {
  it('RF-203: png and jpeg are images and pdf is not', () => {
    expect(isRasterImage('image/png')).toBe(true);
    expect(isRasterImage('image/jpeg; charset=binary')).toBe(true);
    expect(isRasterImage('application/pdf')).toBe(false);
  });
});

describe('telegram', () => {
  it('RF-2003: today and a list are commands; the rest is capture', () => {
    expect(parseTelegramCommand('¿qué tengo hoy?').kind).toBe('today');
    expect(parseTelegramCommand('/lista')).toEqual({ kind: 'lists' });
    expect(parseTelegramCommand('/manana').kind).toBe('tomorrow');
    expect(parseTelegramCommand('/semana').kind).toBe('week');
    expect(parseTelegramCommand('qué hay en compra')).toEqual({ kind: 'list', name: 'compra' });
    expect(parseTelegramCommand('/lista #5min')).toEqual({ kind: 'tag', name: '5min' });
    expect(parseTelegramCommand('/lista !alta')).toEqual({ kind: 'priority', level: 'high' });
    expect(parseTelegramCommand('comprar leche mañana').kind).toBe('capture');
    expect(parseTelegramCommand('/capturar comprar leche mañana')).toEqual({
      kind: 'capture',
      text: 'comprar leche mañana',
    });
    expect(parseTelegramCommand('/add comprar leche ^compra')).toEqual({
      kind: 'capture',
      text: 'comprar leche ^compra',
    });
    expect(parseTelegramCommand('/capturar')).toEqual({ kind: 'capture', text: '' });
  });
});
