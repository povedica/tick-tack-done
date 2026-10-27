export const LIST_MIME = 'application/x-tick-list';

export function setListDrag(data: DataTransfer, id: string): void {
  data.setData(LIST_MIME, id);
  data.effectAllowed = 'move';
}

export function listDragId(data: DataTransfer): string | null {
  const id = data.getData(LIST_MIME);
  return id.length > 0 ? id : null;
}

export function dragHasList(data: DataTransfer): boolean {
  return data.types.includes(LIST_MIME);
}
