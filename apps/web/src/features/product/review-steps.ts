export const REVIEW_STEP_IDS = ['inbox', 'overdue', 'undated', 'projects', 'prepare'] as const;
export type ReviewStepId = (typeof REVIEW_STEP_IDS)[number];

/** Projects sits between undated and prepare, and disappears without lists:read. */
export function reviewSteps(projectsScope: unknown): readonly ReviewStepId[] {
  if (projectsScope === 'missing') {
    return REVIEW_STEP_IDS.filter((id) => id !== 'projects');
  }
  return REVIEW_STEP_IDS;
}

export function reviewStepIndex(id: ReviewStepId, projectsScope: unknown): number {
  return reviewSteps(projectsScope).indexOf(id);
}
