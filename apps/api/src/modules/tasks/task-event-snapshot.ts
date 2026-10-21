interface SnapshotTask {
  activity?: unknown;
  items: readonly { id: string; status: string }[];
  subtasks: readonly { id: string; status: string; title: string }[];
  checklist_progress: { completed: number; total: number };
}

/**
 * TTD-AUD-65: event payloads must not embed task.activity (which itself embeds
 * previous event payloads). Keep a lean snapshot for outbox + activity_log.
 */
export function taskEventSnapshot(detail: SnapshotTask): Record<string, unknown> {
  const record = detail as SnapshotTask & Record<string, unknown>;
  const { items, subtasks, ...rest } = record;
  const summary: Record<string, unknown> = { ...rest };
  delete summary.activity;
  return {
    ...summary,
    items: items.map((item) => ({ id: item.id, status: item.status })),
    subtasks: subtasks.map((child) => ({
      id: child.id,
      status: child.status,
      title: child.title,
    })),
    checklist_progress: detail.checklist_progress,
    item_count: items.length,
    subtask_count: subtasks.length,
  };
}

/** Drop nested `activity` keys from stored JSON (migration + defensive reads). */
export function stripNestedActivity(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => stripNestedActivity(entry));
  }
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'activity') {
      continue;
    }
    out[key] = stripNestedActivity(child);
  }
  return out;
}
