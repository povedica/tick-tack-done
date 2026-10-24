import { useAppLocale } from '../../i18n/locale';
export const es = {
  calWeekShort: 'Sem',
  calendarFilterDone: 'Listo',
  calendarFilterTitle: 'Filtrar calendario',
  calendarSourcesCount: 'Fuentes seleccionadas',
  calendarOverflowTitle: 'Elementos del día',
};
export const en = {
  calWeekShort: 'Wk',
  calendarFilterDone: 'Done',
  calendarFilterTitle: 'Filter calendar',
  calendarSourcesCount: 'Selected sources',
  calendarOverflowTitle: 'Day items',
};
export function useWtAMessages() {
  return useAppLocale().toLowerCase().startsWith('en') ? en : es;
}
