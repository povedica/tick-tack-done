import { describe, expect, it } from 'vitest';
import { renderDailyDigest } from './daily-digest.js';

const origin = 'https://todo.reflexionia.com';
const fireAt = '2026-11-25T06:00:00.000Z';
const zone = 'Europe/Madrid';

const tasks = [
  {
    id: 't_overdue',
    title: 'Revisar presupuesto #review',
    dueDate: '2026-11-24T08:00:00.000Z',
    isAllDay: false,
    timeZone: zone,
    priority: 'high' as const,
    listName: 'Trabajo',
    tags: [{ name: 'review' }],
  },
  {
    id: 't_day',
    title: 'Cumpleaños #familia',
    dueDate: '2026-11-24T23:00:00.000Z',
    isAllDay: true,
    timeZone: zone,
    priority: 'none' as const,
    listName: 'Personal',
    tags: [{ name: 'familia' }],
  },
  {
    id: 't_time',
    title: 'Daily <equipo> #reunión #extra',
    dueDate: '2026-11-25T08:30:00.000Z',
    isAllDay: false,
    timeZone: zone,
    listName: 'Trabajo',
    tags: [{ name: 'reunión' }],
  },
  {
    id: 't_range',
    title: 'Preparar demo',
    dueDate: '2026-11-25T10:30:00.000Z',
    startDate: '2026-11-25T09:00:00.000Z',
    isAllDay: false,
    timeZone: zone,
    priority: 'low' as const,
    listName: 'Trabajo',
    tags: [{ name: 'foco' }],
  },
];

describe('daily digest mail', () => {
  it('renders sections, chips, a capped remainder and counters', () => {
    const extra = Array.from({ length: 18 }, (_, index) => ({
      id: `t_more_${String(index)}`,
      title: `Tarea ${String(index)}`,
      dueDate: '2026-11-25T15:00:00.000Z',
      isAllDay: false,
      timeZone: zone,
    }));
    const rendered = renderDailyDigest({
      locale: 'es',
      fireAt,
      timeZone: zone,
      tasks: [...tasks, ...extra],
      loadLine: 'Hoy: 4 tareas (~2 h) + 30 min de agenda, de 8 h de jornada.',
      reminderTime: '7:00',
      origin,
    });
    const { mail } = rendered;
    expect(mail.subject).toBe('Planifica tu día: 21 para hoy, 1 vencida');
    expect(mail.html).toContain('miércoles, 25 de noviembre');
    expect(mail.html).toContain('Vencidas');
    expect(mail.html).toContain('Hoy');
    expect(mail.html).toContain('Revisar presupuesto');
    expect(mail.html).not.toContain('#review');
    expect(mail.html).toContain('>review<');
    expect(mail.html).toContain('#extra');
    expect(mail.html).toContain('&lt;equipo&gt;');
    expect(mail.html).not.toContain('<equipo>');
    expect(mail.html).toContain('Todo el día');
    expect(mail.html).toContain('10:00 – 11:30');
    expect(mail.html).toContain(`${origin}/task/t_overdue`);
    expect(mail.html).toContain('y 2 más en Hoy');
    expect(mail.html).toContain(`${origin}/today`);
    expect(mail.html).toContain('bgcolor="#3e60cd"');
    expect(mail.html).toContain('v:roundrect');
    expect(mail.html).toContain('a las 07:00');
    expect(mail.text).toContain('y 2 más en Hoy');
    expect(mail.text).toContain(`${origin}/today`);
    expect(mail.text).toContain(`${origin}/task/t_overdue`);
    expect(mail.text).toContain(`${origin}/task/t_day`);
    expect(mail.text).toContain('Gestionar notificaciones');
    expect(mail.text).not.toContain('<html');
    expect(rendered.pushTitle).toBe('Planifica tu día');
    expect(rendered.pushBody).toContain('Vencidas');
    expect(rendered.pushBody).toContain('Revisar presupuesto #review');
    expect(rendered.pushBody).not.toContain('apple-touch-icon');
    expect(rendered.pushBody).not.toContain('y 2 más');
    expect(mail.html).toMatchSnapshot();
    expect(mail.text).toMatchSnapshot();
  });

  it('stays a single sentence when the morning is empty', () => {
    const { mail, pushBody } = renderDailyDigest({
      locale: 'es',
      fireAt,
      timeZone: zone,
      tasks: [],
      origin,
    });
    expect(mail.subject).toBe('Planifica tu día');
    expect(mail.html).toContain('No hay tareas con fecha para hoy.');
    expect(mail.html).not.toContain('Vencidas');
    expect(mail.html).not.toContain('más en Hoy');
    expect(pushBody).toBe('No hay tareas con fecha para hoy.');
    expect(mail.text).toContain('No hay tareas con fecha para hoy.');
  });

  it('translates the subject and the body', () => {
    const { mail } = renderDailyDigest({
      locale: 'en',
      fireAt,
      timeZone: zone,
      tasks: tasks.slice(0, 1),
      origin,
    });
    expect(mail.subject).toBe('Plan your day: 0 today, 1 overdue');
    expect(mail.html).toContain('Wednesday, 25 November');
    expect(mail.html).toContain('Overdue');
    expect(mail.html).toContain('Open Today');
    expect(mail.text).toContain('Manage notifications');
    expect(mail.text).toContain('Yesterday');
  });

  it('shows day and month once an overdue task is older than six days', () => {
    const { mail } = renderDailyDigest({
      locale: 'es',
      fireAt,
      timeZone: zone,
      origin,
      tasks: [
        {
          id: 'old',
          title: '#casa',
          dueDate: '2026-11-10T08:00:00.000Z',
          isAllDay: false,
          timeZone: zone,
          tags: [{ name: 'casa' }],
        },
        {
          id: 'blank',
          title: '   ',
          dueDate: '2026-11-24T08:00:00.000Z',
          isAllDay: false,
          timeZone: zone,
        },
      ],
    });
    expect(mail.html).toContain('10 nov');
    expect(mail.html).toContain('>#casa<');
    expect(mail.html).toContain('Sin título');
    expect(mail.text).toContain(`${origin}/task/old`);
    expect(mail.text).toContain(`${origin}/task/blank`);
  });
});
