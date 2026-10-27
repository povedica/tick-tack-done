import type { NamedWrite, Project } from '@reflexionia/sdk';
import { api } from '../api';

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

/** A shared list owned by someone else cannot move folders: the API answers 404. */
export function canMoveList(
  project: { readonly is_inbox: boolean; readonly owner_id?: string | null },
  viewerId: string | undefined,
): boolean {
  if (project.is_inbox) {
    return false;
  }
  if (typeof project.owner_id !== 'string' || viewerId === undefined) {
    return true;
  }
  return project.owner_id === viewerId;
}
