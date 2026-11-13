import { describe, expect, it } from 'vitest';
import { captureSettings } from './capture-settings';
import { parseCapture } from './parse-capture';
const context = { now: '2026-10-24T12:00:00Z', timeZone: 'Europe/Madrid' };
describe('RF-102: configurable capture defaults', () => {
  it('preserves the existing recognition and title cleanup by default', () => {
    const parsed = parseCapture('Comprar mañana #casa !alta', 'es', context, captureSettings({}));
    expect(parsed).toMatchObject({ title: 'Comprar', tagNames: ['casa'], priority: 'high' });
    expect(parsed.due?.isAllDay).toBe(true);
  });
  it('can keep date and tag text while still extracting their values', () => {
    const parsed = parseCapture(
      'Comprar mañana #casa',
      'es',
      context,
      captureSettings({ remove_date_text: false, remove_tag_text: false }),
    );
    expect(parsed.title).toBe('Comprar mañana #casa');
    expect(parsed.tagNames).toEqual(['casa']);
    expect(parsed.due).not.toBeNull();
  });
  it('disabled recognition leaves tokens literal and does not create metadata', () => {
    const parsed = parseCapture(
      'Comprar mañana #casa',
      'es',
      context,
      captureSettings({ recognize_dates: false, recognize_tags: false }),
    );
    expect(parsed).toMatchObject({
      title: 'Comprar mañana #casa',
      due: null,
      tagNames: [],
      repeatRule: null,
    });
  });
  it('explicit parsed priority, date and duration beat defaults', () => {
    const parsed = parseCapture(
      'Revisar 23/10/2028 18:00 ~45m !alta',
      'es',
      context,
      captureSettings({
        default_priority: 'low',
        default_duration_minutes: 60,
        default_date: 'today',
      }),
    );
    expect(parsed.priority).toBe('high');
    expect(parsed.durationMinutes).toBe(45);
    expect(parsed.due?.date).toContain('2028-10-23');
  });
  it('resolves a timed tomorrow default across the Madrid DST boundary', () => {
    const parsed = parseCapture(
      'Revisar',
      'es',
      context,
      captureSettings({
        default_date: 'tomorrow',
        default_date_mode: 'date_time',
        default_time: '09:00',
        default_priority: 'medium',
        default_duration_minutes: 60,
      }),
    );
    expect(parsed).toMatchObject({
      priority: 'medium',
      durationMinutes: 60,
      due: { date: '2026-10-25T08:00:00.000Z', isAllDay: false },
    });
  });
  it('does not apply a date fallback to a someday capture or an explicit start', () => {
    const settings = captureSettings({ default_date: 'today' });
    expect(parseCapture('Leer algún día', 'es', context, settings).due).toBeNull();
    expect(parseCapture('Leer esta noche', 'es', context, settings).due).toBeNull();
  });
  it('rejects invalid persisted enum, numeric and clock defaults', () => {
    expect(
      captureSettings({
        default_time: '25:00',
        default_date: 'invalid',
        default_duration_minutes: -1,
        recognize_tags: 'yes',
      }),
    ).toMatchObject({
      default_time: '09:00',
      default_date: 'none',
      default_duration_minutes: null,
      recognize_tags: true,
    });
  });
});
