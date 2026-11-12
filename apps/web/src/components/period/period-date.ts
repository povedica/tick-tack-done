export function formatPeriodDate(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

export function formatMonthYear(date: Date, locale: string, length: 'short' | 'long'): string {
  return new Intl.DateTimeFormat(locale, {
    month: length,
    year: 'numeric',
  }).format(date);
}
