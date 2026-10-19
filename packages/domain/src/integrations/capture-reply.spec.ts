import { describe, expect, it } from 'vitest';
import { formatCaptureReply } from './capture-reply';

const NOW = '2026-10-19T14:39:00.000Z';

describe('formatCaptureReply', () => {
  it('Q.8: confirms the civil date, priority, tags and list', () => {
    const text = formatCaptureReply({
      title: 'Recoger a Markus del cole',
      dueDate: '2026-10-20T14:00:00.000Z',
      isAllDay: false,
      priority: 'high',
      tags: ['cole'],
      listName: 'Bandeja de entrada',
      timeZone: 'Europe/Madrid',
      now: NOW,
    });
    expect(text).toBe(
      'Guardada: Recoger a Markus del cole.\n📅 Mañana, 16:00 · Prioridad alta · #cole · Bandeja de entrada',
    );
  });

  it('Q.8: an all-day date has no clock, and a missing date omits the date', () => {
    expect(
      formatCaptureReply({
        title: 'Paquete',
        dueDate: '2026-10-25T23:00:00.000Z',
        isAllDay: true,
        priority: 'none',
        tags: [],
        listName: 'Bandeja de entrada',
        timeZone: 'Europe/Madrid',
        now: NOW,
      }),
    ).toBe('Guardada: Paquete.\n📅 Lun 26 oct (todo el día) · Bandeja de entrada');
    expect(
      formatCaptureReply({
        title: 'Velas',
        dueDate: null,
        isAllDay: false,
        priority: 'none',
        tags: [],
        listName: 'Bandeja de entrada',
        timeZone: 'Europe/Madrid',
        now: NOW,
        lead: 'Guardada con foto',
      }),
    ).toBe('Guardada con foto: Velas.\n📅 Bandeja de entrada');
  });
});
