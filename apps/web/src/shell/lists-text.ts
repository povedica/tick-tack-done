import { pluralMessage } from '../i18n/plural';
import { useAppLocale } from '../i18n/locale';

const es = {
  addLabel: 'Añadir',
  edit: 'Editar',
  editListTitle: 'Editar lista',
  markProject: 'Marcar como proyecto',
  unmarkProject: 'Quitar de proyectos',
  moveToFolder: 'Mover a carpeta',
  noFolder: 'Sin carpeta',
  newFolder: 'Nueva carpeta',
  newFolderInline: 'Nueva carpeta…',
  newListHere: 'Nueva lista aquí',
  share: 'Compartir',
  remove: 'Borrar',
  deleteFolder: 'Eliminar carpeta',
  unarchive: 'Desarchivar',
  folderDeleted: 'Carpeta «{name}» eliminada',
  folderDeleteOne: 'Su lista pasa a «Sin carpeta». No se borra ninguna tarea.',
  folderDeleteMany: 'Sus {count} listas pasan a «Sin carpeta». No se borra ninguna tarea.',
  newListTitle: 'Nueva lista',
  listName: 'Nombre',
  namePlaceholder: 'Nombre de la lista',
  folder: 'Carpeta',
  folderNamePlaceholder: 'Nombre de la carpeta',
  enterHint: 'Intro',
  colorOptional: 'Color · opcional',
  noColor: 'Sin color',
  view: 'Vista',
  viewList: 'Lista',
  viewBoard: 'Tablero',
  viewTimeline: 'Cronograma',
  isProject: 'Es un proyecto',
  isProjectHelp: 'Tiene un resultado y aparece en Proyectos.',
  outcome: 'Resultado · opcional',
  outcomeHelp: 'Una frase: qué significa «terminado». Se verá en Proyectos.',
  createList: 'Crear lista',
  save: 'Guardar',
  inFolder: 'En {name}',
  noActiveTasks: 'sin tareas activas',
  activeTaskOne: '{count} tarea activa',
  activeTaskMany: '{count} tareas activas',
  deleteImpactOne: 'Se eliminará {count} tarea.',
  deleteImpactMany: 'Se eliminarán {count} tareas.',
  back: 'Atrás',
} as const;

const en: Record<keyof typeof es, string> = {
  addLabel: 'Add',
  edit: 'Edit',
  editListTitle: 'Edit list',
  markProject: 'Mark as project',
  unmarkProject: 'Remove from projects',
  moveToFolder: 'Move to folder',
  noFolder: 'No folder',
  newFolder: 'New folder',
  newFolderInline: 'New folder…',
  newListHere: 'New list here',
  share: 'Share',
  remove: 'Delete',
  deleteFolder: 'Delete folder',
  unarchive: 'Unarchive',
  folderDeleted: 'Folder “{name}” deleted',
  folderDeleteOne: 'Its list moves to “No folder”. No task is deleted.',
  folderDeleteMany: 'Its {count} lists move to “No folder”. No task is deleted.',
  newListTitle: 'New list',
  listName: 'Name',
  namePlaceholder: 'List name',
  folder: 'Folder',
  folderNamePlaceholder: 'Folder name',
  enterHint: 'Enter',
  colorOptional: 'Color · optional',
  noColor: 'No color',
  view: 'View',
  viewList: 'List',
  viewBoard: 'Board',
  viewTimeline: 'Timeline',
  isProject: 'This is a project',
  isProjectHelp: 'It has an outcome and shows up in Projects.',
  outcome: 'Outcome · optional',
  outcomeHelp: 'One sentence: what “done” means. It will show in Projects.',
  createList: 'Create list',
  save: 'Save',
  inFolder: 'In {name}',
  noActiveTasks: 'no active tasks',
  activeTaskOne: '{count} active task',
  activeTaskMany: '{count} active tasks',
  deleteImpactOne: '{count} task will be deleted.',
  deleteImpactMany: '{count} tasks will be deleted.',
  back: 'Back',
};

export type ListsText = { readonly [K in keyof typeof es]: string };

export function useListsText(): {
  readonly text: ListsText;
  readonly folderDeleteHint: (count: number) => string | null;
  readonly activeTasks: (count: number) => string;
  readonly deleteImpact: (count: number) => string;
  readonly placeLine: (folderName: string | null, count: number) => string;
} {
  const locale = useAppLocale();
  const text = locale.startsWith('en') ? en : es;
  const activeTasks = (count: number): string => {
    if (count <= 0) {
      return text.noActiveTasks;
    }
    return pluralMessage(locale, count, {
      one: text.activeTaskOne,
      other: text.activeTaskMany,
    });
  };
  return {
    text,
    folderDeleteHint(count: number): string | null {
      if (count <= 0) {
        return null;
      }
      return pluralMessage(locale, count, {
        one: text.folderDeleteOne,
        other: text.folderDeleteMany,
      });
    },
    activeTasks,
    deleteImpact(count: number): string {
      return pluralMessage(locale, count, {
        one: text.deleteImpactOne,
        other: text.deleteImpactMany,
      });
    },
    placeLine(folderName: string | null, count: number): string {
      const place =
        folderName === null ? text.noFolder : text.inFolder.replace('{name}', folderName);
      return `${place} · ${activeTasks(count)}`;
    },
  };
}
