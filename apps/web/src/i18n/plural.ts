export function pluralMessage(
  locale: string,
  count: number,
  forms: { readonly one: string; readonly other: string },
): string {
  return forms[new Intl.PluralRules(locale).select(count) === 'one' ? 'one' : 'other'].replace(
    '{count}',
    new Intl.NumberFormat(locale).format(count),
  );
}
