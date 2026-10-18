const TEXT_FIELDS = new Set([
  'title',
  'content',
  'priority',
  'start_date',
  'due_date',
  'time_zone',
  'duration_minutes',
  'repeat_rule',
  'repeat_from',
  'is_all_day',
  'kind',
  'column_id',
  'tag_ids',
  'metadata',
]);

export interface MergeFieldClocksInput {
  readonly clocks: Readonly<Record<string, string>>;
  readonly fields: readonly string[];
  readonly patchClocks: Readonly<Record<string, string>>;
  readonly receivedAt: string;
  readonly operation: 'update' | 'complete' | 'delete';
}

export type MergeFieldClocksResult =
  | {
      readonly ok: true;
      readonly apply: readonly string[];
      readonly skipped: readonly string[];
      readonly clocks: Record<string, string>;
      readonly conflict: boolean;
    }
  | { readonly ok: false; readonly reason: 'invalid_clock' };

/** RF-13012. Per-field last-write-wins. Complete and delete win when they arrive later. */
export function mergeFieldClocks(input: MergeFieldClocksInput): MergeFieldClocksResult {
  if (parseInstant(input.receivedAt) === null) {
    return { ok: false, reason: 'invalid_clock' };
  }
  const clocks: Record<string, string> = { ...input.clocks };
  const terminal = latestInstant(clocks.status, clocks.completed_at, clocks.deleted_at);
  const apply: string[] = [];
  const skipped: string[] = [];
  const terminalOp = input.operation === 'complete' || input.operation === 'delete';

  for (const field of input.fields) {
    if (terminalOp) {
      apply.push(field);
      clocks[field] = input.receivedAt;
      continue;
    }
    const explicit = input.patchClocks[field];
    const incomingIso = explicit ?? input.receivedAt;
    const incoming = parseInstant(incomingIso);
    if (incoming === null) {
      return { ok: false, reason: 'invalid_clock' };
    }
    const stored = clocks[field];
    const storedMs = stored === undefined ? null : parseInstant(stored);
    if (storedMs !== null && incoming < storedMs) {
      skipped.push(field);
      continue;
    }
    if (TEXT_FIELDS.has(field) && terminal !== null && incoming <= terminal) {
      skipped.push(field);
      continue;
    }
    apply.push(field);
    clocks[field] = incomingIso;
  }

  return { ok: true, apply, skipped, clocks, conflict: skipped.length > 0 };
}

function parseInstant(value: string): number | null {
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

function latestInstant(...values: (string | undefined)[]): number | null {
  let latest: number | null = null;
  for (const value of values) {
    if (value === undefined) {
      continue;
    }
    const ms = parseInstant(value);
    if (ms !== null && (latest === null || ms > latest)) {
      latest = ms;
    }
  }
  return latest;
}
