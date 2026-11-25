import { describe, expect, it } from 'vitest';
import { messagesFor } from '../../i18n';
import {
  PERMISSION_ROWS,
  activeAreaCount,
  columnState,
  describePermissions,
  grantFullAccess,
  matchingPreset,
  permissionCountLabel,
  presetScopes,
  setColumn,
  toggleRow,
} from './permission-matrix';
import { GROUPS } from './scopes';

const tasks = PERMISSION_ROWS[0];
const reminders = PERMISSION_ROWS.find((row) => row.write === 'reminders:write');
const webhooks = PERMISSION_ROWS.find((row) => row.write === 'webhooks:manage');
const stats = PERMISSION_ROWS.find((row) => row.read === 'stats:read');

describe('token permission matrix', () => {
  it('CA-01: offers exactly the scopes already shown for a personal token', () => {
    expect(PERMISSION_ROWS).toHaveLength(15);
    expect(grantFullAccess()).toEqual(
      GROUPS.flatMap((group) => group.choices.map((choice) => choice.id)),
    );
  });

  it('CA-02: turning write on adds the read scope because the API does not imply it', () => {
    expect(tasks).toBeDefined();
    if (tasks === undefined) return;
    expect(toggleRow([], tasks, 'write')).toEqual(['tasks:read', 'tasks:write']);
    expect(toggleRow(['tasks:read', 'tasks:write'], tasks, 'read')).toEqual([]);
  });

  it('does not invent a read scope for reminders or webhooks', () => {
    expect(reminders?.read).toBeNull();
    expect(webhooks?.read).toBeNull();
    expect(stats?.write).toBeNull();
    if (reminders === undefined || webhooks === undefined) return;
    expect(toggleRow([], reminders, 'write')).toEqual(['reminders:write']);
    expect(toggleRow([], webhooks, 'write')).toEqual(['webhooks:manage']);
  });

  it('CA-07: presets mark exactly the described scopes and full access is not the default', () => {
    expect(presetScopes('none')).toEqual([]);
    expect(matchingPreset([])).toBe('none');
    expect(presetScopes('tasks')).toEqual(['tasks:read', 'tasks:write']);
    expect(presetScopes('read')).toEqual([
      'tasks:read',
      'lists:read',
      'tags:read',
      'filters:read',
      'habits:read',
      'countdowns:read',
      'focus:read',
      'notes:read',
      'calendar:read',
      'profile:read',
      'stats:read',
      'backup:read',
    ]);
    expect(
      presetScopes('read').some((scope) => scope.endsWith(':write') || scope.endsWith(':manage')),
    ).toBe(false);
    expect(matchingPreset(presetScopes('full'))).toBe('full');
    expect(matchingPreset([])).not.toBe('full');
  });

  it('the all-sections write column grants every scope and the read column clears dependent writes', () => {
    expect(setColumn([], 'write', true)).toEqual(grantFullAccess());
    if (tasks === undefined) return;
    const withTasks = toggleRow([], tasks, 'write');
    expect(columnState(withTasks, 'read')).toBe('mixed');
    expect(columnState(withTasks, 'write')).toBe('mixed');
    expect(setColumn(grantFullAccess(), 'write', false)).not.toContain('tasks:write');
    expect(setColumn(grantFullAccess(), 'write', false)).toContain('tasks:read');
    expect(setColumn(['tasks:read', 'tasks:write', 'webhooks:manage'], 'read', false)).toEqual([
      'webhooks:manage',
    ]);
  });

  it('CA-02: the summary says create, edit and delete when tasks can be written', () => {
    const spanish = messagesFor('es');
    const english = messagesFor('en');
    const summary = describePermissions(
      ['tasks:read', 'tasks:write', 'lists:read', 'tags:read'],
      spanish,
    );
    expect(summary.clauses[0]).toBe('crear, editar y borrar tareas');
    expect(summary.clauses[1]).toBe('ver listas y etiquetas');
    expect(describePermissions(['tasks:write', 'tasks:read'], english).clauses[0]).toBe(
      'create, edit and delete tasks',
    );
    expect(describePermissions(grantFullAccess(), spanish).clauses).toEqual([
      'crear, editar y borrar todo en tu cuenta',
    ]);
    expect(describePermissions([], spanish).empty).toBe('Este token aún no tiene permisos.');
    expect(permissionCountLabel(['tasks:read', 'tasks:write'], spanish)).toBe('1 de 15 áreas');
    expect(activeAreaCount(presetScopes('read'))).toBe(12);
  });
});
