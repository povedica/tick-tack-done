import { instantFromWall, type ContextSnapshot } from '@reflexionia/domain';

/** Map the app view to the closed Python contract without inventing missing sources. */
export function pythonContext(snapshot: ContextSnapshot): Record<string, unknown> {
  let calendar: unknown = null;
  if (snapshot.calendar !== null && snapshot.workday !== null) {
    const parts = new Intl.DateTimeFormat('en', {
      timeZone: snapshot.time_zone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    }).formatToParts(new Date(snapshot.issued_at));
    const part = (name: string) => Number(parts.find((item) => item.type === name)?.value);
    const civil = (value: string) => {
      const match = /^(\d{2}):(\d{2})$/.exec(value);
      return match === null
        ? null
        : instantFromWall(
            {
              year: part('year'),
              month: part('month'),
              day: part('day'),
              hour: Number(match[1]),
              minute: Number(match[2]),
              second: 0,
            },
            snapshot.time_zone,
          );
    };
    const start = civil(snapshot.workday.start);
    const end = civil(snapshot.workday.end);
    if (start !== null && end !== null && end > start && snapshot.calendar.busy.length <= 200) {
      calendar = { work: { start, end }, busy: snapshot.calendar.busy };
    }
  }
  return {
    version: 1,
    authority_version: snapshot.authority_version,
    source_revision: snapshot.source_revision,
    issued_at: snapshot.issued_at,
    expires_at: snapshot.expires_at,
    timezone: snapshot.time_zone,
    calendar,
    review: null,
    task_energy: snapshot.task_energy,
    duration_observations: snapshot.duration_observations,
  };
}
