/** Event prefix to the scope a PAT needs. Prefixes absent here are hidden from tokens (S-16). */
const PREFIX_SCOPE: Readonly<Record<string, string>> = {
  task: 'tasks:read',
  checklist_item: 'tasks:read',
  reminder: 'tasks:read',
  comment: 'tasks:read',
  import: 'tasks:read',
  matrix: 'tasks:read',
  drive: 'tasks:read',
  project: 'lists:read',
  folder: 'lists:read',
  column: 'lists:read',
  presence: 'lists:read',
  tag: 'tags:read',
  filter: 'filters:read',
  smart_list: 'filters:read',
  habit: 'habits:read',
  countdown: 'countdowns:read',
  focus: 'focus:read',
  note: 'notes:read',
  sticky_note: 'notes:read',
  calendar: 'calendar:read',
  webhook: 'webhooks:manage',
  automation: 'automations:manage',
  plugin: 'profile:read',
  dashboard: 'profile:read',
  achievement: 'profile:read',
  report: 'profile:read',
  stats: 'stats:read',
};

export function eventVisibleToCaller(
  type: string,
  scopes: readonly string[],
  isPat: boolean,
): boolean {
  if (!isPat) {
    return true;
  }
  const prefix = type.split('.')[0] ?? '';
  const required = PREFIX_SCOPE[prefix];
  return required !== undefined && scopes.includes(required);
}

/** Keeps the scope filter and the cursor as siblings under AND. Two OR keys in one object overwrite each other (S-22). */
export function syncAndFilters(
  typeFilter: { OR?: readonly { type: { startsWith: string } }[] },
  cursorFilter: { OR: readonly Record<string, unknown>[] } | null,
): readonly Record<string, unknown>[] {
  return [
    ...(typeFilter.OR === undefined ? [] : [typeFilter]),
    ...(cursorFilter === null ? [] : [cursorFilter]),
  ];
}

export function patEventPrefixes(scopes: readonly string[]): string[] {
  return Object.entries(PREFIX_SCOPE)
    .filter(([, scope]) => scopes.includes(scope))
    .map(([prefix]) => `${prefix}.`);
}
