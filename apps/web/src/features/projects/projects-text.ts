import { useAppLocale } from '../../i18n/locale';

const es = {
  back: 'Jardín digital',
  backShort: 'Jardín',
  title: 'Proyectos',
  newProject: 'Nuevo proyecto',
  active: 'En marcha',
  paused: 'Pausados',
  archived: 'Archivados',
  showArchived: 'Ver archivados',
  hideArchived: 'Ocultar',
  dropPause: 'Soltar para pausar',
  dropResume: 'Soltar para reanudar',
  dropArchive: 'Soltar para archivar',
  dropArchiveHere: 'Suelta aquí para archivar',
  nothingActive: 'Nada en marcha',
  emptyTitle: 'Aún no tienes proyectos',
  emptyBody:
    'Un proyecto es una lista con un final claro. Marca una lista como proyecto desde su menú ⋯ o al crearla.',
  markList: 'Marcar una lista',
  newList: 'Nueva lista',
  searchList: 'Buscar lista',
  noLists: 'No hay listas abiertas',
  of: 'de',
  noNext: 'Sin próxima acción',
  created: 'creado',
  openList: 'Abrir lista',
  pause: 'Pausar',
  resume: 'Reanudar',
  archive: 'Archivar',
  unarchive: 'Desarchivar',
  remove: 'Quitar de proyectos',
  moveTo: 'Mover a…',
  delete: 'Eliminar…',
  menu: 'Acciones del proyecto',
  undo: 'Deshacer',
  viewAll: 'Ver todos',
  loading: 'Cargando…',
  retry: 'Reintentar',
  loadError: 'No se ha podido cargar.',
  permission: 'No tienes permiso para realizar esta acción.',
  cancel: 'Cancelar',
  deleteTitle: '¿Eliminar',
  deleteLead: 'Se borra el proyecto y todo lo que contiene:',
  deleteOutcome: 'El resultado y el historial del proyecto',
  deleteNote: 'No se puede deshacer. Si solo quieres quitarlo de la vista, déjalo archivado.',
  deleteMismatch: 'Ha cambiado el número de tareas. Revisa antes de eliminar.',
  inFlight: 'en marcha',
  noNextShort: 'sin próxima acción',
  inPause: 'en pausa',
  gardenEmpty: 'Aún no tienes proyectos',
} as const;

const en: Record<keyof typeof es, string> = {
  back: 'Digital garden',
  backShort: 'Garden',
  title: 'Projects',
  newProject: 'New project',
  active: 'In progress',
  paused: 'Paused',
  archived: 'Archived',
  showArchived: 'View archived',
  hideArchived: 'Hide',
  dropPause: 'Drop to pause',
  dropResume: 'Drop to resume',
  dropArchive: 'Drop to archive',
  dropArchiveHere: 'Drop here to archive',
  nothingActive: 'Nothing in progress',
  emptyTitle: 'You have no projects yet',
  emptyBody:
    'A project is a list with a clear end. Mark a list as a project from its ⋯ menu or when you create it.',
  markList: 'Mark a list',
  newList: 'New list',
  searchList: 'Search lists',
  noLists: 'No open lists',
  of: 'of',
  noNext: 'No next action',
  created: 'created',
  openList: 'Open list',
  pause: 'Pause',
  resume: 'Resume',
  archive: 'Archive',
  unarchive: 'Unarchive',
  remove: 'Remove from projects',
  moveTo: 'Move to…',
  delete: 'Delete…',
  menu: 'Project actions',
  undo: 'Undo',
  viewAll: 'View all',
  loading: 'Loading…',
  retry: 'Retry',
  loadError: 'Could not load.',
  permission: 'You do not have permission to do this.',
  cancel: 'Cancel',
  deleteTitle: 'Delete',
  deleteLead: 'This deletes the project and everything in it:',
  deleteOutcome: 'The outcome and the project history',
  deleteNote: 'This cannot be undone. If you only want it out of the way, leave it archived.',
  deleteMismatch: 'The number of tasks has changed. Review it before deleting.',
  inFlight: 'in progress',
  noNextShort: 'with no next action',
  inPause: 'paused',
  gardenEmpty: 'You have no projects yet',
};

export type ProjectsCopy = ReturnType<typeof useProjectsCopy>;

export function useProjectsCopy() {
  const locale = useAppLocale();
  const english = locale.toLowerCase().startsWith('en');
  const text = english ? en : es;
  return {
    ...text,
    locale,
    english,
    column: (label: string, count: number) => `${label} ${String(count)}`,
    pausedToast: (name: string) => (english ? `“${name}” paused` : `«${name}» en pausa`),
    resumedToast: (name: string) => (english ? `“${name}” resumed` : `«${name}» reanudado`),
    archivedToast: (name: string) => (english ? `“${name}” archived` : `«${name}» archivado`),
    removedToast: (name: string) =>
      english ? `“${name}” is no longer a project` : `«${name}» ya no es un proyecto`,
    listLine: (name: string) => (english ? `The “${name}” list` : `La lista «${name}»`),
    deleteHeading: (name: string) =>
      english ? `${text.deleteTitle} ${name}?` : `${text.deleteTitle} ${name}?`,
    summary: (active: number, missing: number, paused: number) => {
      const parts: string[] = [];
      if (active > 0) parts.push(`${String(active)} ${text.inFlight}`);
      if (missing > 0) parts.push(`${String(missing)} ${text.noNextShort}`);
      if (paused > 0) parts.push(`${String(paused)} ${text.inPause}`);
      return parts.join(' · ');
    },
  };
}

export function taskImpactLine(
  taskCount: number,
  completed: number,
  open: number,
  english: boolean,
): string {
  if (taskCount === 0) {
    return english ? 'It has no tasks' : 'No tiene tareas';
  }
  const parts: string[] = [];
  if (completed > 0) {
    parts.push(
      english
        ? `${String(completed)} completed`
        : completed === 1
          ? '1 completada'
          : `${String(completed)} completadas`,
    );
  }
  if (open > 0) {
    parts.push(
      english ? `${String(open)} open` : open === 1 ? '1 pendiente' : `${String(open)} pendientes`,
    );
  }
  const noun = english
    ? taskCount === 1
      ? 'Its 1 task'
      : `Its ${String(taskCount)} tasks`
    : taskCount === 1
      ? 'Su 1 tarea'
      : `Sus ${String(taskCount)} tareas`;
  return parts.length === 0 ? noun : `${noun} (${parts.join(', ')})`;
}

export function deleteButtonLabel(taskCount: number, english: boolean): string {
  if (taskCount === 0) {
    return english ? 'Delete list' : 'Eliminar lista';
  }
  if (taskCount === 1) {
    return english ? 'Delete list and 1 task' : 'Eliminar lista y 1 tarea';
  }
  return english
    ? `Delete list and ${String(taskCount)} tasks`
    : `Eliminar lista y ${String(taskCount)} tareas`;
}
