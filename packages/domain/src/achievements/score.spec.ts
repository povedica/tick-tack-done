import { describe, expect, it } from 'vitest';
import { achievementScore, ACHIEVEMENT_LEVELS } from './score';
import { parsePluginManifest, pluginMay } from '../plugins/manifest';
import { allows, parseMentions } from '../collaboration/access';
import { isRasterImage } from '../attachments/image';
import { parseTelegramCommand } from '../integrations/telegram';
import { completionRate, parseDayBounds } from '../stats/aggregate';

describe('achievements', () => {
  it('RF-1602: a disabled score stays empty', () => {
    expect(
      achievementScore({ enabled: false, completedWeek: 10, habitPercent: 100, focusDays: 5 })
        .score,
    ).toBeNull();
  });

  it('RF-1602: an enabled score names a level', () => {
    expect(
      achievementScore({ enabled: true, completedWeek: 1, habitPercent: 0, focusDays: 0 }).level,
    ).toBe('inicio');
    expect(
      achievementScore({ enabled: true, completedWeek: 20, habitPercent: 80, focusDays: 4 }).level,
    ).toBe('constante');
    expect(
      achievementScore({ enabled: true, completedWeek: 8, habitPercent: 0, focusDays: 0 }).level,
    ).toBe('en marcha');
    expect(
      achievementScore({ enabled: true, completedWeek: 2, habitPercent: 0, focusDays: 0 }).level,
    ).toBe('arranque');
  });

  it('RF-2321: exposes twelve levels and a public formula breakdown', () => {
    expect(ACHIEVEMENT_LEVELS).toHaveLength(12);
    const score = achievementScore({
      enabled: true,
      completedOnTime: 2,
      completedLate: 1,
      priorityPoints: 15,
      pomodoros: 1,
      habitCheckIns: 2,
      overdueCount: 1,
    });
    // 2*10 + 1*5 + 15 + 15 + 2*8 - 5 = 66
    expect(score.score).toBe(66);
    expect(score.formula?.weights.pomodoro).toBe(15);
    expect(score.progress_to_next).not.toBeNull();
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
