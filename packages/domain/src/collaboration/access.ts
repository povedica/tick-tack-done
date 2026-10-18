/** RF-1801. Write includes comment and read. Comment includes read. */

export type SharePermission = 'read' | 'comment' | 'write';

export type ShareAction = 'read' | 'comment' | 'write';

const RANK: Readonly<Record<SharePermission, number>> = {
  read: 1,
  comment: 2,
  write: 3,
};

export function allows(permission: SharePermission, action: ShareAction): boolean {
  return RANK[permission] >= RANK[action];
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
