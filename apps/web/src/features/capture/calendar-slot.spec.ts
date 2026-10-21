import { describe, expect, it } from 'vitest';
import { allDaySlot, slotFromPoint, slotToTaskBody, snapToSlot } from './calendar-slot';
import { quickAddRequest } from './quick-add';

describe('TTD-AUD-74: calendar slots', () => {
  it('snaps down and clamps to the day', () => {
    expect(snapToSlot(16 * 60 + 35)).toBe(990);
    expect(snapToSlot(-15)).toBe(0);
    expect(snapToSlot(1450)).toBe(1410);
  });
  it('maps a scrolled column point into account-zone start, end and duration', () => {
    const slot = slotFromPoint({
      day: '2026-10-24',
      clientY: 100 + ((13 * 60 + 35) / 60) * 48,
      top: 100,
      timeZone: 'Europe/Madrid',
    });
    expect(slotToTaskBody(slot, slot.timeZone)).toEqual({
      start_date: '2026-10-24T11:30:00.000Z',
      due_date: '2026-10-24T12:00:00.000Z',
      duration_minutes: 30,
      is_all_day: false,
      time_zone: 'Europe/Madrid',
    });
    const range = slotFromPoint({
      day: '2026-10-24',
      clientY: 9 * 48,
      endY: 10.5 * 48,
      top: 0,
      timeZone: 'Europe/Madrid',
    });
    expect(slotToTaskBody(range, range.timeZone).duration_minutes).toBe(90);
    const reversed = slotFromPoint({
      day: '2026-10-24',
      clientY: 10.5 * 48,
      endY: 9 * 48,
      top: 0,
      timeZone: 'Europe/Madrid',
    });
    expect(reversed).toEqual(range);
  });
  it('uses local midnight rather than a UTC civil date', () => {
    const slot = allDaySlot('2026-10-24', 'Europe/Madrid');
    expect(slotToTaskBody(slot, slot.timeZone)).toEqual({
      due_date: '2026-10-23T22:00:00.000Z',
      is_all_day: true,
      time_zone: 'Europe/Madrid',
    });
  });
  it('keeps elapsed duration coherent at the Madrid clock change', () => {
    const slot = slotFromPoint({
      day: '2026-10-25',
      clientY: 2.5 * 48,
      top: 0,
      timeZone: 'Europe/Madrid',
    });
    expect(slot.start).toBe('2026-10-25T01:30:00.000Z');
    expect(slotToTaskBody(slot, slot.timeZone)).toMatchObject({
      due_date: '2026-10-25T02:00:00.000Z',
      duration_minutes: 30,
    });
    const missing = slotFromPoint({
      day: '2026-03-29',
      clientY: 2.5 * 48,
      top: 0,
      timeZone: 'Europe/Madrid',
    });
    expect(missing.start).toBe('2026-03-29T01:00:00.000Z');
  });
  it('clamps a dragged end to midnight of its starting day', () => {
    const slot = slotFromPoint({
      day: '2026-10-24',
      clientY: 23 * 48,
      endY: 26 * 48,
      top: 0,
      timeZone: 'Europe/Madrid',
    });
    expect(slotToTaskBody(slot, slot.timeZone)).toMatchObject({
      due_date: '2026-10-24T22:00:00.000Z',
      duration_minutes: 60,
    });
  });
  it('uses slot and context only if the parser does not supply them', () => {
    const input = {
      language: 'es' as const,
      now: '2026-10-21T10:00:00Z',
      timeZone: 'Europe/Madrid',
      viewDay: null,
      viewSlot: slotFromPoint({
        day: '2026-10-24',
        clientY: 13.5 * 48,
        top: 0,
        timeZone: 'Europe/Madrid',
      }),
      defaultProjectId: 'context',
    };
    expect(quickAddRequest({ ...input, text: 'Comprar pan' }).body).toMatchObject({
      project_id: 'context',
      duration_minutes: 30,
      start_date: '2026-10-24T11:30:00.000Z',
    });
    const explicit = quickAddRequest({
      ...input,
      text: 'Llamar a Ana #trabajo !alta ^casa mañana 10:00',
    });
    expect(explicit.body).not.toHaveProperty('start_date');
    expect(explicit.body).not.toHaveProperty('due_date');
    expect(explicit.body).not.toHaveProperty('duration_minutes');
    expect(explicit.body).not.toHaveProperty('project_id');
    expect(explicit.parsed).toMatchObject({
      priority: 'high',
      tagNames: ['trabajo'],
      listName: 'casa',
      due: { date: '2026-10-22T08:00:00.000Z' },
    });
  });
});
