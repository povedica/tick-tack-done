import type { CreateTokenBody } from '@reflexionia/sdk';
import type { Messages } from '../../i18n';

export type Scope = CreateTokenBody['scopes'][number];

interface ScopeChoice {
  readonly id: Scope;
  readonly label: keyof Messages;
}

interface ScopeGroup {
  readonly name: keyof Messages;
  readonly choices: readonly ScopeChoice[];
}

export const GROUPS: readonly ScopeGroup[] = [
  {
    name: 'tokenGroupTasks',
    choices: [
      { id: 'tasks:read', label: 'scopeRead' },
      { id: 'tasks:write', label: 'scopeWrite' },
    ],
  },
  {
    name: 'tokenGroupLists',
    choices: [
      { id: 'lists:read', label: 'scopeRead' },
      { id: 'lists:write', label: 'scopeWrite' },
    ],
  },
  {
    name: 'tokenGroupTags',
    choices: [
      { id: 'tags:read', label: 'scopeRead' },
      { id: 'tags:write', label: 'scopeWrite' },
    ],
  },
  {
    name: 'tokenGroupFilters',
    choices: [
      { id: 'filters:read', label: 'scopeRead' },
      { id: 'filters:write', label: 'scopeWrite' },
    ],
  },
  {
    name: 'tokenGroupHabits',
    choices: [
      { id: 'habits:read', label: 'scopeRead' },
      { id: 'habits:write', label: 'scopeWrite' },
    ],
  },
  {
    name: 'navCountdowns',
    choices: [
      { id: 'countdowns:read', label: 'scopeRead' },
      { id: 'countdowns:write', label: 'scopeWrite' },
    ],
  },
  {
    name: 'tokenGroupFocus',
    choices: [
      { id: 'focus:read', label: 'scopeRead' },
      { id: 'focus:write', label: 'scopeWrite' },
    ],
  },
  {
    name: 'tokenGroupNotes',
    choices: [
      { id: 'notes:read', label: 'scopeRead' },
      { id: 'notes:write', label: 'scopeWrite' },
    ],
  },
  {
    name: 'tokenGroupCalendar',
    choices: [
      { id: 'calendar:read', label: 'scopeRead' },
      { id: 'calendar:write', label: 'scopeWrite' },
    ],
  },
  {
    name: 'tokenGroupReminders',
    choices: [{ id: 'reminders:write', label: 'scopeWrite' }],
  },
  {
    name: 'tokenGroupWebhooks',
    choices: [{ id: 'webhooks:manage', label: 'scopeManage' }],
  },
  {
    name: 'tokenGroupAutomations',
    choices: [{ id: 'automations:manage', label: 'scopeManage' }],
  },
  {
    name: 'tokenGroupProfile',
    choices: [
      { id: 'profile:read', label: 'scopeRead' },
      { id: 'profile:write', label: 'scopeWrite' },
    ],
  },
  {
    name: 'tokenGroupStats',
    choices: [{ id: 'stats:read', label: 'scopeRead' }],
  },
  {
    name: 'tokenGroupBackup',
    choices: [{ id: 'backup:read', label: 'scopeRead' }],
  },
];

/** TOK-1: one line per resource instead of a chip wall. */
export function groupedScopes(
  scopes: readonly string[],
  messages: Messages,
): readonly { readonly resource: string; readonly access: string }[] {
  const unique = [...new Set(scopes)];
  const byResource = new Map<
    string,
    { read: boolean; write: boolean; manage: boolean; other: string[] }
  >();
  for (const scope of unique) {
    const parts = scope.split(':');
    const verb = parts.pop() ?? '';
    const resource = parts.join(':');
    const row = byResource.get(resource) ?? { read: false, write: false, manage: false, other: [] };
    if (verb === 'read') {
      row.read = true;
    } else if (verb === 'manage') {
      row.manage = true;
    } else if (verb === 'write') {
      row.write = true;
    } else if (verb.length > 0) {
      row.other.push(scopeAction(messages, verb));
    } else {
      row.other.push(scopeAction(messages, verb));
    }
    byResource.set(resource, row);
  }
  return [...byResource.entries()].map(([resource, access]) => {
    const parts: string[] = [];
    if (access.read && access.write) {
      parts.push(messages.tokenAccessReadWrite);
    } else if (access.read) {
      parts.push(messages.tokenAccessRead);
    } else if (access.write) {
      parts.push(messages.tokenAccessWrite);
    }
    if (access.manage) parts.push(messages.scopeManage);
    parts.push(...access.other);
    return {
      resource: resourceLabel(messages, resource),
      access: parts.join(' · ') || messages.tokenAccessRead,
    };
  });
}

function resourceLabel(messages: Messages, resource: string): string {
  switch (resource) {
    case 'countdowns':
      return messages.navCountdowns;
    case 'stats':
      return messages.navStatistics;
    case 'notifications:self':
      return messages.scopeNotifications;
    case 'ticky:proposals':
      return messages.scopeTickyProposals;
    case 'ticky:routines':
      return messages.scopeTickyRoutines;
    case 'tasks':
      return messages.tokenGroupTasks;
    case 'lists':
      return messages.tokenGroupLists;
    case 'tags':
      return messages.tokenGroupTags;
    case 'filters':
      return messages.tokenGroupFilters;
    case 'habits':
      return messages.tokenGroupHabits;
    case 'focus':
      return messages.tokenGroupFocus;
    case 'notes':
      return messages.tokenGroupNotes;
    case 'calendar':
      return messages.tokenGroupCalendar;
    case 'reminders':
      return messages.tokenGroupReminders;
    case 'webhooks':
      return messages.tokenGroupWebhooks;
    case 'automations':
      return messages.tokenGroupAutomations;
    case 'profile':
      return messages.tokenGroupProfile;
    case 'backup':
      return messages.tokenGroupBackup;
    default:
      return resource;
  }
}

function scopeAction(messages: Messages, verb: string): string {
  switch (verb) {
    case 'create':
      return messages.scopeCreateAction;
    case 'update':
      return messages.scopeUpdateAction;
    case 'complete':
      return messages.scopeCompleteAction;
    case 'trash':
      return messages.scopeTrashAction;
    case 'start':
      return messages.scopeStartAction;
    case 'stop':
      return messages.scopeStopAction;
    default:
      return verb;
  }
}

export function isSensitiveScope(scope: string): boolean {
  return ['webhooks:manage', 'automations:manage', 'profile:write'].includes(scope);
}

export function defaultConsentScopes(scopes: readonly string[]): string[] {
  return scopes.filter((scope) => !isSensitiveScope(scope));
}

export function scopeLabel(scope: string, messages: Messages): string {
  const row = groupedScopes([scope], messages)[0];
  return row === undefined ? messages.tokenScopes : `${row.resource} · ${row.access}`;
}
