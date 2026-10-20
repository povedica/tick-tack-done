import { useAppLocale } from '../../i18n/locale';
const es = {
  title: 'Tu semana',
  lead: 'Un balance de lo que pasó.',
  stats: 'Ver estadísticas',
  loading: 'Cargando reporte…',
  completed: 'Completadas',
  habits: 'Hábitos',
  focus: 'Foco',
  currentState: 'Estado actual, fuera del balance',
  byDay: 'Por día',
  legend: 'Completadas · Creadas',
  empty: 'No hay datos de esta semana. Actualiza para calcular la semana actual.',
  reviewTitle: 'Revisión semanal',
  reviewLead: 'Decide con calma cómo quieres continuar.',
  finishReview: 'Terminar revisión',
  reviewLoading: 'Cargando revisión…',
  inboxTitle: 'Vaciar la bandeja',
  inboxLead: 'Revisa tus capturas. Puedes continuar aunque queden tareas.',
  openInbox: 'Abrir bandeja →',
  prepareWeek: 'Preparar la semana',
  nextSeven: 'Ver próximos 7 días →',
  staleLists: 'Listas sin movimiento',
  atRisk: 'Hábitos en riesgo',
  closedWeek: 'Semana cerrada',
  unverified: 'Sin detalle diario verificable para esta semana.',
  noData: 'Sin datos',
  duringWeek: 'Durante la semana',
  unknownCalculation: 'Fecha de cálculo no disponible',
  reviewOverdue: 'Revisar vencidas',
  reviewUndated: 'Revisar sin fecha',
  noOverdue: 'No hay vencidas',
  noUndated: 'No hay tareas sin fecha',
  refreshError: 'No se pudo actualizar el reporte. Inténtalo de nuevo.',
  loadError: 'No se pudo cargar.',
  retry: 'Reintentar',
  week: 'Semana',
  refresh: 'Actualizar',
  refreshing: 'Actualizando…',
  continue: 'Continuar',
  inbox: 'Bandeja',
  overdue: 'Vencidas',
  undated: 'Sin fecha',
  done: '✓ Listo',
  today: '☀ Hoy',
  tomorrow: '→ Mañana',
  cancel: '⊘ No haré',
  recurring: 'Esta tarea se repite; ábrela para decidir sobre esta ocurrencia o la serie.',
  oldReport:
    'Informe anterior: el balance usa exclusivamente el detalle diario guardado. Hábitos sin corte verificable; comparación omitida.',
};
const en: typeof es = {
  title: 'Your week',
  lead: 'A look back at what happened.',
  stats: 'View statistics',
  loading: 'Loading report…',
  completed: 'Completed',
  habits: 'Habits',
  focus: 'Focus',
  currentState: 'Current state, outside the balance',
  byDay: 'By day',
  legend: 'Completed · Created',
  empty: 'No data for this week. Refresh to calculate the current week.',
  reviewTitle: 'Weekly review',
  reviewLead: 'Take your time to decide what comes next.',
  finishReview: 'Finish review',
  reviewLoading: 'Loading review…',
  inboxTitle: 'Clear your inbox',
  inboxLead: 'Review your captures. You can continue with tasks remaining.',
  openInbox: 'Open inbox →',
  prepareWeek: 'Prepare the week',
  nextSeven: 'View next 7 days →',
  staleLists: 'Lists without activity',
  atRisk: 'Habits at risk',
  closedWeek: 'Closed week',
  unverified: 'No verifiable daily detail for this week.',
  noData: 'No data',
  duringWeek: 'During the week',
  unknownCalculation: 'Calculation date unavailable',
  reviewOverdue: 'Review overdue tasks',
  reviewUndated: 'Review undated tasks',
  noOverdue: 'No overdue tasks',
  noUndated: 'No undated tasks',
  refreshError: 'Could not refresh the report. Try again.',
  loadError: 'Could not load.',
  retry: 'Retry',
  week: 'Week',
  refresh: 'Refresh',
  refreshing: 'Refreshing…',
  continue: 'Continue',
  inbox: 'Inbox',
  overdue: 'Overdue',
  undated: 'Undated',
  done: '✓ Done',
  today: '☀ Today',
  tomorrow: '→ Tomorrow',
  cancel: '⊘ Won’t do',
  recurring: 'This task repeats; open it to decide about this occurrence or the series.',
  oldReport:
    'Older report: the balance uses only saved daily details. Habits have no verifiable cutoff; comparison omitted.',
};
export function useWeeklyCopy() {
  const locale = useAppLocale();
  const english = locale.startsWith('en');
  const copy = english ? en : es;
  return {
    ...copy,
    locale,
    previousWeek: english ? 'Previous week' : 'Semana anterior',
    nextWeek: english ? 'Next week' : 'Semana siguiente',
    steps: english ? 'Review steps' : 'Pasos de revisión',
    actions: english ? 'Actions for selected tasks' : 'Acciones sobre tareas seleccionadas',
    until: (date: string) =>
      english ? `In progress · through ${date}` : `En curso · hasta el ${date}`,
    balance: (done: number, made: number) =>
      english
        ? `${String(done)} tasks completed and ${String(made)} created.`
        : `${String(done)} tareas completadas y ${String(made)} creadas.`,
    createdInWeek: (n: number) =>
      english ? `${String(n)} created this week` : `${String(n)} creadas esta semana`,
    habitCount: (done: number, expected: number) =>
      english ? `${String(done)} of ${String(expected)}` : `${String(done)} de ${String(expected)}`,
    through: (date: string) => (english ? `Through ${date}` : `Hasta el ${date}`),
    overdueNow: (n: number) =>
      english ? `Overdue now · ${String(n)}` : `Vencidas ahora · ${String(n)}`,
    calculated: (date: string) => (english ? `Calculated on ${date}` : `Calculado el ${date}`),
    confirm: (done: boolean, n: number) =>
      english
        ? `${done ? 'Complete' : 'Mark as won’t do'} ${String(n)} tasks?`
        : `${done ? 'Completar' : 'Marcar como «No haré»'} ${String(n)} tareas?`,
    result: (n: number, action: string) =>
      english
        ? `${String(n)} tasks ${action === 'done' ? 'completed' : action === 'cancel' ? 'marked as won’t do' : action === 'today' ? 'moved to Today' : 'moved to Tomorrow'}.`
        : `${String(n)} tareas ${action === 'done' ? 'completadas' : action === 'cancel' ? 'marcadas como «No haré»' : action === 'today' ? 'movidas a Hoy' : 'movidas a Mañana'}.`,
    failed: (n: number) =>
      english
        ? `${String(n)} tasks updated. Could not finish; retry the remaining tasks.`
        : `${String(n)} tareas actualizadas. No se pudo terminar; puedes reintentar las restantes.`,
    count: (n: number, selected: number) =>
      english
        ? `${String(n)} total · ${String(selected)} selected`
        : `${String(n)} en total · ${String(selected)} seleccionadas`,
    selected: (n: number) => (english ? `${String(n)} selected` : `${String(n)} seleccionadas`),
    select: (title: string) => (english ? `Select ${title}` : `Seleccionar ${title}`),
    daysAgo: (n: number) => (english ? `${String(n)} days ago` : `Hace ${String(n)} días`),
  };
}
