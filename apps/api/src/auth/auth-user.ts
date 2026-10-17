import type { CompleteChildrenPolicy } from '@reflexionia/domain';

export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly timeZone: string;
  readonly completeChildren: CompleteChildrenPolicy;
}

export interface EventActor {
  readonly ownerId: string;
  readonly actorId: string;
  readonly actorKind: 'user' | 'automation';
}

export function actorOf(user: AuthUser): EventActor {
  return { ownerId: user.id, actorId: user.id, actorKind: 'user' };
}
