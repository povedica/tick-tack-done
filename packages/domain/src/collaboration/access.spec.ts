import { describe, expect, it } from 'vitest';
import {
  allows,
  canDo,
  collaborationAction,
  parseMentions,
  type CollaborationAction,
  type ShareRole,
} from './access';

const ROLES: readonly ShareRole[] = ['owner', 'write', 'comment', 'read'];

const MATRIX: Readonly<Record<CollaborationAction, readonly ShareRole[]>> = {
  view: ['owner', 'write', 'comment', 'read'],
  comment: ['owner', 'write', 'comment'],
  edit_task: ['owner', 'write'],
  trash_task: ['owner', 'write'],
  assign: ['owner', 'write'],
  move_task: ['owner', 'write'],
  read_tags: ['owner', 'write'],
  write_tags: ['owner'],
  manage_list: ['owner'],
  manage_members: ['owner'],
  leave: ['write', 'comment', 'read'],
};

describe('collaboration access', () => {
  it('RF-1801: write includes comment and read', () => {
    expect(allows('write', 'comment')).toBe(true);
    expect(allows('write', 'read')).toBe(true);
    expect(allows('comment', 'write')).toBe(false);
    expect(allows('read', 'comment')).toBe(false);
  });

  it('RF-1801: the role matrix matches every action', () => {
    const actions = Object.keys(MATRIX) as CollaborationAction[];
    for (const action of actions) {
      for (const role of ROLES) {
        expect(canDo(role, action)).toBe(MATRIX[action].includes(role));
      }
    }
  });

  it('RF-1801: a member can leave and the owner cannot', () => {
    expect(canDo('read', 'leave')).toBe(true);
    expect(canDo('owner', 'leave')).toBe(false);
    expect(canDo('comment', 'manage_members')).toBe(false);
    expect(canDo('write', 'manage_list')).toBe(false);
  });

  it('maps coarse share actions onto the matrix', () => {
    expect(collaborationAction('read')).toBe('view');
    expect(collaborationAction('comment')).toBe('comment');
    expect(collaborationAction('write')).toBe('edit_task');
  });

  it('RF-1803: mentions are unique lowercase tokens', () => {
    expect(parseMentions('Hola @Ana y @ana, cc @bob.s')).toEqual(['ana', 'bob.s']);
  });
});
