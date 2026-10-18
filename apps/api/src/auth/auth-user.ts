import type { CompleteChildrenPolicy } from '@reflexionia/domain';

export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly timeZone: string;
  readonly completeChildren: CompleteChildrenPolicy;
  readonly scopes: readonly string[];
  readonly tokenId: string | null;
  readonly sessionId: string | null;
}

export interface EventActor {
  readonly ownerId: string;
  readonly actorId: string;
  readonly actorKind: 'user' | 'api' | 'automation';
  /** Set when the caller is a PAT. Activity keeps the user id; the outbox actor id is the token. */
  readonly tokenId: string | null;
}

export function actorOf(user: AuthUser): EventActor {
  return {
    ownerId: user.id,
    actorId: user.id,
    actorKind: user.tokenId === null ? 'user' : 'api',
    tokenId: user.tokenId,
  };
}
