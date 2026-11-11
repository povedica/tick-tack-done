const formats = new Map<string, Intl.DateTimeFormat>();

/** One Intl.DateTimeFormat per locale and options. Calendar views must use this instead of constructing their own. */
export function dateTimeFormat(
  locale: string,
  options?: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const key = `${locale}\0${stableOptions(options)}`;
  const cached = formats.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const created = new Intl.DateTimeFormat(locale, options);
  formats.set(key, created);
  return created;
}

function stableOptions(options: Intl.DateTimeFormatOptions | undefined): string {
  if (options === undefined) {
    return '';
  }
  const entries = Object.entries(options)
    .filter((entry) => entry[1] !== undefined)
    .sort((left, right) => left[0].localeCompare(right[0]));
  return JSON.stringify(entries);
}
