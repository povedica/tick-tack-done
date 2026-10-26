import type { CompleteChildrenPolicy } from '@reflexionia/domain';

export interface AuthUser {
  readonly requestSource?: 'web' | 'api' | 'mcp' | 'automation' | 'plan';
  readonly id: string;
  readonly email: string;
  readonly timeZone: string;
  readonly completeChildren: CompleteChildrenPolicy;
  readonly scopes: readonly string[];
  readonly tokenId: string | null;
  readonly sessionId: string | null;
  /** null = unrestricted (session). PAT list allowlist when list-restricted. */
  readonly listIds: readonly string[] | null;
}

export interface EventActor {
  readonly requestSource?: 'web' | 'api' | 'mcp' | 'automation' | 'plan';
  readonly ownerId: string;
  readonly actorId: string;
  readonly actorKind: 'user' | 'api' | 'automation';
  /** Set when the caller is a PAT. Activity keeps the user id; the outbox actor id is the token. */
  readonly tokenId: string | null;
}

export function actorOf(user: AuthUser): EventActor {
  return {
    requestSource: requestSourceOf(user),
    ownerId: user.id,
    actorId: user.id,
    actorKind: user.tokenId === null ? 'user' : 'api',
    tokenId: user.tokenId,
  };
}

export function requestSourceOf(user: AuthUser): 'web' | 'api' | 'mcp' | 'automation' | 'plan' {
  return user.requestSource ?? (user.tokenId === null ? 'web' : 'api');
}
