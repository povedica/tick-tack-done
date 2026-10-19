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

export function patEventPrefixes(scopes: readonly string[]): string[] {
  return Object.entries(PREFIX_SCOPE)
    .filter(([, scope]) => scopes.includes(scope))
    .map(([prefix]) => `${prefix}.`);
}
