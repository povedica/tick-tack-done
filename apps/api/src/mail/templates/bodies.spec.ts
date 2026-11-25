import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderCountdownReminder } from './countdown.js';
import { renderPasswordChanged, renderPasswordReset } from './password-reset.js';
import { renderAccountDeletion, renderTotpDisabled } from './security-notice.js';
import { renderShareInvitation } from './share-invitation.js';
import { renderShutdownDigest } from './shutdown-digest.js';
import { renderTaskReminder } from './task-reminder.js';

const origin = 'https://todo.reflexionia.com';

describe('email bodies', () => {
  beforeEach(() => {
    vi.stubEnv('PUBLIC_URL', origin);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  it('renders a task reminder with chips and without a second action', () => {
    const mail = renderTaskReminder({
      locale: 'es',
      id: 't_demo09',
      title: 'Llamar al fontanero #casa',
      content: 'Preguntar por el presupuesto del calentador.',
      dueDate: '2026-11-25T09:00:00.000Z',
      isAllDay: false,
      timeZone: 'Europe/Madrid',
      priority: 'high',
      listName: 'Casa',
      tags: [{ name: 'casa' }, { name: 'llamadas' }],
      now: '2026-11-25T06:00:00.000Z',
      origin,
    });
    expect(mail.subject).toBe('Recordatorio: Llamar al fontanero (10:00)');
    expect(mail.html).toContain('Recordatorio');
    expect(mail.html).toContain('Llamar al fontanero');
    expect(mail.html).not.toContain('#casa');
    expect(mail.html).toContain('>casa<');
    expect(mail.html).toContain('>llamadas<');
    expect(mail.html).toContain('Hoy, 25 nov · 10:00');
    expect(mail.html).toContain('Ver tarea');
    expect(mail.html).toContain(`${origin}/task/t_demo09`);
    expect(mail.html).not.toContain('Posponer');
    const blank = renderTaskReminder({
      locale: 'es',
      id: 't_blank',
      title: '#casa',
      tags: [{ name: 'casa' }],
      now: '2026-11-25T06:00:00.000Z',
      origin,
    });
    expect(blank.subject).toBe('Recordatorio: #casa');
    const empty = renderTaskReminder({
      locale: 'en',
      id: 't_empty',
      title: '   ',
      now: '2026-11-25T06:00:00.000Z',
      origin,
    });
    expect(empty.subject).toBe('Reminder: Untitled');
    expect(empty.html).toContain('>Untitled<');
    expect(mail.html).toContain('bgcolor="#3e60cd"');
    expect(mail.text).toContain('Preguntar por el presupuesto');
    expect(mail.text).toContain('Gestionar notificaciones');
    expect(mail.html).toMatchSnapshot();
  });

  it('omits empty reminder rows', () => {
    const mail = renderTaskReminder({
      locale: 'en',
      id: 't1',
      title: 'Call',
      now: '2026-11-25T06:00:00.000Z',
      origin,
    });
    expect(mail.subject).toBe('Reminder: Call');
    expect(mail.html).not.toContain('When');
    expect(mail.html).not.toContain('Priority');
    expect(mail.html).not.toContain('Tags');
    expect(mail.html).toContain('View task');
  });

  it('renders the shutdown digest inside the shared frame', () => {
    const mail = renderShutdownDigest({ locale: 'es', pending: 3, origin });
    expect(mail.subject).toBe('Cierra tu día');
    expect(mail.html).toContain('Quedan 3 tareas de hoy.');
    expect(mail.html).toContain(`${origin}/cierre`);
    expect(mail.html).toContain('apple-touch-icon.png');
    expect(mail.text).toContain('Abrir el cierre');
    expect(mail.html).toMatchSnapshot();
  });

  it('renders a countdown for today and for a later day', () => {
    const today = renderCountdownReminder({
      locale: 'es',
      title: 'Vacaciones',
      kind: 'today',
      days: 0,
      origin,
    });
    const later = renderCountdownReminder({
      locale: 'en',
      title: 'Trip',
      kind: 'upcoming',
      days: 3,
      origin,
    });
    expect(today.html).toContain('Es hoy.');
    expect(today.html).toContain(`${origin}/countdowns`);
    expect(later.subject).toBe('Trip: 3 days left');
    const one = renderCountdownReminder({
      locale: 'es',
      title: 'Viaje',
      kind: 'upcoming',
      days: 1,
      origin,
    });
    const oneEn = renderCountdownReminder({
      locale: 'en',
      title: 'Trip',
      kind: 'upcoming',
      days: 1,
      origin,
    });
    expect(one.subject).toBe('Viaje: queda 1 día');
    expect(one.html).toContain('Queda 1 día.');
    expect(oneEn.subject).toBe('Trip: 1 day left');
    expect(oneEn.html).toContain('1 day left.');
    expect(later.text).toContain('View countdown');
    expect(today.html).toMatchSnapshot();
  });

  it('keeps the password reset link in the fragment and escapes the name', () => {
    const mail = renderPasswordReset({
      locale: 'es',
      displayName: '<script>',
      url: `${origin}/reset-password#token=abc`,
      minutes: 30,
    });
    expect(mail.subject).toContain('Restablece');
    expect(mail.text).toContain('#token=abc');
    expect(mail.text).not.toContain('?token=');
    expect(mail.html).toContain('#token=abc');
    expect(mail.html).toContain('&lt;script&gt;');
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('bgcolor="#3e60cd"');
    expect(mail.html).toContain('v:roundrect');
    expect(mail.html).toContain('apple-touch-icon.png');
    expect(mail.text).toContain('Gestionar notificaciones');
    expect(mail.html).toMatchSnapshot();
  });

  it('formats the password-changed notice in the user time zone', () => {
    const mail = renderPasswordChanged({
      locale: 'es',
      displayName: 'Pablo',
      when: new Date('2026-01-15T12:00:00.000Z'),
      timeZone: 'Europe/Madrid',
      ip: '203.0.113.4',
      userAgent: 'Test',
      manualTokens: ['Telegram'],
      settingsUrl: `${origin}/settings/tokens`,
      forgotUrl: `${origin}/forgot-password`,
    });
    expect(mail.text).toContain('203.0.113.4');
    expect(mail.text).toContain('siguen activos (1: Telegram)');
    expect(mail.text).toContain('Europe/Madrid');
    expect(mail.html).toContain('apple-touch-icon.png');
    expect(mail.html).not.toContain('?token=');
  });

  it('renders the share invitation with the list and the owner only', () => {
    const mail = renderShareInvitation({
      locale: 'es',
      displayName: 'Ana',
      listName: 'Casa & obra',
      ownerName: 'Pablo',
      url: `${origin}/settings/sharing`,
      origin,
    });
    expect(mail.subject).toBe('Invitación a «Casa & obra»');
    expect(mail.html).toContain('Casa &amp; obra');
    expect(mail.html).toContain('Pablo');
    expect(mail.html).toContain('Revisar la invitación');
    expect(mail.text).toContain(`${origin}/settings/sharing`);
    expect(mail.html).toMatchSnapshot();
  });

  it('renders account deletion and the admin TOTP notice as multipart mail', () => {
    const deletion = renderAccountDeletion({ locale: 'es', origin });
    const totp = renderTotpDisabled({ locale: 'en', origin });
    expect(deletion.subject).toBe('Se va a borrar tu cuenta');
    expect(deletion.html).toContain('apple-touch-icon.png');
    expect(deletion.text).toContain('Tu cuenta se está borrando.');
    expect(totp.subject).toBe('Two-factor authentication was turned off');
    expect(totp.text).toContain('An administrator turned off two-factor authentication');
    expect(totp.html).toContain('Manage notifications');
    expect(deletion.html).toMatchSnapshot();
    expect(totp.html).toMatchSnapshot();
  });
});
