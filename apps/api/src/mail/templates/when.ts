import { civilDateKey, shiftCivilDate, wallClock } from '@reflexionia/domain';
import type { MailLocale } from './html.js';

const WEEKDAYS_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const WEEKDAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAYS_SHORT_ES = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const WEEKDAYS_SHORT_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];
const MONTHS_SHORT_ES = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];
const MONTHS_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const MONTHS_SHORT_EN = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export function clockLabel(iso: string, timeZone: string): string | null {
  const wall = wallClock(iso, timeZone);
  if (wall === null) {
    return null;
  }
  return `${pad(wall.hour)}:${pad(wall.minute)}`;
}

/** «miércoles, 25 de noviembre» / «Wednesday, 25 November». CSS uppercases the eyebrow. */
export function longDate(iso: string, timeZone: string, locale: MailLocale): string | null {
  const wall = wallClock(iso, timeZone);
  if (wall === null) {
    return null;
  }
  const index = weekdayIndex(wall.year, wall.month, wall.day);
  const weekday = locale === 'en' ? WEEKDAYS_EN[index] : WEEKDAYS_ES[index];
  const month = locale === 'en' ? MONTHS_EN[wall.month - 1] : MONTHS_ES[wall.month - 1];
  if (weekday === undefined || month === undefined) {
    return null;
  }
  return locale === 'en'
    ? `${weekday}, ${String(wall.day)} ${month}`
    : `${weekday}, ${String(wall.day)} de ${month}`;
}

/** «Lun 23» / «Mon 23». */
export function shortWeekday(iso: string, timeZone: string, locale: MailLocale): string | null {
  const wall = wallClock(iso, timeZone);
  if (wall === null) {
    return null;
  }
  const index = weekdayIndex(wall.year, wall.month, wall.day);
  const weekday = locale === 'en' ? WEEKDAYS_SHORT_EN[index] : WEEKDAYS_SHORT_ES[index];
  if (weekday === undefined) {
    return null;
  }
  const label = locale === 'en' ? weekday : capitalize(weekday);
  return `${label} ${String(wall.day)}`;
}

/** «25 nov» / «Nov 25». */
export function monthDay(iso: string, timeZone: string, locale: MailLocale): string | null {
  const wall = wallClock(iso, timeZone);
  if (wall === null) {
    return null;
  }
  const month = locale === 'en' ? MONTHS_SHORT_EN[wall.month - 1] : MONTHS_SHORT_ES[wall.month - 1];
  if (month === undefined) {
    return null;
  }
  return locale === 'en' ? `${month} ${String(wall.day)}` : `${String(wall.day)} ${month}`;
}

export function isSameLocalDay(left: string, right: string, timeZone: string): boolean {
  const leftDay = civilDateKey(left, timeZone);
  const rightDay = civilDateKey(right, timeZone);
  return leftDay !== null && leftDay === rightDay;
}

export function isLocalYesterday(dueIso: string, fireAt: string, timeZone: string): boolean {
  const dueDay = civilDateKey(dueIso, timeZone);
  const fireDay = civilDateKey(fireAt, timeZone);
  if (dueDay === null || fireDay === null) {
    return false;
  }
  return dueDay === shiftCivilDate(fireDay, -1);
}

export function reminderClock(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (match === null) {
    return null;
  }
  const hour = match[1];
  const minute = match[2];
  if (hour === undefined || minute === undefined) {
    return null;
  }
  const hours = Number(hour);
  const minutes = Number(minute);
  if (hours > 23 || minutes > 59) {
    return null;
  }
  return `${hour.padStart(2, '0')}:${minute}`;
}

function weekdayIndex(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function capitalize(value: string): string {
  return value.length === 0 ? value : `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
