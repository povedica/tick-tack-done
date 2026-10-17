import type { Habit, HabitStats } from '@reflexionia/sdk';
import { HABIT_WEEKDAYS, type HabitWeekday } from '@reflexionia/domain';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { messagesFor, type Messages } from '../../../i18n';
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
  const messages = messagesFor(navigator.language);
  const queryClient = useQueryClient();
  const habits = useQuery({
    queryKey: ['habits'],
    queryFn: () => habitsApi.listHabits(),
  });
  const [picked, setPicked] = useState<string | null>(null);
  const [draft, setDraft] = useState<HabitDraft>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const active = (habits.data?.items ?? []).filter((habit) => !habit.archived);
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
    mutationFn: () => habitsApi.createHabit(buildHabitBody(draft), crypto.randomUUID()),
    onSuccess: async (created) => {
      setDraft(EMPTY_DRAFT);
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

  return (
    <main className="habits">
      <p>
        <Link to="/today">{messages.backToday}</Link>
      </p>
      <h1>{messages.habitsTitle}</h1>
      <p>{messages.habitsHint}</p>
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

      <section>
        <h2>{messages.suggestions}</h2>
        <ul className="chips">
          {HABIT_SUGGESTIONS.map((suggestion) => (
            <li key={suggestion.id}>
              <button
                type="button"
                onClick={() => {
                  setDraft({
                    name: messages[suggestion.label],
                    period: suggestion.period,
                    times: suggestion.times,
                    days: suggestion.days,
                    reminderTime: suggestion.reminderTime,
                  });
                }}
              >
                {messages[suggestion.label]}
              </button>
            </li>
          ))}
        </ul>
        <form
          className="habit-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (canCreateHabit(draft)) {
              create.mutate();
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
          <button type="submit" disabled={!canCreateHabit(draft) || create.isPending}>
            {create.isPending ? messages.habitSaving : messages.habitCreate}
          </button>
        </form>
      </section>

      {habits.isPending ? <p>{messages.habitSaving}</p> : null}
      {active.length === 0 && !habits.isPending ? <p>{messages.habitEmpty}</p> : null}
      <ul className="habit-list">
        {active.map((habit) => (
          <li key={habit.id}>
            <button
              type="button"
              className={habit.id === selected ? 'selected' : undefined}
              onClick={() => {
                setPicked(habit.id);
              }}
            >
              {habit.name}
            </button>
            <p>
              {habit.today.count}/{habit.goal.target_count}
              {habit.goal.period === 'week' ? ` · ${String(habit.goal.times_per_period)}` : ''}
            </p>
            <button
              type="button"
              onClick={() => {
                checkIn.mutate({ habit, count: habit.today.count + 1 });
              }}
            >
              {messages.checkIn}
            </button>
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
                archive.mutate(habit.id);
              }}
            >
              {messages.archive}
            </button>
          </li>
        ))}
      </ul>
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
