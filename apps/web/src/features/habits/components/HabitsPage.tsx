import { YearHeatmap } from '../../statistics/YearHeatmap';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Habit, CreateHabitBody } from '@reflexionia/sdk';
import { api } from '../../../api';
import { Button } from '../../../components/ui';
import { useActionToast } from '../../../components/action-toast';
import { useMessages } from '../../../i18n';
import { useAppLocale } from '../../../i18n/locale';
import { HABIT_SUGGESTIONS, buildHabitBody } from '../suggestions';
import { useHabitCopy } from '../copy';
import { HabitEditor } from './HabitEditor';
import { HabitCard } from './HabitCard';
import '../habits.css';

export function HabitsPage() {
  const m = useMessages();
  const t = useHabitCopy();
  const locale = useAppLocale();
  const cache = useQueryClient();
  const toast = useActionToast((state) => state.show);
  const habits = useQuery({ queryKey: ['habits'], queryFn: () => api.listHabits() });
  const [editor, setEditor] = useState<Habit | 'new' | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Habit | null>(null);
  const [error, setError] = useState(false);
  const active = (habits.data?.items ?? []).filter((habit) => !habit.archived);
  const archived = (habits.data?.items ?? []).filter((habit) => habit.archived);
  const today =
    active[0]?.today.date ??
    new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(
      new Date(),
    );
  const monday = new Date(`${today}T12:00:00`);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const week = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday);
    day.setDate(day.getDate() + i);
    return `${String(day.getFullYear())}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
  });
  const aggregate = useQuery({
    queryKey: ['habit-stats', active[0]?.id, Number(today.slice(0, 4))],
    queryFn: () => api.habitStats(active[0]?.id ?? '', Number(today.slice(0, 4))),
    enabled: active.length > 0,
  });
  const refresh = async () => {
    for (const key of ['habits', 'habit-stats', 'stats', 'achievements', 'dashboard'])
      await cache.invalidateQueries({ queryKey: [key] });
  };
  const mutation = useMutation({
    mutationFn: async (action: () => Promise<unknown>) => action(),
    onSuccess: async () => {
      setError(false);
      await refresh();
    },
    onError: () => {
      setError(true);
    },
  });
  const archive = (habit: Habit) => {
    mutation.mutate(async () => {
      await api.updateHabit(habit.id, { archived: !habit.archived });
      toast(habit.archived ? t.recovered : t.archived, () => {
        mutation.mutate(() => api.updateHabit(habit.id, { archived: habit.archived }));
      });
    });
  };
  const remove = (habit: Habit) => {
    setPendingDelete(habit);
  };
  const save = (body: CreateHabitBody) => {
    mutation.mutate(async () => {
      if (editor && editor !== 'new') await api.updateHabit(editor.id, body);
      else await api.createHabit(body, crypto.randomUUID());
      setEditor(null);
    });
  };
  return (
    <main className="screen-page habits-v2">
      <header className="habit-head">
        <h1>{m.habitsTitle}</h1>
        <Button
          variant="primary"
          onClick={() => {
            setEditor('new');
          }}
        >
          {m.habitCreate}
        </Button>
      </header>
      {error || habits.isError ? <p role="alert">{t.failed}</p> : null}
      <ol className="habit-summary-week">
        {week.map((date) => {
          const cell = aggregate.data?.aggregate_heatmap.find((cell) => cell.date === date);
          const done = cell?.met ?? 0;
          const total = cell?.scheduled ?? 0;
          return (
            <li key={date} data-today={date === today}>
              <span>
                {new Date(`${date}T12:00:00`).toLocaleDateString(locale, { weekday: 'narrow' })}
              </span>
              <i
                className={
                  total && done === total ? 'is-done' : total && date < today ? 'is-missed' : ''
                }
                style={
                  {
                    '--habit-progress': `${String(total ? (done / total) * 100 : 0)}%`,
                  } as React.CSSProperties
                }
                aria-label={`${date}: ${String(done)}/${String(total)}`}
              >
                {total && done === total ? '✓' : new Date(`${date}T12:00:00`).getDate()}
              </i>
            </li>
          );
        })}
      </ol>
      {editor ? (
        <HabitEditor
          key={editor === 'new' ? 'new' : editor.id}
          {...(editor === 'new' ? {} : { habit: editor })}
          busy={mutation.isPending}
          onSave={save}
          onCancel={() => {
            setEditor(null);
          }}
        />
      ) : null}
      {habits.isPending ? <p role="status">{m.habitSaving}</p> : null}
      {!active.length && !habits.isPending ? (
        <section className="habit-empty-v2">
          <p>{m.habitEmpty}</p>
          <div className="habit-actions">
            {HABIT_SUGGESTIONS.map((suggestion) => (
              <Button
                key={suggestion.id}
                disabled={mutation.isPending}
                onClick={() => {
                  mutation.mutate(() =>
                    api.createHabit(
                      {
                        ...buildHabitBody({ name: m[suggestion.label], ...suggestion }),
                        icon:
                          (
                            { water: '💧', walk: '🚶', read: '📖', exercise: '🏃' } as Record<
                              string,
                              string
                            >
                          )[suggestion.id] ?? null,
                      },
                      crypto.randomUUID(),
                    ),
                  );
                }}
              >
                {m[suggestion.label]}
              </Button>
            ))}
          </div>
        </section>
      ) : null}
      <ul className="habit-cards-v2">
        {active.map((habit) => (
          <HabitCard
            key={habit.id}
            habit={habit}
            week={week}
            busy={mutation.isPending}
            onEdit={() => {
              setEditor(habit);
            }}
            onArchive={() => {
              archive(habit);
            }}
            onDelete={() => {
              remove(habit);
            }}
            onCheck={(date, count, note) => {
              mutation.mutate(() =>
                api.checkInHabit(
                  habit.id,
                  { date, count, ...(note === undefined ? {} : { note }) },
                  crypto.randomUUID(),
                ),
              );
            }}
          />
        ))}
      </ul>
      {aggregate.data ? (
        <details className="habit-existing-heatmap">
          <summary>{m.aggregateHeat}</summary>
          <YearHeatmap
            cells={aggregate.data.aggregate_heatmap.map((cell) => ({
              date: cell.date,
              count: cell.met,
              level: cell.scheduled === 0 ? 0 : Math.round((cell.met / cell.scheduled) * 4),
            }))}
          />
        </details>
      ) : null}
      {archived.length ? (
        <details className="habit-archived">
          <summary>
            {m.habitArchived} · {archived.length}
          </summary>
          <ul>
            {archived.map((habit) => (
              <li key={habit.id}>
                <span>
                  {habit.icon} {habit.name}
                </span>
                <Button
                  size="sm"
                  disabled={mutation.isPending}
                  onClick={() => {
                    archive(habit);
                  }}
                >
                  {m.habitUnarchive}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={mutation.isPending}
                  onClick={() => {
                    remove(habit);
                  }}
                >
                  {t.remove}
                </Button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {pendingDelete !== null ? (
        <div className="token-confirm" role="alertdialog">
          <p>{t.confirmDelete}</p>
          <span className="token-actions">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setPendingDelete(null);
              }}
            >
              {m.cancel}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="danger"
              onClick={() => {
                const habit = pendingDelete;
                setPendingDelete(null);
                mutation.mutate(() => api.deleteHabit(habit.id));
              }}
            >
              {t.remove}
            </Button>
          </span>
        </div>
      ) : null}
    </main>
  );
}
