export const SHORTCUT_ROWS = [
  ['N', 'fab'],
  ['?', 'shortcutsTitle'],
  ['Ctrl/Cmd+K', 'paletteTitle'],
  ['/', 'searchTitle'],
  ['Esc', 'close'],
  ['.', 'syncNow'],
  ['[', 'collapseSidebar'],
  ['G T', 'navToday'],
  ['G I', 'navInbox'],
  ['G C', 'navCalendar'],
  ['G M', 'navMatrix'],
  ['G S', 'navSettings'],
  ['G A', 'smartAll'],
  ['G B', 'smartTrash'],
  ['G N', 'navSearch'],
  ['G R', 'smartNext7'],
  ['G W', 'navReview'],
  ['↑/↓', 'openDetail'],
  ['Enter', 'openDetail'],
  ['Space', 'completeLabel'],
  ['P', 'prioritySet'],
  ['D', 'dateSet'],
  ['Delete', 'batchDelete'],
  ['X', 'selectTask'],
] as const;

export function isSidebarShortcut(input: {
  readonly key: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly typing: boolean;
}): boolean {
  return input.key === '[' && !input.metaKey && !input.ctrlKey && !input.altKey && !input.typing;
}

export function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT')
  );
}
