export type DurationDerivation =
  | { readonly ok: true; readonly durationMinutes: number | null }
  | { readonly ok: false; readonly reason: 'invalid_date' | 'due_before_start' };

/** When both instants exist, duration is the elapsed minutes. Time zones do not apply. */
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
  return { ok: true, durationMinutes: span };
}
