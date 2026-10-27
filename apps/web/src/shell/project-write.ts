import type { NamedWrite, Project } from '@reflexionia/sdk';
import { api } from '../api';

/** The API accepts reorder fields. The SDK method type does not list them yet. */
export type ProjectWrite = Partial<NamedWrite> & {
  readonly default_reminder_trigger?: string | null;
  readonly before_id?: string | null;
  readonly move_to_end?: boolean;
};

export function patchProject(id: string, body: ProjectWrite): Promise<Project> {
  return api.updateProject(id, body);
}

export function sameName(left: string, right: string): boolean {
  return left.localeCompare(right, undefined, { sensitivity: 'accent' }) === 0;
}

/** A shared list owned by someone else cannot move folders: W1 answers 404. */
export function canMoveList(
  project: { readonly is_inbox: boolean },
  viewerId: string | undefined,
): boolean {
  if (project.is_inbox) {
    return false;
  }
  const owner = (project as { readonly owner_id?: unknown }).owner_id;
  if (typeof owner !== 'string' || viewerId === undefined) {
    return true;
  }
  return owner === viewerId;
}
