/** Read scopes the Python reader accepts. Write scopes never travel on this credential. */
export const TICKY_READ_SCOPES = ['tasks:read', 'lists:read'] as const;

export const TICKY_FINE_SCOPES = [
  'tasks:create',
  'tasks:update',
  'tasks:complete',
  'tasks:trash',
  'focus:start',
  'focus:stop',
  'notifications:self:write',
  'ticky:proposals:read',
  'ticky:proposals:write',
  'ticky:routines:read',
  'ticky:routines:write',
] as const;

const FINE = new Set<string>(TICKY_FINE_SCOPES);

/** tasks:write does not imply a Ticky action scope. */
export function legacyGrantsTickyScope(granted: readonly string[], scope: string): boolean {
  return granted.includes(scope) && FINE.has(scope);
}

export interface ReadCapabilities {
  readonly contract_version: 'ticky-read-v1';
  readonly owner_id: string;
  readonly list_ids: readonly string[];
  readonly scopes: readonly string[];
  readonly server_resource_filtering: true;
}

export function readCapabilities(input: {
  readonly ownerId: string;
  readonly listIds: readonly string[];
  readonly scopes: readonly string[];
}): ReadCapabilities {
  const scopes = input.scopes.filter((scope) =>
    (TICKY_READ_SCOPES as readonly string[]).includes(scope),
  );
  return {
    contract_version: 'ticky-read-v1',
    owner_id: input.ownerId,
    list_ids: [...new Set(input.listIds)],
    scopes,
    server_resource_filtering: true,
  };
}

/** Own lists only. Shared memberships stay out until that decision is explicit. */
export function intersectOwnedLists(
  ownedListIds: readonly string[],
  requested: readonly string[],
): string[] {
  const owned = new Set(ownedListIds);
  return [...new Set(requested.filter((id) => owned.has(id)))];
}

const NONE = '00000000-0000-0000-0000-000000000000';

export function projectConstraint(
  listIds: readonly string[] | null,
  requested?: string,
): { projectId?: string | { in: string[] }; id?: string } {
  if (listIds === null) {
    return requested === undefined ? {} : { projectId: requested };
  }
  if (requested !== undefined) {
    return listIds.includes(requested) ? { projectId: requested } : { id: NONE };
  }
  if (listIds.length === 0) {
    return { id: NONE };
  }
  return { projectId: { in: [...listIds] } };
}

export function listVisible(listIds: readonly string[] | null, projectId: string): boolean {
  return listIds === null || listIds.includes(projectId);
}
