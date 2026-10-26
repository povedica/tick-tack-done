import { useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import type { Habit } from '@reflexionia/sdk';
import { Button } from '../../../components/ui';
import { Link } from 'react-router';
import { Target, CalendarDays, Check, Flame, X } from 'lucide-react';
import { HABIT_WEEKDAYS } from '@reflexionia/domain';
import { useAppLocale } from '../../../i18n/locale';
import { api } from '../../../api';
import { useHabitCopy } from '../copy';
import { Popover } from '../../../components/Popover';
import { HabitMonthCalendar } from './HabitMonthCalendar';
export function HabitCard({
  habit,
  week,
  onCheck,
  busy,
}: {
  habit: Habit;
  week: readonly string[];
  onCheck: (date: string, count: number, note?: string | null) => void;
  busy: boolean;
}) {
  const t = useHabitCopy(),
    locale = useAppLocale();
  const [monthView, setMonthView] = useState<'inline' | 'dialog' | null>(null);
  const today = habit.today.date;
  const years = [
    ...new Set([Number(today.slice(0, 4)), ...week.map((date) => Number(date.slice(0, 4)))]),
  ];
  const statsByYear = useQueries({
    queries: years.map((year) => ({
      queryKey: ['habit-stats', habit.id, year],
      queryFn: () => api.habitStats(habit.id, year),
    })),
  });
  const stats = statsByYear[0];
  const target = habit.goal.target_count,
    met = habit.today.met;
  const weekCells = week.map((date) => {
    const cell = statsByYear[years.indexOf(Number(date.slice(0, 4)))]?.data?.heatmap.find(
      (row) => row.date === date,
    );
    const weekday = HABIT_WEEKDAYS[(new Date(`${date}T12:00Z`).getUTCDay() + 6) % 7] ?? 'monday';
    return {
      date,
      scheduled:
        cell?.scheduled ??
        (habit.frequency.includes(weekday) && (!habit.start_date || date >= habit.start_date)),
      done: date === today ? met : (cell?.met ?? false),
    };
  });
  const weeklyDone = weekCells.filter((cell) => cell.done && cell.date <= today).length;
  const scheduledDays = weekCells.filter((cell) => cell.scheduled).length;
  const weeklyTarget =
    habit.goal.period === 'week'
      ? Math.min(habit.goal.times_per_period, scheduledDays)
      : scheduledDays;
  const statsReady = statsByYear.every((query) => query.isSuccess);
  const labels = locale.startsWith('en')
    ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    : ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  return (
    <li className={`habit-card-v2${met ? ' is-met' : ''}`}>
      <div className="habit-card-main">
        <div className="habit-card-info">
          <Link
            className="habit-card-name"
            to={`/habits/${habit.id}`}
            aria-label={`${habit.name} · ${t.viewDetail}`}
          >
            <span>{habit.name}</span>
            <span className="habit-view-detail">{t.viewDetail}</span>
          </Link>
          <div className="habit-card-meta">
            <span className="habit-card-metrics" title={t.streakCaption}>
              <Flame size={16} aria-hidden="true" />
              <strong>
                {stats?.data?.streak_current ?? '—'}{' '}
                {habit.goal.period === 'week'
                  ? stats?.data?.streak_current === 1
                    ? t.singleWeek
                    : t.weeks
                  : stats?.data?.streak_current === 1
                    ? t.singleDay
                    : t.days}
              </strong>
            </span>
            <span
              className="habit-card-progress"
              aria-label={`${t.goal}: ${statsReady ? String(weeklyDone) : '—'} / ${String(weeklyTarget)}`}
              title={t.goal}
            >
              <Target size={16} aria-hidden="true" />
              <span>
                {t.goal} {statsReady ? weeklyDone : '—'} / {weeklyTarget}
              </span>
            </span>
          </div>
        </div>
      </div>
      <div className="habit-week-heading">
        <span className="sr-only">{week.includes(today) ? t.list : t.history}</span>
        <Button
          variant="ghost"
          className="habit-month-link"
          title={monthView ? t.hideMonth : t.viewMonth}
          aria-expanded={!!monthView}
          onClick={() => {
            setMonthView(
              monthView
                ? null
                : window.matchMedia('(max-width:768px)').matches
                  ? 'dialog'
                  : 'inline',
            );
          }}
        >
          <CalendarDays size={14} aria-hidden="true" />
          <span className="sr-only">{monthView ? t.hideMonth : t.viewMonth}</span>
        </Button>
      </div>
      <div className="habit-week-points" role="group" aria-label={`${t.history} · ${habit.name}`}>
        {weekCells.map(({ date, scheduled, done }, i) => {
          const label = new Intl.DateTimeFormat(locale, {
            weekday: 'long',
            day: 'numeric',
            month: 'short',
            timeZone: 'UTC',
          }).format(new Date(`${date}T12:00Z`));
          return (
            <Button
              variant="ghost"
              key={date}
              type="button"
              className={`${done ? 'is-done ' : ''}${date === today ? 'is-today ' : ''}${!scheduled ? 'is-inactive ' : ''}${date > today ? 'is-future' : ''}`}
              aria-label={`${label} · ${habit.name}`}
              aria-pressed={done}
              disabled={busy || date > today || !scheduled}
              title={label}
              onClick={() => {
                onCheck(date, done ? 0 : target);
              }}
            >
              <span>{labels[i]}</span>
              <i aria-hidden="true">
                {done ? (
                  <Check size={16} aria-hidden="true" />
                ) : (
                  <span className="habit-week-date">{Number(date.slice(8))}</span>
                )}
              </i>
            </Button>
          );
        })}
      </div>
      {monthView === 'inline' ? (
        <div className="habit-month-inline">
          <HabitMonthCalendar habit={habit} />
        </div>
      ) : null}
      {monthView === 'dialog' ? (
        <Popover
          open
          centered
          mobileSheet
          width={390}
          label={`${t.monthView} · ${habit.name}`}
          onClose={() => {
            setMonthView(null);
          }}
          className="popover habit-month-dialog"
        >
          <header className="habit-modal-heading">
            <h2>{habit.name}</h2>
            <Button
              variant="ghost"
              aria-label={t.close}
              onClick={() => {
                setMonthView(null);
              }}
            >
              <X size={18} aria-hidden="true" />
            </Button>
          </header>
          <HabitMonthCalendar habit={habit} />
        </Popover>
      ) : null}
    </li>
  );
}
