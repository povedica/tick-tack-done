export const PROJECT_DRAG_MIME = 'application/x-tick-project';
export const TASK_DRAG_MIME = 'application/x-tick-task';

/** A column accepts a project card and ignores a task card from the list kanban. */
export function acceptsProjectDrag(types: readonly string[]): boolean {
  return types.includes(PROJECT_DRAG_MIME);
}

export function readProjectDrag(transfer: DataTransfer): string {
  return transfer.getData(PROJECT_DRAG_MIME);
}

export function writeProjectDrag(transfer: DataTransfer, id: string): void {
  transfer.setData(PROJECT_DRAG_MIME, id);
  transfer.effectAllowed = 'move';
}

/** Native drag image. The source card stays behind as the dashed gap. */
export function liftDragImage(event: {
  currentTarget: EventTarget;
  dataTransfer: DataTransfer;
  nativeEvent: { offsetX: number; offsetY: number };
}): () => void {
  const source = event.currentTarget;
  if (!(source instanceof HTMLElement) || typeof document === 'undefined') {
    return () => undefined;
  }
  const reduced =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clone = source.cloneNode(true) as HTMLElement;
  clone.classList.remove('is-dragging');
  clone.classList.add('is-lifted');
  clone.style.position = 'fixed';
  clone.style.top = '-1000px';
  clone.style.left = '0';
  clone.style.width = `${String(source.offsetWidth)}px`;
  clone.style.pointerEvents = 'none';
  if (!reduced) {
    clone.style.transform = 'rotate(-1.5deg)';
    clone.style.boxShadow = 'var(--shadow-lg)';
  }
  document.body.appendChild(clone);
  event.dataTransfer.setDragImage(clone, event.nativeEvent.offsetX, event.nativeEvent.offsetY);
  return () => {
    clone.remove();
  };
}
