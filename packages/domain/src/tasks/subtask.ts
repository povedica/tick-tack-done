export type SubtaskProject =
  | { readonly ok: true; readonly projectId: string }
  | { readonly ok: false; readonly reason: 'project_mismatch' };

/** RF-205: a subtask inherits its parent's list and is not filed elsewhere. */
export function resolveSubtaskProject(input: {
  readonly requestedProjectId: string;
  readonly parentProjectId: string | null;
}): SubtaskProject {
  if (input.parentProjectId === null) {
    return { ok: true, projectId: input.requestedProjectId };
  }
  if (input.requestedProjectId !== input.parentProjectId) {
    return { ok: false, reason: 'project_mismatch' };
  }
  return { ok: true, projectId: input.parentProjectId };
}

const TITLE_MAX = 500;

export type TaskTitle = { readonly ok: true; readonly title: string } | { readonly ok: false };

export function normalizeTaskTitle(title: string): TaskTitle {
  const trimmed = title.trim();
  if (trimmed.length === 0 || trimmed.length > TITLE_MAX) {
    return { ok: false };
  }
  return { ok: true, title: trimmed };
}
