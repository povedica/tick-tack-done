import { describe, expect, it } from 'vitest';
import { achievementScore } from './score';
import { parsePluginManifest, pluginMay } from '../plugins/manifest';
import { allows, parseMentions } from '../collaboration/access';
import { isRasterImage } from '../attachments/image';
import { parseTelegramCommand } from '../integrations/telegram';

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
  it('RF-2003: today, a list and a button complete are commands; the rest is capture', () => {
    expect(parseTelegramCommand('¿qué tengo hoy?').kind).toBe('today');
    expect(parseTelegramCommand('qué hay en compra')).toEqual({ kind: 'list', name: 'compra' });
    expect(parseTelegramCommand('/complete 11111111-1111-1111-1111-111111111111').kind).toBe(
      'complete',
    );
    expect(parseTelegramCommand('comprar leche mañana').kind).toBe('capture');
  });
});
