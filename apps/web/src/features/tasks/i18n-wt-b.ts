import { resolveLocale, useLocale } from '../../i18n/locale';

export const es = {
  kanbanColumnsNav: 'Columnas del tablero',
  kanbanMoveTo: 'Mover a…',
  kanbanEmpty: 'No hay tareas',
  linkOne: '{count} enlace',
  linkOther: '{count} enlaces',
};
export const en = {
  kanbanColumnsNav: 'Board columns',
  kanbanMoveTo: 'Move to…',
  kanbanEmpty: 'No tasks',
  linkOne: '{count} link',
  linkOther: '{count} links',
};

export function wtBMessagesFor(locale: string) {
  return locale.startsWith('en') ? en : es;
}
export function useWtBMessages() {
  return wtBMessagesFor(resolveLocale(useLocale((state) => state.choice)));
}
export function linkCountLabel(count: number, locale: string): string {
  const messages = wtBMessagesFor(locale);
  return (
    new Intl.PluralRules(locale).select(count) === 'one' ? messages.linkOne : messages.linkOther
  ).replace('{count}', String(count));
}
