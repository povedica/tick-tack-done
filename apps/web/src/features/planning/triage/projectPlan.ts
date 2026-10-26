import { actionDate, civilDateKey, dayLoad, effectOf, formatMinutes } from '@reflexionia/domain';
import type { LoadRange, PlanSession, LoadDay } from '../api';
import type { WtFMessages } from '../i18n-wt-f';
export function projectPlan(range: LoadRange, session: PlanSession): LoadRange {
  const decided = new Set(
    session.decisions.filter((d) => d.action !== 'skip').map((d) => d.task_id),
  );
  const days = range.days.map((day) => {
    const tasks = day.tasks.filter((t) => !decided.has(t.id));
    for (const choice of session.decisions) {
      if (actionDate(choice, session.local_date) !== day.date) continue;
      const card = session.cards.find((c) => c.task_id === choice.task_id);
      if (!card) continue;
      const patch = effectOf(
        choice,
        session.local_date,
        range.time_zone,
        card.duration_minutes ?? 30,
      );
      tasks.push({
        id: card.task_id,
        title: card.title,
        start_date: patch?.start_date ?? null,
        due_date: card.due_date,
        is_all_day: !choice.time,
        duration_minutes: choice.duration ?? card.duration_minutes,
        evening_only: false,
      });
    }
    const result = dayLoad({
      date: day.date,
      timeZone: range.time_zone,
      settings: {
        workDayStart: range.settings.work_day_start,
        workDayEnd: range.settings.work_day_end,
        defaultTaskDuration: range.settings.default_task_duration,
        workDays: range.settings.work_days,
      },
      tasks: tasks.map((t) => ({
        id: t.id,
        durationMinutes: t.duration_minutes,
        startDate: t.start_date,
        dueDate: t.due_date,
        isAllDay: t.is_all_day,
        status: 'active',
        eveningOnly: t.evening_only ?? false,
      })),
      events: day.events.map((e) => ({
        id: e.id,
        startsAt: e.starts_at,
        endsAt: e.ends_at,
        isAllDay: e.is_all_day,
      })),
    });
    return {
      ...day,
      tasks,
      task_minutes: result.taskMinutes,
      event_minutes: result.eventMinutes,
      available_minutes: result.availableMinutes,
      ratio: result.ratio,
      status: result.status,
    };
  });
  return { ...range, days };
}
export function loadPhrase(
  day: Pick<LoadDay, 'available_minutes' | 'task_minutes' | 'event_minutes' | 'status'>,
  m: WtFMessages,
): string {
  const remaining = (day.available_minutes ?? 0) - day.task_minutes - day.event_minutes;
  return day.status === 'overload'
    ? `${m.overload} · ${m.excess} ${formatMinutes(-remaining)}`
    : `${day.status === 'tight' ? m.tight : m.okay} · ${formatMinutes(remaining)} ${m.free}`;
}
export function taskLocalDate(start: string | null, zone: string): string | null {
  return start ? civilDateKey(start, zone) : null;
}
