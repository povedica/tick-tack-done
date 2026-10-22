import { fromZonedTime } from 'date-fns-tz';
/** Historical UTC-midnight captures encode a civil date, not an instant. */
export function repairAllDayUtc(value: string, timeZone: string): string | null {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(11) !== '00:00:00.000Z')
    return null;
  try {
    const repaired = fromZonedTime(`${date.toISOString().slice(0, 10)}T00:00:00`, timeZone);
    return Number.isFinite(repaired.getTime()) && repaired.getTime() !== date.getTime()
      ? repaired.toISOString()
      : null;
  } catch {
    return null;
  }
}
