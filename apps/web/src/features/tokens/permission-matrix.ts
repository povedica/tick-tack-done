import type { Messages } from '../../i18n';
import { GROUPS, type Scope } from './scopes';

export interface PermissionRow {
  readonly id: string;
  readonly label: keyof Messages;
  readonly read: Scope | null;
  readonly write: Scope | null;
}

/** One row per area already offered when creating a token. No new API scopes. */
export const PERMISSION_ROWS: readonly PermissionRow[] = GROUPS.map((group) => ({
  id: group.name,
  label: group.name,
  read: group.choices.find((choice) => choice.id.endsWith(':read'))?.id ?? null,
  write:
    group.choices.find((choice) => choice.id.endsWith(':write') || choice.id.endsWith(':manage'))
      ?.id ?? null,
}));

export type SwitchValue = boolean | 'mixed';
export type PermissionPreset = 'none' | 'tasks' | 'read' | 'full';

const TASKS_PRESET = ['tasks:read', 'tasks:write'] as const satisfies readonly Scope[];

export function grantFullAccess(): Scope[] {
  return PERMISSION_ROWS.flatMap((row) =>
    [row.read, row.write].filter((scope): scope is Scope => scope !== null),
  );
}

export function presetScopes(preset: PermissionPreset): Scope[] {
  if (preset === 'none') return [];
  if (preset === 'tasks') return [...TASKS_PRESET];
  if (preset === 'read') {
    return PERMISSION_ROWS.flatMap((row) => (row.read === null ? [] : [row.read]));
  }
  return grantFullAccess();
}

export function sameScopes(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const granted = new Set(left);
  return right.every((scope) => granted.has(scope));
}

export function matchingPreset(scopes: readonly string[]): PermissionPreset | null {
  if (sameScopes(scopes, presetScopes('none'))) return 'none';
  if (sameScopes(scopes, presetScopes('tasks'))) return 'tasks';
  if (sameScopes(scopes, presetScopes('read'))) return 'read';
  if (sameScopes(scopes, presetScopes('full'))) return 'full';
  return null;
}

export function columnState(scopes: readonly string[], column: 'read' | 'write'): SwitchValue {
  const available = PERMISSION_ROWS.flatMap((row) => {
    const scope = row[column];
    return scope === null ? [] : [scope];
  });
  const on = available.filter((scope) => scopes.includes(scope)).length;
  if (on === 0) return false;
  if (on === available.length) return true;
  return 'mixed';
}

export function cellOn(scopes: readonly string[], scope: Scope | null): boolean {
  return scope !== null && scopes.includes(scope);
}

function ordered(selected: ReadonlySet<string>): Scope[] {
  return grantFullAccess().filter((scope) => selected.has(scope));
}

/** Write adds the area's read scope explicitly: the API checks scopes one by one. */
export function toggleRow(
  scopes: readonly Scope[],
  row: PermissionRow,
  column: 'read' | 'write',
): Scope[] {
  const scope = row[column];
  if (scope === null) return [...scopes];
  const next = new Set<string>(scopes);
  const turningOn = !next.has(scope);
  if (column === 'write') {
    if (turningOn) {
      next.add(scope);
      if (row.read !== null) next.add(row.read);
    } else {
      next.delete(scope);
    }
  } else if (turningOn) {
    next.add(scope);
  } else {
    next.delete(scope);
    if (row.write !== null && !row.write.endsWith(':manage')) next.delete(row.write);
  }
  return ordered(next);
}

/**
 * The write switch on «all sections» grants every current scope (full access).
 * Turning the read column off also clears writes that depend on read.
 */
export function setColumn(
  scopes: readonly Scope[],
  column: 'read' | 'write',
  on: boolean,
): Scope[] {
  if (column === 'write' && on) return grantFullAccess();
  const next = new Set<string>(scopes);
  for (const row of PERMISSION_ROWS) {
    const scope = row[column];
    if (scope === null) continue;
    if (on) {
      next.add(scope);
    } else {
      next.delete(scope);
      if (column === 'read' && row.write !== null && !row.write.endsWith(':manage')) {
        next.delete(row.write);
      }
    }
  }
  return ordered(next);
}

export function activeAreaCount(scopes: readonly string[]): number {
  return PERMISSION_ROWS.filter((row) => cellOn(scopes, row.read) || cellOn(scopes, row.write))
    .length;
}

export function permissionCountLabel(scopes: readonly string[], messages: Messages): string {
  return messages.tokenPermCount
    .replace('{n}', String(activeAreaCount(scopes)))
    .replace('{m}', String(PERMISSION_ROWS.length));
}

export interface PermissionSummary {
  readonly empty: string | null;
  readonly lead: string;
  readonly clauses: readonly string[];
}

function areaName(messages: Messages, label: keyof Messages): string {
  const text = messages[label];
  if (text.length === 0) return text;
  return text.charAt(0).toLocaleLowerCase() + text.slice(1);
}

function joinList(items: readonly string[], and: string): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0] ?? '';
  const tail = items[items.length - 1] ?? '';
  return `${items.slice(0, -1).join(', ')} ${and} ${tail}`;
}

export function describePermissions(
  scopes: readonly string[],
  messages: Messages,
): PermissionSummary {
  if (scopes.length === 0) {
    return { empty: messages.tokenPermSummaryEmpty, lead: '', clauses: [] };
  }
  if (sameScopes(scopes, grantFullAccess())) {
    return {
      empty: null,
      lead: messages.tokenPermSummaryLead,
      clauses: [messages.tokenPermSummaryEverything],
    };
  }
  const writes: string[] = [];
  const manages: string[] = [];
  const reads: string[] = [];
  for (const row of PERMISSION_ROWS) {
    const name = areaName(messages, row.label);
    const writeOn = cellOn(scopes, row.write);
    if (writeOn && row.write?.endsWith(':manage') === true) {
      manages.push(name);
    } else if (writeOn) {
      writes.push(name);
    } else if (cellOn(scopes, row.read)) {
      reads.push(name);
    }
  }
  const clauses: string[] = [];
  if (writes.length > 0) {
    clauses.push(`${messages.tokenPermVerbWrite} ${joinList(writes, messages.tokenPermAnd)}`);
  }
  if (manages.length > 0) {
    clauses.push(`${messages.tokenPermVerbManage} ${joinList(manages, messages.tokenPermAnd)}`);
  }
  if (reads.length > 0) {
    clauses.push(`${messages.tokenPermVerbRead} ${joinList(reads, messages.tokenPermAnd)}`);
  }
  return { empty: null, lead: messages.tokenPermSummaryLead, clauses };
}
