import { describe, expect, it } from 'vitest';
import { addCalendarDays, instantFromWall, wallClock } from '../dates/zoned';
import { parseQuickAdd } from './parse';

const NOW = '2026-10-17T10:00:00.000Z';
const ZONE = 'Europe/Madrid';

function parsed(text: string, language: 'es' | 'en' = 'es', now = NOW) {
  return parseQuickAdd(text, language, { now, timeZone: ZONE });
}

function localDue(dayOffset: number, hour: number, minute: number, now = NOW): string {
  const today = wallClock(now, ZONE);
  if (today === null) {
    throw new Error('clock');
  }
  const day = addCalendarDays(today, dayOffset);
  const instant = instantFromWall({ ...day, hour, minute, second: 0 }, ZONE);
  if (instant === null) {
    throw new Error('instant');
  }
  return instant;
}

describe('parseQuickAdd', () => {
  it('RF-102: mañana 18:00 is tomorrow at 18:00 in the capture zone', () => {
    const text = 'comprar leche mañana 18:00';
    const result = parsed(text);
    expect(text.slice(result.spans[0]?.start, result.spans[0]?.end)).toBe('mañana 18:00');
    expect(result.title).toBe('comprar leche');
    expect(result.due).toEqual({ date: localDue(1, 18, 0), isAllDay: false });
    expect(result.repeatRule).toBeNull();
  });

  it('RF-102: every weekday at 9am sets a weekday rule and 09:00', () => {
    const result = parsed('stand up every weekday at 9am', 'en');
    expect(result.title).toBe('stand up');
    expect(result.due?.isAllDay).toBe(false);
    expect(result.due?.date).toBe(localDue(2, 9, 0));
    expect(result.repeatRule).toContain('FREQ=WEEKLY');
    expect(result.repeatRule).toContain('BYDAY=MO,TU,WE,TH,FR');
  });

  it('RF-102: tomorrow 6pm keeps the same local hour in English', () => {
    const result = parsed('call mom tomorrow 6pm', 'en');
    expect(result.title).toBe('call mom');
    expect(result.due).toEqual({ date: localDue(1, 18, 0), isAllDay: false });
  });

  it('RF-102: a morning after the spring clock change keeps 18:00 local', () => {
    const now = '2026-03-28T22:30:00.000Z';
    const result = parsed('mañana 18:00', 'es', now);
    const plusOneDay = new Date(Date.parse(now) + 86_400_000).toISOString();
    expect(result.due?.date).toBe(localDue(1, 18, 0, now));
    expect(result.due?.date).not.toBe(plusOneDay);
    expect(result.due?.isAllDay).toBe(false);
  });

  it('RF-102: cada lunes repeats weekly and lands on Monday', () => {
    const result = parsed('gym cada lunes');
    const today = wallClock(NOW, ZONE);
    if (today === null) {
      throw new Error('clock');
    }
    const delta =
      (1 - new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay() + 7) % 7;
    expect(result.title).toBe('gym');
    expect(result.repeatRule).toBe('RRULE:FREQ=WEEKLY;BYDAY=MO');
    expect(result.due).toEqual({ date: localDue(delta, 0, 0), isAllDay: true });
    expect(result.spans[0]?.kind).toBe('date');
  });

  it('RF-102: every monday 18:00 is a timed weekly rule', () => {
    const result = parsed('every monday 18:00', 'en');
    expect(result.repeatRule).toBe('RRULE:FREQ=WEEKLY;BYDAY=MO');
    expect(result.due?.isAllDay).toBe(false);
    expect(result.title).toBe('');
  });

  it('RF-102: el 23/10 is an all-day date and rolls to next year once it has passed', () => {
    const upcoming = parsed('pagar el 23/10');
    expect(upcoming.title).toBe('pagar');
    expect(upcoming.due).toEqual({
      date: localDue(0, 0, 0, '2026-10-23T00:00:00.000Z'),
      isAllDay: true,
    });
    const passed = parsed('pagar el 23/10', 'es', '2026-12-01T10:00:00.000Z');
    expect(passed.due?.date).toBe(localDue(0, 0, 0, '2027-10-23T00:00:00.000Z'));
  });

  it('RF-102: an explicit year and an impossible day stay out of the title only when valid', () => {
    const dated = parsed('el 23/10/2028');
    expect(dated.due?.date).toBe(localDue(0, 0, 0, '2028-10-23T00:00:00.000Z'));
    const invalid = parsed('cita 31/02 y el 23/10');
    expect(invalid.title).toBe('cita 31/02 y');
    expect(invalid.due?.isAllDay).toBe(true);
  });

  it('RF-102: English on 10/23 reads month first and 23/10 stays day first', () => {
    const american = parsed('on 10/23', 'en');
    expect(american.due?.date).toBe(localDue(0, 0, 0, '2026-10-23T00:00:00.000Z'));
    const unambiguous = parsed('23/10', 'en');
    expect(unambiguous.due?.date).toBe(american.due?.date);
  });

  it('RF-102: 5 de octubre and Oct 23 name the same civil day', () => {
    const spanish = parsed('5 de octubre', 'es', '2026-10-01T10:00:00.000Z');
    const english = parsed('Oct 23', 'en', '2026-10-01T10:00:00.000Z');
    expect(spanish.due?.date).toBe(localDue(0, 0, 0, '2026-10-05T00:00:00.000Z'));
    expect(english.due?.date).toBe(localDue(0, 0, 0, '2026-10-23T00:00:00.000Z'));
  });

  it('RF-102: !alta !media !baja and p1–p3 map onto high medium low', () => {
    expect(parsed('a !alta').priority).toBe('high');
    expect(parsed('a !media').priority).toBe('medium');
    expect(parsed('a !baja').priority).toBe('low');
    expect(parsed('a !high', 'en').priority).toBe('high');
    expect(parsed('a !medium', 'en').priority).toBe('medium');
    expect(parsed('a !low', 'en').priority).toBe('low');
    expect(parsed('a p1').priority).toBe('high');
    expect(parsed('a p2').priority).toBe('medium');
    expect(parsed('a p3').priority).toBe('low');
    expect(parsed('step1').priority).toBeNull();
    expect(parsed('p1 luego !alta').priority).toBe('high');
  });

  it('RF-102: !1–!3, #tag and @lista leave a clean title', () => {
    const parsed = parseQuickAdd('Informe !1 #casa @trabajo', 'es');
    expect(parsed.priority).toBe('high');
    expect(parsed.tagNames).toEqual(['casa']);
    expect(parsed.listName).toBe('trabajo');
    expect(parsed.title).toBe('Informe');
    expect(parseQuickAdd('a !2', 'es').priority).toBe('medium');
    expect(parseQuickAdd('a !3', 'es').priority).toBe('low');
  });

  it('RF-102: #casa is a tag and both list sigils name the list', () => {
    const tagged = parsed('limpiar #casa');
    expect(tagged.tagNames).toEqual(['casa']);
    expect(tagged.title).toBe('limpiar');
    expect(tagged.spans[0]?.kind).toBe('tag');
    expect(parsed('informe ^trabajo').listName).toBe('trabajo');
    expect(parsed('informe ~trabajo').listName).toBe('trabajo');
    expect(parsed('informe ^casa ~trabajo').listName).toBe('trabajo');
  });

  it('RF-102: avísame 30 min antes becomes a relative iCalendar trigger', () => {
    const text = 'dentista mañana avísame 30 min antes';
    const result = parsed(text);
    const reminder = result.spans.find((span) => span.kind === 'reminder');
    expect(text.slice(reminder?.start, reminder?.end)).toBe('avísame 30 min antes');
    expect(result.reminderTrigger).toBe('TRIGGER:-PT30M');
    expect(parsed('remind me 2 hours before', 'en').reminderTrigger).toBe('TRIGGER:-PT2H');
    expect(parsed('avísame 1 día antes').reminderTrigger).toBe('TRIGGER:-P1D');
  });

  it('RF-102: a full capture keeps every span on the original offsets', () => {
    const text = 'comprar leche mañana 18:00 #casa !alta ^trabajo avísame 30 min antes';
    const result = parsed(text);
    expect(result.title).toBe('comprar leche');
    expect(result.priority).toBe('high');
    expect(result.tagNames).toEqual(['casa']);
    expect(result.listName).toBe('trabajo');
    expect(result.reminderTrigger).toBe('TRIGGER:-PT30M');
    expect(result.due?.isAllDay).toBe(false);
    for (const span of result.spans) {
      expect(text.slice(span.start, span.end).length).toBeGreaterThan(0);
    }
    expect(result.spans.map((span) => span.kind)).toEqual([
      'date',
      'tag',
      'priority',
      'list',
      'reminder',
    ]);
  });

  it('RF-102: without a valid clock the date stays in the title', () => {
    const result = parseQuickAdd('mañana 18:00 #casa', 'es', {
      now: 'not-a-date',
      timeZone: 'Europe/Madrid',
    });
    expect(result.title).toBe('mañana 18:00');
    expect(result.tagNames).toEqual(['casa']);
    expect(result.due).toBeNull();
    expect(parseQuickAdd('#casa', 'es').tagNames).toEqual(['casa']);
  });

  it('RF-103: an extra pattern is recognized and an invalid one is rejected', () => {
    const result = parseQuickAdd('llamar @casa', 'es', {
      now: NOW,
      timeZone: ZONE,
      patterns: [{ source: String.raw`@([\p{L}\p{N}_]+)`, kind: 'tag' }],
    });
    expect(result.tagNames).toEqual(['casa']);
    expect(result.title).toBe('llamar');
    expect(result.spans[0]?.kind).toBe('tag');
    expect(() =>
      parseQuickAdd('x', 'es', {
        now: NOW,
        timeZone: ZONE,
        patterns: [{ source: '(', kind: 'tag' }],
      }),
    ).toThrow(/invalid quick add pattern/);
  });

  it('RF-103: a plugin can supply a priority, a reminder trigger and a repeat rule', () => {
    const result = parseQuickAdd('turno !!urgente dentro RR', 'es', {
      now: NOW,
      timeZone: ZONE,
      patterns: [
        { source: '!!urgente', kind: 'priority', value: 'high' },
        { source: 'dentro', kind: 'reminder', value: 'TRIGGER:-PT15M' },
        { source: 'RR', kind: 'date', value: 'RRULE:FREQ=DAILY' },
      ],
    });
    expect(result.title).toBe('turno');
    expect(result.priority).toBe('high');
    expect(result.reminderTrigger).toBe('TRIGGER:-PT15M');
    expect(result.repeatRule).toBe('RRULE:FREQ=DAILY');
  });

  it('NT-03: a bare clock time is today, or tomorrow once that time has passed', () => {
    const later = parsed('recoger a mis hijos a las 15:35');
    expect(later.title).toBe('recoger a mis hijos');
    expect(later.due).toEqual({ date: localDue(0, 15, 35), isAllDay: false });
    const earlier = parsed('recoger a las 11:00');
    expect(earlier.due).toEqual({ date: localDue(1, 11, 0), isAllDay: false });
    const half = parsed('a las 3 y media');
    expect(half.title).toBe('y media');
    expect(half.due).toEqual({ date: localDue(1, 3, 0), isAllDay: false });
    expect(parsed('stand up 15:35').due?.isAllDay).toBe(false);
  });

  it('RF-102: cada día, cada mes and a las 9:00 build daily and monthly rules', () => {
    expect(parsed('cada día').repeatRule).toBe('RRULE:FREQ=DAILY');
    const monthly = parsed('cada mes a las 9:00');
    expect(monthly.repeatRule).toContain('FREQ=MONTHLY');
    expect(monthly.due?.isAllDay).toBe(false);
    expect(parsed('every year', 'en').repeatRule).toBe('RRULE:FREQ=YEARLY');
  });

  it('RF-102: relative days, 12-hour clocks and named months keep the civil time', () => {
    expect(parsed('hoy').due).toEqual({ date: localDue(0, 0, 0), isAllDay: true });
    expect(parsed('today', 'en').due?.isAllDay).toBe(true);
    expect(parsed('pasado mañana').due?.date).toBe(localDue(2, 0, 0));
    expect(parsed('day after tomorrow 12am', 'en').due?.date).toBe(localDue(2, 0, 0));
    expect(parsed('tomorrow 12pm', 'en').due?.date).toBe(localDue(1, 12, 0));
    expect(parsed('tomorrow at 6:05 pm', 'en').due?.date).toBe(localDue(1, 18, 5));
    expect(parsed('mañana a las 9:30').due?.date).toBe(localDue(1, 9, 30));
    expect(parsed('June 5th, 2028', 'en').due?.date).toBe(
      localDue(0, 0, 0, '2028-06-05T00:00:00.000Z'),
    );
    expect(parsed('todos los viernes').repeatRule).toBe('RRULE:FREQ=WEEKLY;BYDAY=FR');
    expect(parsed('cada semana').repeatRule).toBe('RRULE:FREQ=WEEKLY');
    expect(parsed('cada ano').repeatRule).toBe('RRULE:FREQ=YEARLY');
    expect(parsed('every month', 'en').repeatRule).toContain('FREQ=MONTHLY');
  });

  it('RF-102: invalid clocks, years and days stay in the title', () => {
    expect(parsed('mañana 18:99').due?.isAllDay).toBe(true);
    expect(parsed('mañana 25:00').title).toBe('25:00');
    expect(parsed('mañana 18:00x').title).toBe('18:00x');
    expect(parsed('tomorrow 13pm', 'en').due?.isAllDay).toBe(true);
    expect(parsed('el 23/10/1800').due).toBeNull();
    expect(parsed('el 1/1/1969').due).toBeNull();
    expect(parsed('el 29/02/2028').due?.date).toBe(localDue(0, 0, 0, '2028-02-29T00:00:00.000Z'));
    expect(parsed('el 29/02/2027').due).toBeNull();
    expect(parsed('31/13').due).toBeNull();
    expect(parsed('mayo').due).toBeNull();
    expect(parsed('June 31', 'en').due).toBeNull();
    expect(parsed('on 5/6', 'en').due?.date).toBe(localDue(0, 0, 0, '2027-05-06T00:00:00.000Z'));
    expect(parsed('el 5/6', 'en').due?.date).toBe(localDue(0, 0, 0, '2027-06-05T00:00:00.000Z'));
    expect(parsed('#casa #Casa').tagNames).toEqual(['casa']);
    expect(parsed('avísame 0 min antes').reminderTrigger).toBeNull();
    expect(parsed('avísame 1000 min antes').reminderTrigger).toBeNull();
    expect(parsed('avísame 30 minutos antes').reminderTrigger).toBe('TRIGGER:-PT30M');
    expect(parsed('remind me 1 day before', 'en').reminderTrigger).toBe('TRIGGER:-P1D');
    expect(parseQuickAdd('mañana', 'es', { now: NOW, timeZone: 'Mars/Base' }).due).toBeNull();
    expect(parsed('  comprar   #casa  ').title).toBe('comprar');
  });

  it('RF-103: plugin values that do not apply leave the text in place', () => {
    const context = { now: NOW, timeZone: ZONE };
    expect(() =>
      parseQuickAdd('x', 'es', { ...context, patterns: [{ source: '   ', kind: 'tag' }] }),
    ).toThrow(/invalid quick add pattern/);
    const iso = parseQuickAdd('turno cuando', 'es', {
      ...context,
      patterns: [{ source: 'cuando', kind: 'date', value: '2026-10-23T16:00:00.000Z' }],
    });
    expect(iso.due).toEqual({ date: '2026-10-23T16:00:00.000Z', isAllDay: false });
    expect(iso.title).toBe('turno');
    const skipped = parseQuickAdd('turno cuando regla ping !! lista:casa nota', 'es', {
      ...context,
      patterns: [
        { source: 'cuando', kind: 'date', value: 'nope' },
        { source: 'regla', kind: 'date', value: 'RRULE:NOPE' },
        { source: 'ping', kind: 'reminder', value: 'soon' },
        { source: '!!', kind: 'priority', value: 'urgent' },
        { source: 'lista:(\\w+)', kind: 'list' },
        { source: 'nota', kind: 'date' },
      ],
    });
    expect(skipped.title).toBe('turno cuando regla ping !!');
    expect(skipped.listName).toBe('casa');
    expect(skipped.due).toBeNull();
    const longer = parseQuickAdd('mañana por la tarde', 'es', {
      ...context,
      patterns: [{ source: 'mañana por la tarde', kind: 'tag', value: 'tarde' }],
    });
    expect(longer.tagNames).toEqual(['tarde']);
    expect(longer.due).toBeNull();
  });
});

const GOLDEN_NOW = '2026-10-19T14:39:00.000Z';

describe('parseQuickAdd golden capture (Q.9)', () => {
  function golden(text: string) {
    return parseQuickAdd(text, 'es', { now: GOLDEN_NOW, timeZone: ZONE });
  }

  const cases: readonly {
    text: string;
    title: string;
    due: string | null;
    allDay: boolean | null;
  }[] = [
    {
      text: 'Recoger mañana a Markus del cole a las 16:00 !high #cole',
      title: 'Recoger a Markus del cole',
      due: '2026-10-20T14:00:00.000Z',
      allDay: false,
    },
    {
      text: 'dentista mañana a las 9:30',
      title: 'dentista',
      due: '2026-10-20T07:30:00.000Z',
      allDay: false,
    },
    {
      text: 'llamar a Ana a las 18:00',
      title: 'llamar a Ana',
      due: '2026-10-19T16:00:00.000Z',
      allDay: false,
    },
    {
      text: 'llamar a Ana a las 9:00',
      title: 'llamar a Ana',
      due: '2026-10-20T07:00:00.000Z',
      allDay: false,
    },
    {
      text: 'el lunes recoger paquete',
      title: 'recoger paquete',
      due: '2026-10-25T23:00:00.000Z',
      allDay: true,
    },
    {
      text: 'el martes recoger paquete a las 10:00',
      title: 'recoger paquete',
      due: '2026-10-20T08:00:00.000Z',
      allDay: false,
    },
    {
      text: 'revisión en 2 horas',
      title: 'revisión',
      due: '2026-10-19T16:39:00.000Z',
      allDay: false,
    },
    {
      text: 'revisión dentro de 3 días',
      title: 'revisión',
      due: '2026-10-21T22:00:00.000Z',
      allDay: true,
    },
    {
      text: 'cita el 24/10 a las 12:30',
      title: 'cita',
      due: '2026-10-24T10:30:00.000Z',
      allDay: false,
    },
    {
      text: 'a las 4 de la tarde llamar al banco',
      title: 'llamar al banco',
      due: '2026-10-19T14:00:00.000Z',
      allDay: false,
    },
    {
      text: 'a las 3 de la tarde llamar',
      title: 'llamar',
      due: '2026-10-20T13:00:00.000Z',
      allDay: false,
    },
    {
      text: 'salir a correr pasado mañana a las 8',
      title: 'salir a correr',
      due: '2026-10-21T06:00:00.000Z',
      allDay: false,
    },
    {
      text: 'cita el 29/3/2026 a las 2:30',
      title: 'cita',
      due: '2026-03-29T01:30:00.000Z',
      allDay: false,
    },
    {
      text: 'cita el 25/10/2026 a las 2:30',
      title: 'cita',
      due: '2026-10-25T00:30:00.000Z',
      allDay: false,
    },
    { text: 'comprar 16 velas', title: 'comprar 16 velas', due: null, allDay: null },
    {
      text: 'mañana a las 9:30 y a las 18:00',
      title: 'y a las 18:00',
      due: '2026-10-20T07:30:00.000Z',
      allDay: false,
    },
    {
      text: 'cita a las 9 de la tarde',
      title: 'cita a las 9 de la tarde',
      due: null,
      allDay: null,
    },
  ];

  it.each(cases)('RF-102: $text', ({ text, title, due, allDay }) => {
    const result = golden(text);
    expect(result.title).toBe(title);
    if (due === null) {
      expect(result.due).toBeNull();
      return;
    }
    expect(result.due).toEqual({ date: due, isAllDay: allDay });
  });

  it('RF-102: the Markus capture keeps high priority and the cole tag', () => {
    const result = golden('Recoger mañana a Markus del cole a las 16:00 !high #cole');
    expect(result.priority).toBe('high');
    expect(result.tagNames).toEqual(['cole']);
  });

  it('RF-102: a bare number or a time glued to other tokens stays in the title', () => {
    expect(golden('x16:00').due).toBeNull();
    expect(golden('x16:00').title).toBe('x16:00');
    expect(golden('116:000').due).toBeNull();
    expect(golden('116:000').title).toBe('116:000');
  });
});
