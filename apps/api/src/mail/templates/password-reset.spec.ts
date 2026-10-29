import { describe, expect, it } from 'vitest';
import { renderPasswordChanged, renderPasswordReset } from './password-reset.js';

const url = 'https://todo.reflexionia.com/reset-password#token=abc';

describe('RF-PR-13 password mail', () => {
  it('renders Spanish and English reset mail with a fragment, never a query token', () => {
    const spanish = renderPasswordReset({
      locale: 'es',
      displayName: 'Pablo',
      url,
      minutes: 30,
    });
    const english = renderPasswordReset({
      locale: 'en',
      displayName: 'Pablo',
      url,
      minutes: 30,
    });
    expect(spanish.subject).toContain('Restablece');
    expect(english.subject).toContain('Reset your');
    expect(spanish.text).toContain('#token=');
    expect(spanish.text).not.toContain('?token=');
    expect(spanish.html).toContain('#token=');
    expect(english.text).toContain('works once');
  });

  it('escapes HTML in the display name', () => {
    const rendered = renderPasswordReset({
      locale: 'es',
      displayName: '<script>',
      url,
      minutes: 30,
    });
    expect(rendered.html).toContain('&lt;script&gt;');
    expect(rendered.html).not.toContain('<script>');
  });

  it('formats the change notice in the user time zone', () => {
    const rendered = renderPasswordChanged({
      locale: 'es',
      displayName: 'Pablo',
      when: new Date('2026-01-15T12:00:00.000Z'),
      timeZone: 'Europe/Madrid',
      ip: '203.0.113.4',
      userAgent: 'Test',
      manualTokens: ['Telegram'],
      settingsUrl: 'https://todo.reflexionia.com/settings/tokens',
      forgotUrl: 'https://todo.reflexionia.com/forgot-password',
    });
    expect(rendered.text).toContain('203.0.113.4');
    expect(rendered.text).toContain('siguen activos (1: Telegram)');
    expect(rendered.text).toContain('Europe/Madrid');
    expect(rendered.text).toMatch(/13:00|14:00/);
    expect(rendered.html).not.toContain('?token=');
  });
});
