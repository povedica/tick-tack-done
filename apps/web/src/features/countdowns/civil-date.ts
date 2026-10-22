/** Countdown dates are civil days; browser time zone must never shift them. */
export function formatCountdownDay(iso: string, locale: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [year, month, day] = iso.split('-');
  if (year === undefined || month === undefined || day === undefined) return '';
  return locale.toLowerCase().startsWith('en')
    ? `${month}/${day}/${year}`
    : `${day}/${month}/${year}`;
}

export function parseCountdownDay(text: string, locale: string): string | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim());
  if (!match) return null;
  const [, first, second, year] = match;
  if (first === undefined || second === undefined || year === undefined) return null;
  const month = locale.toLowerCase().startsWith('en') ? first : second;
  const day = locale.toLowerCase().startsWith('en') ? second : first;
  const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  const instant = new Date(`${iso}T12:00:00Z`);
  return Number(year) > 0 &&
    Number.isFinite(instant.getTime()) &&
    instant.toISOString().slice(0, 10) === iso
    ? iso
    : null;
}
