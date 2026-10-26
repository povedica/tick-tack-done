import { useEffect, useRef } from 'react';
import { civilDateKey, formatMinutes, wallClock } from '@reflexionia/domain';
import { useWtFMessages } from '../i18n-wt-f';
import { useAppLocale } from '../../../i18n/locale';
import type { LoadDay, LoadRange } from '../api';
import { loadPhrase } from './projectPlan';
export function clockMinutes(value: string) {
  const [h, m] = value.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}
export function minuteClock(n: number) {
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
}
export function DayAgenda({
  day,
  range,
  ghost,
}: {
  readonly day: LoadDay;
  readonly range: LoadRange;
  readonly ghost?: {
    time: string;
    duration: number;
    title: string;
    conflict: string | null;
  } | null;
}) {
  const m = useWtFMessages(),
    locale = useAppLocale();
  const lower = 0,
    upper = 1440;
  const weekday = new Date(`${day.date}T12:00Z`).getUTCDay();
  const working =
    range.settings.work_days.includes(weekday) &&
    range.settings.work_day_start &&
    range.settings.work_day_end;
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = scroll.current;
    const timeline = node?.firstElementChild;
    if (node && timeline) node.scrollTop = (timeline.getBoundingClientRect().height * 8) / 24;
  }, [day.date]);
  const timed = day.tasks.filter(
    (t) =>
      !t.is_all_day &&
      t.start_date &&
      (civilDateKey(t.start_date, range.time_zone) === day.date ||
        (t.duration_minutes ?? 0) > 1440),
  );
  const untimed = day.tasks.filter((t) => !timed.includes(t));
  const blocks = [
    ...day.events
      .filter((e) => !e.is_all_day)
      .map((e) => ({ id: e.id, title: e.title, start: e.starts_at, end: e.ends_at, event: true })),
    ...timed.map((t) => ({
      id: t.id,
      title: t.title,
      start: t.start_date ?? '',
      end: new Date(
        Date.parse(t.start_date ?? '') +
          (t.duration_minutes ?? range.settings.default_task_duration) * 60000,
      ).toISOString(),
      event: false,
    })),
  ];
  const position = (start: string, end: string) => {
    const a = wallClock(start, range.time_zone),
      b = wallClock(end, range.time_zone);
    const from =
        (civilDateKey(start, range.time_zone) ?? day.date) < day.date
          ? lower
          : a
            ? a.hour * 60 + a.minute
            : lower,
      to =
        (civilDateKey(end, range.time_zone) ?? day.date) > day.date
          ? upper
          : b
            ? b.hour * 60 + b.minute
            : upper;
    return {
      top: `calc(${String((Math.max(lower, from) - lower) / 60)} * var(--plan-hour))`,
      height: `calc(${String(Math.max(15, Math.min(upper, to) - Math.max(lower, from)) / 60)} * var(--plan-hour))`,
    };
  };
  return (
    <section className="sp-agenda" aria-label={m.agenda}>
      <h2>
        {new Intl.DateTimeFormat(locale, {
          weekday: 'long',
          day: 'numeric',
          month: 'short',
          timeZone: 'UTC',
        }).format(new Date(`${day.date}T12:00Z`))}
      </h2>
      <p className={`sp-load is-${day.status === 'overload' ? 'over' : day.status}`}>
        <i />
        {loadPhrase(day, m)}
      </p>
      {working ? (
        <p className="plan-work-legend">
          <i />
          {m.workHours} · {range.settings.work_day_start}–{range.settings.work_day_end}
        </p>
      ) : null}
      <div
        className="plan-agenda-scroll"
        ref={scroll}
        tabIndex={0}
        role="region"
        aria-label={m.agenda}
      >
        <div
          className="sp-tl"
          data-plan-agenda={day.date}
          data-plan-start={lower}
          data-plan-end={upper}
          style={{ height: `calc(${String((upper - lower) / 60)} * var(--plan-hour))` }}
        >
          {Array.from({ length: Math.ceil((upper - lower) / 60) + 1 }, (_, i) => (
            <div key={i} className="sp-hr">
              <span>{i === 24 ? '00:00' : minuteClock(lower + i * 60)}</span>
            </div>
          ))}
          {working ? (
            <div
              className="plan-work-hours"
              aria-hidden="true"
              style={{
                top: `calc(${String(clockMinutes(range.settings.work_day_start ?? '09:00') / 60)} * var(--plan-hour))`,
                height: `calc(${String((clockMinutes(range.settings.work_day_end ?? '18:00') - clockMinutes(range.settings.work_day_start ?? '09:00')) / 60)} * var(--plan-hour))`,
              }}
            />
          ) : null}
          {blocks
            .filter(
              (b) =>
                b.start < b.end && (civilDateKey(b.end, range.time_zone) ?? day.date) >= day.date,
            )
            .map((b) => (
              <div
                key={b.id}
                className={`sp-blk is-${b.event ? 'event' : 'task'}`}
                style={position(b.start, b.end)}
              >
                <em>
                  {new Intl.DateTimeFormat(locale, {
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: range.time_zone,
                  }).format(new Date(b.start))}
                </em>
                <span>{b.title}</span>
              </div>
            ))}
          {ghost ? (
            <div
              className={`sp-blk is-ghost ${ghost.conflict ? 'is-conflict' : ''}`}
              style={{
                top: `calc(${String((clockMinutes(ghost.time) - lower) / 60)} * var(--plan-hour))`,
                height: `calc(${String(ghost.duration / 60)} * var(--plan-hour))`,
              }}
            >
              {ghost.conflict
                ? `${m.overlap} ${ghost.conflict}`
                : `${ghost.time} – ${minuteClock(clockMinutes(ghost.time) + ghost.duration)} · ${ghost.title}`}
            </div>
          ) : null}
        </div>
      </div>
      <p className="sp-untimed">
        {m.untimed} {untimed.length} {m.tasks} ·{' '}
        {formatMinutes(
          untimed.reduce(
            (n, t) => n + (t.duration_minutes ?? range.settings.default_task_duration),
            0,
          ),
        )}
      </p>
    </section>
  );
}
