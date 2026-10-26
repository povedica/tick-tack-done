import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Habit, CreateHabitBody } from '@reflexionia/sdk';
import { ChevronLeft, ChevronRight, Plus, SlidersHorizontal, X } from 'lucide-react';
import { Link } from 'react-router';
import { api } from '../../../api';
import { Popover } from '../../../components/Popover';
import { PeriodNavigator } from '../../../components/period/PeriodNavigator';
import { Button, SkeletonRows } from '../../../components/ui';
import { useMessages } from '../../../i18n';
import { useAppLocale } from '../../../i18n/locale';
import { useHabitCopy } from '../copy';
import { HabitActions } from './HabitActions';
import { HabitEditor } from './HabitEditor';
import { HabitCard } from './HabitCard';
import { HabitConstancy } from './HabitConstancy';
import '../habits.css';
export function HabitsPage() {
  const m = useMessages(),
    t = useHabitCopy(),
    locale = useAppLocale(),
    cache = useQueryClient();
  const habits = useQuery({
    queryKey: ['habits'],
    queryFn: async () => {
      const items: Habit[] = [];
      let cursor: string | undefined;
      do {
        const page = await api.listHabits(cursor ? { cursor } : {});
        items.push(...page.items);
        cursor = page.next_cursor ?? undefined;
      } while (cursor);
      return { items };
    },
  });
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.getMe() });
  const [editor, setEditor] = useState<Habit | 'new' | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [manage, setManage] = useState(false);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState(false);
  const all = habits.data?.items ?? [],
    active = all.filter((h) => !h.archived && !h.paused);
  const today =
    all[0]?.today.date ??
    new Intl.DateTimeFormat('en-CA', {
      timeZone: me.data?.time_zone ?? 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  const monday = new Date(`${today}T12:00Z`);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7) + offset * 7);
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
  const refresh = async () => {
    await Promise.all(
      ['habits', 'habit', 'habit-stats', 'stats', 'achievements', 'dashboard'].map((key) =>
        cache.invalidateQueries({ queryKey: [key] }),
      ),
    );
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
  const save = (body: CreateHabitBody) => {
    mutation.mutate(async () => {
      if (editor && editor !== 'new') await api.updateHabit(editor.id, body);
      else await api.createHabit(body, crypto.randomUUID());
      setEditor(null);
      setManage(false);
    });
  };
  const formatWeekDate = (date: string) =>
    new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
      new Date(`${date}T12:00Z`),
    );
  const weekLabel = `${formatWeekDate(week[0] ?? today)} – ${formatWeekDate(week[6] ?? today)}`;
  return (
    <main className="screen-page habits-v2 habits-redesign">
      <header className="habit-head">
        <h1>{m.habitsTitle}</h1>
        <div>
          <Button
            variant="ghost"
            onClick={() => {
              setDeleting(null);
              setManage(!manage);
            }}
            aria-haspopup="dialog"
            aria-expanded={manage}
          >
            <SlidersHorizontal size={16} aria-hidden="true" />
            {t.manage}
          </Button>
          <Button
            variant="primary"
            className="habit-new-button"
            aria-label={t.create}
            onClick={() => {
              setEditor('new');
            }}
          >
            <Plus size={20} aria-hidden="true" />
          </Button>
        </div>
      </header>
      {error || habits.isError ? <p role="alert">{t.failed}</p> : null}
      <nav className="habit-period-toolbar" aria-label={t.chooseWeek}>
        <div className="habit-period-controls">
          <Button
            variant="ghost"
            aria-label={t.previousWeek}
            onClick={() => {
              setOffset((n) => n - 1);
            }}
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </Button>
          <PeriodNavigator
            title={t.chooseWeek}
            label={t.chooseWeek}
            displayLabel={weekLabel}
            date={new Date(`${week[0] ?? today}T12:00:00`)}
            onPick={(date) => {
              const picked = new Date(
                Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
              );
              picked.setUTCDate(picked.getUTCDate() - ((picked.getUTCDay() + 6) % 7));
              const current = new Date(`${today}T00:00Z`);
              current.setUTCDate(current.getUTCDate() - ((current.getUTCDay() + 6) % 7));
              setOffset(
                Math.min(0, Math.round((picked.getTime() - current.getTime()) / (7 * 86400000))),
              );
            }}
          />
          <Button
            variant="ghost"
            aria-label={t.nextWeek}
            disabled={offset >= 0}
            onClick={() => {
              setOffset((n) => n + 1);
            }}
          >
            <ChevronRight size={18} aria-hidden="true" />
          </Button>
        </div>
        <Button
          variant="secondary"
          aria-label={t.currentWeek}
          disabled={offset === 0}
          onClick={() => {
            setOffset(0);
          }}
        >
          {t.todayLabel}
        </Button>
      </nav>
      {habits.isPending ? <SkeletonRows /> : null}
      {!habits.isPending && !all.length ? (
        <section className="habit-empty-v2">
          <p>{t.empty}</p>
          <Button
            variant="primary"
            onClick={() => {
              setEditor('new');
            }}
          >
            {t.create}
          </Button>
        </section>
      ) : null}
      <>
        <ul className="habit-cards-v2">
          {active.map((h) => (
            <HabitCard
              key={h.id}
              habit={h}
              week={week}
              busy={mutation.isPending}
              onCheck={(date, count) => {
                mutation.mutate(() => api.checkInHabit(h.id, { date, count }, crypto.randomUUID()));
              }}
            />
          ))}
        </ul>
        {active.length ? <HabitConstancy habits={active} today={today} /> : null}
        {all.length > 0 && !active.length ? <p className="habit-empty-v2">{t.emptyWeek}</p> : null}
      </>
      {manage ? (
        <Popover
          open
          centered
          mobileSheet
          width={540}
          label={t.manageTitle}
          className="popover habit-management-dialog"
          onClose={() => {
            setManage(false);
            setDeleting(null);
          }}
        >
          <header className="habit-modal-heading">
            <h2>{t.manageTitle}</h2>
            <Button
              variant="ghost"
              aria-label={t.close}
              onClick={() => {
                setManage(false);
              }}
            >
              <X size={18} aria-hidden="true" />
            </Button>
          </header>
          <ul className="habit-management-list">
            {all.map((h) => (
              <li key={h.id}>
                <div>
                  <Link to={`/habits/${h.id}`}>{h.name}</Link>
                  <small>
                    {h.archived || h.paused
                      ? t.paused
                      : h.goal.period === 'week'
                        ? `${String(h.goal.times_per_period)} / ${m.periodWeek}`
                        : t.daily}
                  </small>
                </div>
                <HabitActions
                  label={h.name}
                  paused={h.paused || h.archived}
                  busy={mutation.isPending}
                  onEdit={() => {
                    setDeleting(null);
                    setManage(false);
                    setEditor(h);
                  }}
                  onPause={() => {
                    mutation.mutate(() =>
                      api.updateHabit(
                        h.id,
                        h.archived ? { archived: false, paused: false } : { paused: !h.paused },
                      ),
                    );
                  }}
                  onDelete={() => {
                    setDeleting(h.id);
                  }}
                />
                {deleting === h.id ? (
                  <div
                    className="habit-delete-confirm"
                    role="alertdialog"
                    aria-label={`${t.remove} · ${h.name}`}
                  >
                    <p>{t.confirmDelete}</p>
                    <div className="habit-actions">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={mutation.isPending}
                        onClick={() => {
                          setDeleting(null);
                        }}
                      >
                        {t.cancel}
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        loading={mutation.isPending}
                        onClick={() => {
                          mutation.mutate(async () => {
                            await api.deleteHabit(h.id);
                            setDeleting(null);
                          });
                        }}
                      >
                        {t.remove}
                      </Button>
                    </div>
                    {error ? <p role="alert">{t.failed}</p> : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </Popover>
      ) : null}
      {editor ? (
        <HabitEditor
          key={editor === 'new' ? 'new' : editor.id}
          {...(editor === 'new' ? {} : { habit: editor })}
          busy={mutation.isPending}
          error={error ? t.failed : undefined}
          onSave={save}
          onCancel={() => {
            setEditor(null);
            setManage(false);
          }}
        />
      ) : null}
    </main>
  );
}
