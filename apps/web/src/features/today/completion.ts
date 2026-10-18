export interface CompleteJob {
  phase: 'inflight' | 'done' | 'undo';
}

/** Undo during the request waits; undo after success must call uncomplete now. */
export function requestUndo(job: CompleteJob): 'defer' | 'now' {
  if (job.phase === 'inflight') {
    job.phase = 'undo';
    return 'defer';
  }
  if (job.phase === 'done') {
    job.phase = 'undo';
    return 'now';
  }
  return 'defer';
}

export async function settleComplete(
  job: CompleteJob,
  uncomplete: () => Promise<unknown>,
): Promise<'completed' | 'reverted'> {
  if (job.phase !== 'undo') {
    job.phase = 'done';
    return 'completed';
  }
  await uncomplete();
  return 'reverted';
}

export function pushUndo<T extends { readonly id: string }>(
  items: readonly T[],
  item: T,
): readonly T[] {
  return [...items.filter((current) => current.id !== item.id), item].slice(-3);
}
