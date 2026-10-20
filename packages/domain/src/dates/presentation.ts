/** Human calendar dates; date-only values must not shift when the viewer travels. */
export function humanDate(value: string, locale = 'es-ES', timeZone = 'UTC'): string {
  const instant = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00Z` : value;
  const date = new Date(instant);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(locale, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone,
      }).format(date);
}
