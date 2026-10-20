/** RF-2102: transparent project context, never an automatic archive/delete decision. */
export interface GardenProjectInput {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly deletedAt: string | null;
  readonly closed: boolean;
  readonly isNote: boolean;
  readonly activeTasks: number;
  readonly created7d: number;
  readonly completed7d: number;
  readonly lastTaskActivity: string | null;
}
export function gardenProjectContext(projects: readonly GardenProjectInput[], nowIso: string) {
  const now = Date.parse(nowIso);
  const week = now - 7 * 86_400_000;
  const month = now - 30 * 86_400_000;
  const items = projects.map((project) => {
    const last = Math.max(
      Date.parse(project.createdAt),
      project.lastTaskActivity === null ? 0 : Date.parse(project.lastTaskActivity),
    );
    const state =
      project.deletedAt !== null
        ? 'deleted'
        : project.closed
          ? 'closed'
          : project.isNote
            ? 'notes'
            : Date.parse(project.createdAt) >= week
              ? 'new'
              : project.activeTasks === 0
                ? 'no_pending'
                : last < month
                  ? 'stale'
                  : 'active';
    return {
      id: project.id,
      name: project.name,
      state,
      active_tasks: project.activeTasks,
      created_7d: project.created7d,
      completed_7d: project.completed7d,
      created_at: project.createdAt,
      deleted_at: project.deletedAt,
      last_activity_at: project.lastTaskActivity,
      needs_review: state === 'stale' || state === 'no_pending',
    };
  });
  return {
    review_after_days: 30,
    created_7d: items.filter((item) => Date.parse(item.created_at) >= week).length,
    deleted_7d: items.filter(
      (item) => item.deleted_at !== null && Date.parse(item.deleted_at) >= week,
    ).length,
    open: items.filter((item) => item.state !== 'closed' && item.state !== 'deleted').length,
    needs_review: items.filter((item) => item.needs_review).length,
    items,
  };
}
