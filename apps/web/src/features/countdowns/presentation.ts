import { messagesFor, type Messages } from '../../i18n';
import type { Countdown, CountdownKind, CountdownType } from './api';

export function typeLabels(messages: Messages): Record<CountdownType, string> {
  return {
    countdown: messages.countdownTypeCountdown,
    anniversary: messages.countdownTypeAnniversary,
    birthday: messages.countdownTypeBirthday,
    holiday: messages.countdownTypeHoliday,
  };
}

export function dateLabel(value: string, locale = 'es'): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
}

export function countdownLabel(
  kind: CountdownKind,
  days: number,
  effectiveDate: string,
  locale = 'es',
): string {
  const messages = messagesFor(locale);
  if (kind === 'today') return messages.countdownIsToday;
  const text = kind === 'until' ? messages.countdownRemaining : messages.countdownElapsed;
  return `${text.replace('{days}', String(days)).replace('{unit}', days === 1 ? messages.countdownDay : messages.countdownDays)} · ${dateLabel(effectiveDate, locale)}`;
}

export function countdownNumber(
  countdown: Pick<Countdown, 'kind' | 'days'>,
  locale = 'es',
): string {
  return countdown.kind === 'today'
    ? messagesFor(locale).countdownTodayShort
    : String(countdown.days);
}

export function groupCountdowns(
  items: readonly Countdown[],
): readonly (readonly [CountdownType, readonly Countdown[]])[] {
  return (Object.keys(typeLabels(messagesFor('es'))) as CountdownType[])
    .map((type) => [type, items.filter((item) => item.type === type)] as const)
    .filter(([, entries]) => entries.length > 0);
}
