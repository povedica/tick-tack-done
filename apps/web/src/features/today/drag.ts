export const TASK_MIME = 'application/x-tick-task';

export function setTaskDrag(data: DataTransfer, id: string): void {
  data.setData(TASK_MIME, id);
  data.setData('text/plain', id);
  data.effectAllowed = 'move';
}

export function taskDragId(data: DataTransfer): string | null {
  const id = data.getData(TASK_MIME);
  return id.length > 0 ? id : null;
}

export function dragHasTask(data: DataTransfer): boolean {
  return data.types.includes(TASK_MIME);
}
