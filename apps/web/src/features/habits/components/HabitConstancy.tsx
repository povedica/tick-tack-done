import { Select } from '../../../components/Select';
import { useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import type { Habit } from '@reflexionia/sdk';
import { api } from '../../../api';
import { useHabitCopy } from '../copy';
import { useAppLocale } from '../../../i18n/locale';
import { YearHeatmap, type HeatCell } from '../../statistics/YearHeatmap';

export function HabitConstancy({
  habits,
  today,
  onSelect,
}: {
  readonly habits: readonly Habit[];
  readonly today: string;
  readonly onSelect?: (cell: HeatCell) => void;
}) {
  const t = useHabitCopy();
  const locale = useAppLocale();
  const es = !locale.startsWith('en');
  const [selected, setSelected] = useState<string | null>(null);
  const year = Number(today.slice(0, 4));
  const queries = useQueries({
    queries: habits.flatMap((habit) =>
      [year].map((y) => ({
        queryKey: ['habit-stats', habit.id, y],
        queryFn: () => api.habitStats(habit.id, y),
      })),
    ),
  });
  const chosen = habits.find((habit) => habit.id === selected);
  const filtered = chosen ? [chosen] : habits;
  const maps = new Map(
    habits.map((habit, index) => [
      habit.id,
      new Map((queries[index]?.data?.heatmap ?? []).map((cell) => [cell.date, cell])),
    ]),
  );
  const daysInYear = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86400000;
  const cells: HeatCell[] = Array.from({ length: daysInYear }, (_, index) => {
    const date = new Date(Date.UTC(year, 0, index + 1, 12));
    const iso = date.toISOString().slice(0, 10);
    const scheduled = filtered.filter((habit) => maps.get(habit.id)?.get(iso)?.scheduled);
    const missing = scheduled.filter((habit) => !maps.get(habit.id)?.get(iso)?.met);
    const met = scheduled.length - missing.length;
    return {
      date: iso,
      scheduled: scheduled.length,
      met,
      missing: missing.map((habit) => habit.name),
      level: scheduled.length ? Math.ceil((met / scheduled.length) * 4) : 0,
    };
  });
  // Ticky could later suggest small adjustments after broken streaks; this view uses only recorded data.
  return (
    <section className="habit-constancy" aria-label={es ? 'Constancia' : 'Consistency'}>
      <div className="habit-constancy-heading">
        <h2>{t.consistency}</h2>
        {habits.length > 1 ? (
          <label className="habit-history-select">
            <span className="sr-only">{t.chooseHabit}</span>
            <Select
              aria-label={t.chooseHabit}
              value={chosen?.id ?? ''}
              onChange={(event) => {
                setSelected(event.target.value || null);
              }}
            >
              <option value="">{t.allHabits}</option>
              {habits.map((habit) => (
                <option key={habit.id} value={habit.id}>
                  {habit.name}
                </option>
              ))}
            </Select>
          </label>
        ) : null}
      </div>
      {queries.some((q) => q.isPending) ? (
        <p role="status">{es ? 'Cargando…' : 'Loading…'}</p>
      ) : queries.some((q) => q.isError) ? (
        <p role="alert">
          {es ? 'No se pudo cargar la constancia.' : 'Could not load consistency.'}
        </p>
      ) : (
        <YearHeatmap
          cells={cells}
          mode="habits"
          today={today}
          color="var(--accent)"
          onSelect={onSelect}
        />
      )}
    </section>
  );
}
