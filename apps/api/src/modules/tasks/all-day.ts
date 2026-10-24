import { civilDateKey } from '@reflexionia/domain';
import { fromZonedTime } from 'date-fns-tz';
/** RF-604: an all-day instant always denotes midnight in its capture zone. */
export function allDayMidnight(value: Date | null, timeZone: string): Date | null {
  if (value === null) return null;
  const day = civilDateKey(value.toISOString(), timeZone);
  return day === null ? value : fromZonedTime(`${day}T00:00:00`, timeZone);
}
