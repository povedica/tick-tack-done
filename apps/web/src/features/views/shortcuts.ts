/** RF-1502. / opens the palette when not typing. Ctrl/Cmd+K opens it from anywhere. */
export function isPaletteShortcut(input: {
  readonly key: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly typing: boolean;
}): boolean {
  if (input.altKey) {
    return false;
  }
  if ((input.metaKey || input.ctrlKey) && input.key.toLowerCase() === 'k') {
    return true;
  }
  return !input.typing && !input.metaKey && !input.ctrlKey && input.key === '/';
}
