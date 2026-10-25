import { instantFromWall } from '../dates/zoned';
export interface BusyInterval {
  readonly id: string;
  readonly start: string;
  readonly end: string;
  readonly title?: string;
}
export function snap15(minutes: number): number {
  return Math.round(minutes / 15) * 15;
}
export function freeSlots(input: {
  readonly date: string;
  readonly timeZone: string;
  readonly duration: number;
  readonly workDayStart: string | null;
  readonly workDayEnd: string | null;
  readonly eveningStart?: string;
  readonly eveningOnly?: boolean;
  readonly busy: readonly BusyInterval[];
}): readonly string[] {
  if (
    input.workDayStart === null ||
    input.workDayEnd === null ||
    input.duration < 5 ||
    input.duration > 480
  )
    return [];
  const clock = (s: string) => {
    const [h, m] = s.split(':').map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  };
  const lower =
    input.eveningOnly && input.eveningStart ? clock(input.eveningStart) : clock(input.workDayStart);
  const upper =
    !input.eveningOnly && input.eveningStart
      ? Math.min(clock(input.workDayEnd), clock(input.eveningStart))
      : clock(input.workDayEnd);
  const [year, month, day] = input.date.split('-').map(Number);
  const result: string[] = [];
  for (let minute = Math.ceil(lower / 15) * 15; minute + input.duration <= upper; minute += 15) {
    const start = instantFromWall(
      {
        year: year ?? 0,
        month: month ?? 1,
        day: day ?? 1,
        hour: Math.floor(minute / 60),
        minute: minute % 60,
        second: 0,
      },
      input.timeZone,
    );
    if (!start) continue;
    const a = Date.parse(start),
      b = a + input.duration * 60000;
    if (input.busy.some((event) => a < Date.parse(event.end) && b > Date.parse(event.start)))
      continue;
    result.push(
      `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`,
    );
  }
  return result;
}
