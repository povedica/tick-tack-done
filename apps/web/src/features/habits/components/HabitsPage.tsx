import type { Habit, HabitStats } from '@reflexionia/sdk';
import { HABIT_WEEKDAYS, type HabitWeekday } from '@reflexionia/domain';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button, EmptyState } from '../../../components/ui';
import { useMessages, type Messages } from '../../../i18n';
import { habitsApi } from '../api';
import { HABIT_SUGGESTIONS, buildHabitBody, canCreateHabit, type HabitDraft } from '../suggestions';

const DAY_LABEL: Record<HabitWeekday, keyof Messages> = {
  monday: 'dayMonday',
  tuesday: 'dayTuesday',
  wednesday: 'dayWednesday',
  thursday: 'dayThursday',
  friday: 'dayFriday',
  saturday: 'daySaturday',
  sunday: 'daySunday',
};

const EMPTY_DRAFT: HabitDraft = {
  name: '',
  period: 'day',
  times: 1,
  days: HABIT_WEEKDAYS,
  reminderTime: '',
};

export function HabitsPage() {
  const messages = useMessages();
  const queryClient = useQueryClient();
  const habits = useQuery({
    queryKey: ['habits'],
    queryFn: () => habitsApi.listHabits(),
  });
  const [picked, setPicked] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState<string | null>(null);
  const [draft, setDraft] = useState<HabitDraft>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const active = (habits.data?.items ?? []).filter((habit) => !habit.archived);
  const archived = (habits.data?.items ?? []).filter((habit) => habit.archived);
  const selected = picked ?? active[0]?.id ?? null;
  const stats = useQuery({
    queryKey: ['habit-stats', selected],
    queryFn: () => {
      if (selected === null) {
        throw new Error('habit');
      }
      const today = active.find((habit) => habit.id === selected)?.today.date ?? '';
      const year = Number(today.slice(0, 4));
      return habitsApi.habitStats(selected, Number.isInteger(year) && year > 0 ? year : undefined);
    },
    enabled: selected !== null,
  });

  const refresh = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: ['habits'] });
    await queryClient.invalidateQueries({ queryKey: ['habit-stats'] });
  };

  const create = useMutation({
    mutationFn: (body: HabitDraft) => habitsApi.createHabit(buildHabitBody(body), crypto.randomUUID()),
    onSuccess: async (created) => {
      setDraft(EMPTY_DRAFT);
      setAdding(false);
      setPicked(created.id);
      setError(null);
      await refresh();
    },
    onError: () => {
      setError(messages.habitFailed);
    },
  });

  const checkIn = useMutation({
    mutationFn: (input: { habit: Habit; count: number; note?: string }) =>
      habitsApi.checkInHabit(
        input.habit.id,
        {
          date: input.habit.today.date,
          count: input.count,
          ...(input.note === undefined ? {} : { note: input.note }),
        },
        crypto.randomUUID(),
      ),
    onSuccess: async () => {
      setError(null);
      await refresh();
    },
    onError: () => {
      setError(messages.habitFailed);
    },
  });

  const archive = useMutation({
    mutationFn: (id: string) => habitsApi.updateHabit(id, { archived: true }),
    onSuccess: async () => {
      setPicked(null);
      await refresh();
    },
  });

  const week = weekDays(new Date());
  return (
    <main className="habits screen-page">
      <header className="habit-head">
        <div>
          <h1>{messages.habitsTitle}</h1>
          <p className="lede">{messages.habitsHint}</p>
        </div>
        <Button
          variant="primary"
          onClick={() => {
            setAdding((current) => !current);
          }}
        >
          {messages.habitCreate}
        </Button>
      </header>
      <ol className="habit-week">
        {week.map((day) => (
          <li key={day.key} data-today={day.today ? 'true' : undefined}>
            <span>{day.label}</span>
            <i />
          </li>
        ))}
      </ol>
      {error !== null ? <p className="error">{error}</p> : null}
      {stats.data !== undefined ? (
        <Heatmap
          title={messages.aggregateHeat}
          cells={stats.data.aggregate_heatmap.map((cell) => ({
            date: cell.date,
            level: aggregateLevel(cell),
          }))}
        />
      ) : null}

      <section className="habit-suggest">
        <h2>{messages.suggestions}</h2>
        <ul>
          {HABIT_SUGGESTIONS.map((suggestion) => (
            <li key={suggestion.id}>
              <button
                type="button"
                disabled={create.isPending}
                onClick={() => {
                  const body: HabitDraft = {
                    name: messages[suggestion.label],
                    period: suggestion.period,
                    times: suggestion.times,
                    days: suggestion.days,
                    reminderTime: suggestion.reminderTime,
                  };
                  setDraft(body);
                  create.mutate(body);
                }}
              >
                {messages[suggestion.label]}
              </button>
            </li>
          ))}
        </ul>
        {adding ? (
          <>
            <form
              className="habit-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (canCreateHabit(draft)) {
                  create.mutate(draft);
                }
              }}
            >
              <label>
                {messages.habitName}
                <input
                  value={draft.name}
                  onChange={(event) => {
                    setDraft({ ...draft, name: event.target.value });
                  }}
                />
              </label>
              <label>
                {messages.habitPeriod}
                <select
                  value={draft.period}
                  onChange={(event) => {
                    const period = event.target.value === 'week' ? 'week' : 'day';
                    setDraft({ ...draft, period });
                  }}
                >
                  <option value="day">{messages.periodDay}</option>
                  <option value="week">{messages.periodWeek}</option>
                </select>
              </label>
              <label>
                {messages.habitTimes}
                <input
                  type="number"
                  min={1}
                  value={draft.times}
                  onChange={(event) => {
                    setDraft({ ...draft, times: Number(event.target.value) });
                  }}
                />
              </label>
              <fieldset>
                <legend>{messages.habitDays}</legend>
                {HABIT_WEEKDAYS.map((day) => (
                  <label key={day}>
                    <input
                      type="checkbox"
                      checked={draft.days.includes(day)}
                      onChange={() => {
                        const days = draft.days.includes(day)
                          ? draft.days.filter((item) => item !== day)
                          : [...draft.days, day];
                        setDraft({ ...draft, days });
                      }}
                    />
                    {messages[DAY_LABEL[day]]}
                  </label>
                ))}
              </fieldset>
              <label>
                {messages.habitReminder}
                <input
                  type="time"
                  value={draft.reminderTime}
                  onChange={(event) => {
                    setDraft({ ...draft, reminderTime: event.target.value });
                  }}
                />
              </label>
              <Button type="submit" variant="primary" disabled={!canCreateHabit(draft) || create.isPending}>
                {create.isPending ? messages.habitSaving : messages.habitCreate}
              </Button>
            </form>
          </>
        ) : null}
      </section>

      {habits.isPending ? <p>{messages.habitSaving}</p> : null}
      {active.length === 0 && !habits.isPending ? (
        <EmptyState title={messages.habitsTitle} body={messages.habitEmpty} />
      ) : null}
      <ul className="habit-list">
        {active.map((habit) => (
          <li key={habit.id} className="habit-card">
            <Link to={`/habits/${habit.id}`}>{habit.name}</Link>
            <button
              type="button"
              className={habit.id === selected ? 'selected' : undefined}
              onClick={() => {
                setPicked(habit.id);
              }}
            >
              {messages.habitOpen}
            </button>
            <p>
              {habit.today.count}/{habit.goal.target_count}
              {habit.goal.period === 'week' ? ` · ${String(habit.goal.times_per_period)}` : ''}
            </p>
            <button
              type="button"
              className={
                habit.today.count >= habit.goal.target_count ? 'habit-check is-done' : 'habit-check'
              }
              aria-label={messages.checkIn}
              onClick={() => {
                checkIn.mutate({ habit, count: habit.today.count + 1 });
              }}
            />
            <label>
              {messages.habitNote}
              <input
                defaultValue={habit.today.note ?? ''}
                key={`${habit.id}-${habit.today.note ?? ''}`}
                onBlur={(event) => {
                  const note = event.target.value;
                  if (note !== (habit.today.note ?? '')) {
                    checkIn.mutate({ habit, count: habit.today.count, note });
                  }
                }}
              />
            </label>
            <button
              type="button"
              onClick={() => {
                if (confirmArchive !== habit.id) {
                  setConfirmArchive(habit.id);
                  return;
                }
                archive.mutate(habit.id);
                setConfirmArchive(null);
              }}
            >
              {confirmArchive === habit.id ? messages.confirmArchive : messages.archive}
            </button>
          </li>
        ))}
      </ul>
      {archived.length > 0 ? (
        <section>
          <h2>{messages.habitArchived}</h2>
          <ul>
            {archived.map((habit) => (
              <li key={habit.id}>
                {habit.name}
                <button
                  type="button"
                  onClick={() => {
                    void habitsApi.updateHabit(habit.id, { archived: false }).then(() => refresh());
                  }}
                >
                  {messages.habitUnarchive}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {stats.data !== undefined && selected !== null ? (
        <StatsPanel messages={messages} stats={stats.data} />
      ) : null}
    </main>
  );
}

function StatsPanel({ messages, stats }: { messages: Messages; stats: HabitStats }) {
  return (
    <section>
      <p>
        {messages.streakCurrent}: {stats.streak_current}
      </p>
      <p>
        {messages.streakBest}: {stats.streak_best}
      </p>
      <p>
        {messages.weekPercent}: {stats.completion_percent.week}%
      </p>
      <p>
        {messages.monthPercent}: {stats.completion_percent.month}%
      </p>
      <Heatmap
        title={messages.heatmap}
        cells={stats.heatmap.map((cell) => ({
          date: cell.date,
          level: habitLevel(cell),
        }))}
      />
    </section>
  );
}

function weekDays(now: Date): { key: string; label: string; today: boolean }[] {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const shift = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - shift);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toDateString();
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
    return {
      key: day.toDateString(),
      label: new Intl.DateTimeFormat('es', { weekday: 'narrow' }).format(day),
      today: day.toDateString() === today,
    };
  });
}

function habitLevel(cell: { scheduled: boolean; met: boolean }): 'off' | 'miss' | 'met' {
  if (!cell.scheduled) {
    return 'off';
  }
  return cell.met ? 'met' : 'miss';
}

function aggregateLevel(cell: {
  scheduled: number;
  met: number;
}): 'off' | 'miss' | 'partial' | 'met' {
  if (cell.scheduled === 0) {
    return 'off';
  }
  if (cell.met === 0) {
    return 'miss';
  }
  if (cell.met >= cell.scheduled) {
    return 'met';
  }
  return 'partial';
}

function Heatmap({
  title,
  cells,
}: {
  title: string;
  cells: readonly { date: string; level: 'off' | 'miss' | 'partial' | 'met' }[];
}) {
  return (
    <section>
      <h2>{title}</h2>
      <div className="heat">
        {cells.map((cell) => (
          <span key={cell.date} title={cell.date} data-level={cell.level} />
        ))}
      </div>
    </section>
  );
}
