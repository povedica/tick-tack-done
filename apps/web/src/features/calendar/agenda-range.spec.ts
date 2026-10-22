import { expect, it } from 'vitest';
import { agendaPageRange } from './agenda-range';
it('TTD-AUD-98: first page is ±30 civil days; adjacent pages do not overlap, including DST', () => {
  const first = agendaPageRange('2026-10-22', 0, 'Europe/Madrid');
  const previous = agendaPageRange('2026-10-22', -1, 'Europe/Madrid');
  const next = agendaPageRange('2026-10-22', 1, 'Europe/Madrid');
  expect(first).toEqual({
    startDay: '2026-09-22',
    endDay: '2026-11-22',
    from: '2026-09-21T22:00:00.000Z',
    to: '2026-11-21T23:00:00.000Z',
  });
  expect(previous.to).toBe(first.from);
  expect(next.from).toBe(first.to);
  expect(agendaPageRange('2026-03-29', 0, 'Europe/Madrid').startDay).toBe('2026-02-27');
});
