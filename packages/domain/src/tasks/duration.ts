export type DurationDerivation =
  | { readonly ok: true; readonly durationMinutes: number | null }
  | {
      readonly ok: false;
      readonly reason: 'invalid_date' | 'due_before_start' | 'duration_mismatch';
    };

/**
 * TTD-AUD-56: never silently replace an explicit duration with start→due span.
 * When both ends exist and an explicit value is set, they must agree (≤24h window)
 * or the call fails; beyond 24h the span is when/deadline and explicit wins.
 */
export function deriveDurationMinutes(input: {
  readonly startDate: string | null;
  readonly dueDate: string | null;
  readonly explicit: number | null;
}): DurationDerivation {
  if (input.startDate === null || input.dueDate === null) {
    return { ok: true, durationMinutes: input.explicit };
  }
  const start = Date.parse(input.startDate);
  const due = Date.parse(input.dueDate);
  if (Number.isNaN(start) || Number.isNaN(due)) {
    return { ok: false, reason: 'invalid_date' };
  }
  if (due < start) {
    return { ok: false, reason: 'due_before_start' };
  }
  const span = Math.round((due - start) / 60_000);
  // When and deadline can be days apart. Only a same-day block still implies duration.
  if (span > 24 * 60) {
    return { ok: true, durationMinutes: input.explicit };
  }
  if (input.explicit !== null && input.explicit !== span) {
    return { ok: false, reason: 'duration_mismatch' };
  }
  return { ok: true, durationMinutes: input.explicit ?? span };
}


/** RF-602: elapsed minutes on the UTC timeline, preserving DST wall-time resolution at capture. */
export function endFromDuration(start: string | null, minutes: number | null): string | null {
  if (start === null || minutes === null || !Number.isInteger(minutes) || minutes < 0 || minutes > 1440 || !Number.isFinite(Date.parse(start))) return null;
  return new Date(Date.parse(start) + minutes * 60_000).toISOString();
}
