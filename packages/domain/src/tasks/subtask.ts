export interface SubtaskProject {
  readonly ok: true;
  readonly projectId: string;
}

/**
 * RF-205: a subtask may live in a different list from its parent.
 * A missing parent, another owner's parent, or a cycle is rejected by the API, not here.
 */
export function resolveSubtaskProject(input: {
  readonly requestedProjectId: string;
  readonly parentProjectId: string | null;
}): SubtaskProject {
  return { ok: true, projectId: input.requestedProjectId };
}

const TITLE_MAX = 500;

export type TaskTitle = { readonly ok: true; readonly title: string } | { readonly ok: false };

/** Persists the title as received, including edge spaces. Empty is valid. Max 500 on the raw text. */
export function normalizeTaskTitle(title: string): TaskTitle {
  if (title.length > TITLE_MAX) {
    return { ok: false };
  }
  return { ok: true, title };
}
