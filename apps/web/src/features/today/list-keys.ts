export type ListCommand =
  | 'up'
  | 'down'
  | 'open'
  | 'complete'
  | 'priority'
  | 'date'
  | 'delete'
  | 'toggle-select';

export function listCommand(input: {
  readonly key: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
}): ListCommand | null {
  if (input.metaKey || input.ctrlKey || input.altKey) {
    return null;
  }
  switch (input.key) {
    case 'ArrowUp':
      return 'up';
    case 'ArrowDown':
      return 'down';
    case 'Enter':
      return 'open';
    case ' ':
      return 'complete';
    case 'p':
    case 'P':
      return 'priority';
    case 'd':
    case 'D':
      return 'date';
    case 'Delete':
      return 'delete';
    case 'x':
    case 'X':
      return 'toggle-select';
    default:
      return null;
  }
}
