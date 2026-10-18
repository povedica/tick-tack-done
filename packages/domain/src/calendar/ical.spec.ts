import { describe, expect, it } from 'vitest';
import { parseIcal, tasksToIcal } from './ical';

describe('ical', () => {
  it('RF-1104: a dated task becomes a VEVENT and an undated task is skipped', () => {
    const ical = tasksToIcal(
      'Trabajo',
      [
        {
          id: 'task-1',
          title: 'Informe, final',
          content: 'línea\n2',
          startDate: '2026-10-18T09:00:00.000Z',
          dueDate: '2026-10-18T10:00:00.000Z',
          isAllDay: false,
        },
        {
          id: 'task-2',
          title: 'Sin fecha',
          content: '',
          startDate: null,
          dueDate: null,
          isAllDay: false,
        },
        {
          id: 'task-3',
          title: 'Día',
          content: '',
          startDate: '2026-10-19T00:00:00.000Z',
          dueDate: '2026-10-20T00:00:00.000Z',
          isAllDay: true,
        },
      ],
      '2026-10-18T08:00:00.000Z',
    );
    expect(ical).toContain('SUMMARY:Informe\\, final');
    expect(ical).toContain('BEGIN:VEVENT');
    expect(ical).not.toContain('Sin fecha');
    const parsed = parseIcal(ical);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]?.title).toBe('Informe, final');
    expect(parsed[1]?.isAllDay).toBe(true);
  });

  it('RF-1103: a broken calendar and a folded line yield only valid events', () => {
    expect(parseIcal('not a calendar')).toEqual([]);
    const parsed = parseIcal(
      'BEGIN:VEVENT\r\nUID:ext-1\r\nSUMMARY:Reu\r\n nión\r\nDTSTART:20261018T090000Z\r\nDTEND:20261018T100000Z\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:sin uid\r\nEND:VEVENT',
    );
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.title).toBe('Reunión');
    expect(parsed[0]?.endsAt).toBe('2026-10-18T10:00:00.000Z');
  });
});
