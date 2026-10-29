/** Shift+F10 and the Menu key open the filter actions. */
export function isFilterMenuShortcut(event: {
  readonly key: string;
  readonly shiftKey: boolean;
}): boolean {
  return event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey);
}
