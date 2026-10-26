import { useAppLocale } from '../../i18n/locale';
export const es = {
  calWeekShort: 'Sem',
  calendarTimed: 'Con hora',
  calendarAddToDay: 'Añadir tarea a este día',
  calendarEmptyDay: 'No hay tareas ni eventos para este día',
  calendarFilterDone: 'Listo',
  calendarFilterTitle: 'Filtrar calendario',
  calendarSourcesCount: 'Fuentes seleccionadas',
  calendarOverflowTitle: 'Elementos del día',
};
export const en = {
  calWeekShort: 'Wk',
  calendarTimed: 'Timed',
  calendarAddToDay: 'Add a task to this day',
  calendarEmptyDay: 'No tasks or events for this day',
  calendarFilterDone: 'Done',
  calendarFilterTitle: 'Filter calendar',
  calendarSourcesCount: 'Selected sources',
  calendarOverflowTitle: 'Day items',
};
export function useWtAMessages() {
  return useAppLocale().toLowerCase().startsWith('en') ? en : es;
}
