import { shiftDayKey, zonedWallTime } from '../today/groups';
export function agendaPageRange(origin: string, page: number, timeZone: string) {
  const startOffset = page === 0 ? -30 : page > 0 ? 31 + (page - 1) * 30 : -30 + page * 30;
  const endOffset = page === 0 ? 31 : page > 0 ? 31 + page * 30 : -30 + (page + 1) * 30;
  const startDay = shiftDayKey(origin, startOffset);
  const endDay = shiftDayKey(origin, endOffset);
  const from = zonedWallTime(startDay, 0, 0, timeZone);
  const to = zonedWallTime(endDay, 0, 0, timeZone);
  if (!from || !to) throw new Error('Invalid agenda date range');
  return { startDay, endDay, from, to };
}
