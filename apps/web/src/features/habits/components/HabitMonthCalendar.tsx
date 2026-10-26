import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Habit } from '@reflexionia/sdk';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../../../api';
import { Button } from '../../../components/ui';
import { useAppLocale } from '../../../i18n/locale';
import { useHabitCopy } from '../copy';

/** Read-only month view. Corrections remain available in the habit detail. */
export function HabitMonthCalendar({
  habit,
  onSelect,
  onMonthChange,
  busy = false,
}: {
  readonly habit: Habit;
  readonly onSelect?: (date: string) => void;
  readonly onMonthChange?: (date: Date) => void;
  readonly busy?: boolean;
}) {
  const t = useHabitCopy(),
    locale = useAppLocale();
  const [month, setMonth] = useState(() => habit.today.date.slice(0, 7));
  const year = Number(month.slice(0, 4)),
    monthIndex = Number(month.slice(5)) - 1;
  const stats = useQuery({
    queryKey: ['habit-stats', habit.id, year],
    queryFn: () => api.habitStats(habit.id, year),
  });
  const days = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const offset = (new Date(Date.UTC(year, monthIndex, 1)).getUTCDay() + 6) % 7;
  const cells = Array.from({ length: days }, (_, i) => {
    const date = `${month}-${String(i + 1).padStart(2, '0')}`;
    return { date, day: i + 1, cell: stats.data?.heatmap.find((row) => row.date === date) };
  });
  const completed = cells.filter(({ date, cell }) =>
    date === habit.today.date ? habit.today.met : cell?.met,
  ).length;
  const title = new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${month}-01T12:00Z`));
  const shift = (amount: number) => {
    const date = new Date(Date.UTC(year, monthIndex + amount, 1));
    setMonth(date.toISOString().slice(0, 7));
    onMonthChange?.(date);
  };
  const labels = locale.startsWith('en')
    ? ['M', 'T', 'W', 'T', 'F', 'S', 'S']
    : ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  return (
    <section className="habit-month-calendar" aria-label={`${t.monthView} · ${habit.name}`}>
      <header>
        <Button
          variant="icon"
          size="sm"
          aria-label={t.previousMonth}
          onClick={() => {
            shift(-1);
          }}
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </Button>
        <h3>{title}</h3>
        <Button
          variant="icon"
          size="sm"
          aria-label={t.nextMonth}
          disabled={month >= habit.today.date.slice(0, 7)}
          onClick={() => {
            shift(1);
          }}
        >
          <ChevronRight size={18} aria-hidden="true" />
        </Button>
      </header>
      {stats.isPending ? (
        <p role="status">{t.loading}</p>
      ) : stats.isError ? (
        <p role="alert">{t.loadFailed}</p>
      ) : (
        <>
          <table className="habit-month-days" aria-label={title}>
            <thead>
              <tr>
                {labels.map((label, i) => (
                  <th scope="col" key={String(i)}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: Math.ceil((days + offset) / 7) }, (_, weekIndex) => (
                <tr key={String(weekIndex)}>
                  {Array.from({ length: 7 }, (_, dayIndex) => {
                    const item = cells[weekIndex * 7 + dayIndex - offset];
                    if (!item) return <td key={String(dayIndex)} />;
                    const { date, day, cell } = item;
                    const future = date > habit.today.date;
                    const met = date === habit.today.date ? habit.today.met : cell?.met;
                    const state = met
                      ? t.doneCaption
                      : cell?.scheduled
                        ? t.monthPending
                        : t.monthInactive;
                    const description = `${new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00Z`))} · ${future ? t.futureDay : state}`;
                    const Day = onSelect ? 'button' : 'span';
                    return (
                      <td key={date} aria-label={description}>
                        <Day
                          type={onSelect ? 'button' : undefined}
                          disabled={
                            onSelect
                              ? busy || future || (!cell?.scheduled && !cell?.count)
                              : undefined
                          }
                          aria-label={
                            onSelect ? `${date} · ${String(cell?.count ?? 0)}` : undefined
                          }
                          onClick={
                            onSelect
                              ? () => {
                                  onSelect(date);
                                }
                              : undefined
                          }
                          className="habit-month-day"
                          data-met={!!met}
                          data-today={date === habit.today.date}
                          data-inactive={!cell?.scheduled}
                          data-future={future}
                          aria-current={date === habit.today.date ? 'date' : undefined}
                          title={description}
                        >
                          <span>{day}</span>
                          {met ? <Check size={12} strokeWidth={3} aria-hidden="true" /> : null}
                        </Day>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="habit-month-summary">
            <strong>{completed}</strong>{' '}
            {completed === 1 ? t.monthCompletedSingle : t.monthCompleted}
          </p>
        </>
      )}
    </section>
  );
}
