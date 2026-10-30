/** RF-1801. Write includes comment and read. Comment includes read. */

export type SharePermission = 'read' | 'comment' | 'write';

export type ShareAction = 'read' | 'comment' | 'write';

/** Owner or an accepted member permission. RF-1801. */
export type ShareRole = 'owner' | SharePermission;

/**
 * RF-1801. Actions a person can take on a shared list.
 * Tags of a shared task stay with the list owner (`write_tags` is owner-only).
 */
export type CollaborationAction =
  | 'view'
  | 'comment'
  | 'edit_task'
  | 'trash_task'
  | 'assign'
  | 'move_task'
  | 'read_tags'
  | 'write_tags'
  | 'manage_list'
  | 'manage_members'
  | 'leave';

const RANK: Readonly<Record<SharePermission, number>> = {
  read: 1,
  comment: 2,
  write: 3,
};

const ALLOWED: Readonly<Record<CollaborationAction, readonly ShareRole[]>> = {
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

export function allows(permission: SharePermission, action: ShareAction): boolean {
  return RANK[permission] >= RANK[action];
}

/** RF-1801. Pure permission matrix for a list role. */
export function canDo(role: ShareRole, action: CollaborationAction): boolean {
  return ALLOWED[action].includes(role);
}

/** Maps the coarse share action used by older callers onto the matrix. */
export function collaborationAction(action: ShareAction): CollaborationAction {
  if (action === 'read') {
    return 'view';
  }
  if (action === 'comment') {
    return 'comment';
  }
  return 'edit_task';
}

/** RF-1803. Mentions are `@display` tokens. The caller resolves them to members. */
export function parseMentions(body: string): readonly string[] {
  const found = new Set<string>();
  for (const match of body.matchAll(/(^|\s)@([a-zA-Z0-9._-]{1,40})/g)) {
    const name = match[2];
    if (name !== undefined) {
      found.add(name.toLowerCase());
    }
  }
  return [...found];
}
