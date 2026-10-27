import { runAction } from '../../components/run-action';
import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { ApiError } from '@reflexionia/sdk';
import { Flame, Settings2, Target } from 'lucide-react';
import { InFlightProjects } from '../projects/InFlightProjects';
import '../projects/projects.css';
import { api } from '../../api';
import { Button } from '../../components/ui';
import { countdownsApi } from '../countdowns/api';
import { formatDuration } from '../product/duration';
import { useControlSummary } from '../statistics/ControlSummary';
import {
  WIDGETS,
  count,
  numeric,
  label,
  parseLayout,
  row,
  rows,
  gardenLists,
  type GardenWidget,
  type WidgetKey,
} from './model';
import { useGardenText } from './text';
import { GardenModal } from './GardenModal';
import { GardenLists, GardenTags } from './GardenMap';
import './dashboard.css';

export function DashboardPage() {
  const { t, number, locale } = useGardenText();
  const cache = useQueryClient();
  const data = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.dashboardData(),
    refetchInterval: 60_000,
  });
  const layout = useQuery({ queryKey: ['dashboard-layout'], queryFn: () => api.dashboardLayout() });
  const score = useControlSummary();
  const countdowns = useQuery({
    queryKey: ['countdowns', 'dashboard'],
    queryFn: () => countdownsApi.list(false),
    refetchInterval: 60_000,
  });
  const [draft, setDraft] = useState<GardenWidget[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [modal, setModal] = useState<{ kind: 'load' | 'tags'; selected: string | null } | null>(
    null,
  );
  const widgets = row(data.data?.widgets);
  const saved = parseLayout(layout.data?.widgets);
  const visible = draft ?? saved;
  const lists = gardenLists(widgets);
  const tags = rows(row(widgets.tags).items);
  const projects = row(widgets.projects);
  const totalActive = numeric(row(widgets.load).total_active);
  const unavailable = (error: unknown) =>
    error instanceof ApiError && [401, 403].includes(error.status);
  const state = (kind: 'loading' | 'error' | 'unknown' | 'disabled') => (
    <p className="garden-state" role={kind === 'error' ? 'alert' : 'status'}>
      {t(kind)}
    </p>
  );
  const value = (amount: unknown, suffix?: ReactNode) =>
    numeric(amount) === null ? (
      state('unknown')
    ) : (
      <strong className="garden-value">
        {number(count(amount))}
        {suffix}
      </strong>
    );
  const openMap = (kind: 'load' | 'tags', selected: string | null = null) => {
    setModal({ kind, selected });
  };

  async function save() {
    if (draft === null) return;
    setSaving(true);
    setSaveError(false);
    try {
      const result = await api.saveDashboardLayout({
        name: label(layout.data?.name) || t('title'),
        is_default: true,
        widgets: draft.map((item, position) => ({ ...item, position, config: {} })),
      });
      cache.setQueryData(['dashboard-layout'], result);
      setDraft(null);
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  }
  function content(key: WidgetKey): ReactNode {
    if (key === 'score' || key === 'streak') {
      if (score.isError) return state(unavailable(score.error) ? 'disabled' : 'error');
      if (!score.isSuccess) return state('loading');
      if (key === 'streak') {
        const streak = numeric(row(score.data.summary).streak_current);
        return (
          <>
            {streak === null ? (
              state('unknown')
            ) : (
              <strong className="garden-value">
                <Flame size={22} aria-hidden="true" />
                {number(streak)}
                <small>{t(streak === 1 ? 'day' : 'days')}</small>
              </strong>
            )}
            <p className="garden-hint">{t('streakHelp')}</p>
          </>
        );
      }
      if (score.achievement.enabled === false)
        return <p className="garden-state">{t('scoreOff')}</p>;
      const points = numeric(score.achievement.score);
      return (
        <>
          {value(points)}
          {points !== null ? (
            <p
              className="garden-score-label"
              data-state={points >= 75 ? 'good' : points >= 50 ? 'fair' : 'behind'}
            >
              {t(points >= 75 ? 'good' : points >= 50 ? 'fair' : 'behind')}
            </p>
          ) : null}
        </>
      );
    }
    if (key === 'next_countdowns') {
      if (countdowns.isError) return state(unavailable(countdowns.error) ? 'disabled' : 'error');
      if (!countdowns.isSuccess) return state('loading');
      const items = countdowns.data.items;
      if (items.length === 0 && data.isSuccess && row(widgets.next_countdowns).configured === false)
        return (
          <>
            {state('disabled')}
            <Link to="/countdowns">{t('activateCountdowns')}</Link>
          </>
        );
      const nearest = items
        .filter((item) => item.kind !== 'since')
        .sort((a, b) => a.days - b.days)[0];
      return (
        <>
          {value(items.length, <small>{t('active')}</small>)}
          {nearest ? (
            <p className="garden-countdown-next">
              <span>{nearest.title}</span>
              <b>
                {number(nearest.days)} {t(nearest.days === 1 ? 'day' : 'days')}
              </b>
            </p>
          ) : (
            <p className="garden-hint">{t('noNext')}</p>
          )}
        </>
      );
    }
    if (data.isError) return state(unavailable(data.error) ? 'disabled' : 'error');
    if (!data.isSuccess) return state('loading');
    if (!Object.hasOwn(widgets, key)) return state('unknown');
    switch (key) {
      case 'completed_today':
        return (
          <>
            {value(widgets.completed_today)}
            <p className="garden-secondary">
              <b>
                {numeric(row(widgets.completed_week).value) === null
                  ? '—'
                  : number(count(row(widgets.completed_week).value))}
              </b>{' '}
              {t('week')}
            </p>
          </>
        );
      case 'overdue':
        return (
          <>
            {value(widgets.overdue)}
            <p className="garden-secondary">
              <b>{totalActive === null ? '—' : number(totalActive)}</b> {t('active')}
            </p>
          </>
        );
      case 'next_7_days':
        return value(widgets.next_7_days);
      case 'habits': {
        const habits = row(widgets.habits);
        const today = row(habits.today);
        if (habits.configured === false)
          return (
            <>
              {state('disabled')}
              <Link to="/habits">{t('activateHabits')}</Link>
            </>
          );
        const expected = numeric(today.expected);
        const done = numeric(today.done);
        if (expected === null || done === null || habits.complete === false)
          return state('unknown');
        return (
          <>
            <strong className="garden-value">
              {number(done)}
              <small>
                {t('of')} {number(expected)}
              </small>
            </strong>
            {expected > 0 ? (
              <progress max={expected} value={done} aria-label={t('habits')} />
            ) : (
              <p className="garden-hint">{t('noHabitsToday')}</p>
            )}
            {expected > 0 && done >= expected && habits.complete === true ? (
              <p className="garden-positive">{t('habitsDone')}</p>
            ) : null}
            {rows(habits.pending_today).length > 0 ? (
              <p className="garden-pending">
                {t('pending')}:{' '}
                {rows(habits.pending_today)
                  .slice(0, 3)
                  .map((habit) => label(habit.name))
                  .join(', ')}
                {rows(habits.pending_today).length > 3 ? '…' : ''}
              </p>
            ) : null}
          </>
        );
      }
      case 'focus': {
        const focus = row(widgets.focus);
        const seconds = numeric(focus.seconds);
        const goal = numeric(focus.goal_seconds);
        if (focus.configured === false) return state('disabled');
        if (seconds === null) return state('unknown');
        return (
          <>
            <strong className="garden-value is-duration">{formatDuration(seconds)}</strong>
            {goal !== null && goal > 0 ? (
              <>
                <progress max={goal} value={seconds} aria-label={t('goal')} />
                <p className="garden-hint">
                  {t('goal')}: {formatDuration(goal)}
                </p>
                {seconds >= goal ? <p className="garden-positive">{t('focusDone')}</p> : null}
              </>
            ) : null}
            {focus.active === true ? <p className="garden-session">{t('focusActive')}</p> : null}
          </>
        );
      }
      case 'calendar': {
        const calendar = row(widgets.calendar);
        if (calendar.configured === false || calendar.available === false)
          return (
            <>
              {state('disabled')}
              <Link to="/settings/calendar">{t('connect')}</Link>
            </>
          );
        if (numeric(calendar.upcoming) === null || !Array.isArray(calendar.items))
          return state('unknown');
        return count(calendar.upcoming) === 0 ? (
          <p className="garden-state">{t('noEvents')}</p>
        ) : (
          <>
            <p className="garden-secondary">
              <b>{numeric(calendar.today) === null ? '—' : number(count(calendar.today))}</b>{' '}
              {t('today')}
            </p>
            <ul className="garden-agenda">
              {rows(calendar.items)
                .slice(0, 3)
                .map((event) => (
                  <li key={label(event.id)}>
                    <time dateTime={label(event.starts_at)}>
                      {new Date(label(event.starts_at)).toLocaleDateString(locale, {
                        day: 'numeric',
                        month: 'short',
                        timeZone: label(row(data.data.period).time_zone) || 'Europe/Madrid',
                      })}
                    </time>
                    <span>{label(event.title)}</span>
                  </li>
                ))}
            </ul>
          </>
        );
      }
      case 'load':
        return (
          <>
            {!Array.isArray(row(widgets.load).by_list) ? (
              state('unknown')
            ) : lists.length === 0 ? (
              <p>{t('noLists')}</p>
            ) : (
              <GardenLists
                items={lists.slice(0, 5)}
                onSelect={(id) => {
                  openMap('load', id);
                }}
              />
            )}
            {numeric(projects.needs_review) !== null ? (
              <p className="garden-review">
                {t('review')}: <b>{number(count(projects.needs_review))}</b>
              </p>
            ) : null}
          </>
        );
      case 'in_flight_projects':
        return <InFlightProjects value={widgets.in_flight_projects} />;
      case 'tags':
        return !Array.isArray(row(widgets.tags).items) ? (
          state('unknown')
        ) : tags.length === 0 ? (
          <p>{t('noTags')}</p>
        ) : (
          <GardenTags
            items={tags}
            preview
            onSelect={(id) => {
              openMap('tags', id);
            }}
          />
        );
    }
  }
  const destination: Partial<Record<WidgetKey, string>> = {
    completed_today: '/smart/completed',
    overdue: '/smart/overdue',
    next_7_days: '/smart/next7',
    habits: '/habits',
    focus: '/focus',
    next_countdowns: '/countdowns',
    calendar: '/calendar/agenda',
    in_flight_projects: '/dashboard/projects',
  };
  return (
    <section className="screen-page is-wide digital-garden" aria-labelledby="garden-title">
      <header className="page-header garden-header">
        <h1 id="garden-title">{t('title')}</h1>
        <div className="garden-header-actions">
          <Link className="garden-projects-link" to="/dashboard/projects">
            <Target size={16} aria-hidden="true" />
            {t('projects')}
          </Link>
          <Button
            disabled={!layout.isSuccess || draft !== null}
            onClick={() => {
              setDraft(saved);
              setSaveError(false);
            }}
          >
            <Settings2 size={16} />
            {t('customize')}
          </Button>
        </div>
      </header>
      {draft !== null ? (
        <section className="garden-customize" aria-label={t('customize')}>
          <div className="garden-editor-list">
            {[
              ...draft.map((item) => item.widget_key),
              ...(Object.keys(WIDGETS) as WidgetKey[]).filter(
                (key) => !draft.some((item) => item.widget_key === key),
              ),
            ].map((key) => {
              const index = draft.findIndex((item) => item.widget_key === key);
              return (
                <div key={key} data-garden-editor={key}>
                  <label>
                    <input
                      type="checkbox"
                      disabled={saving}
                      checked={index >= 0}
                      onChange={(event) => {
                        setDraft(
                          event.target.checked
                            ? [
                                ...draft,
                                { widget_key: key, size: WIDGETS[key].group === 'kpi' ? 's' : 'm' },
                              ]
                            : draft.filter((item) => item.widget_key !== key),
                        );
                      }}
                    />
                    {t(WIDGETS[key].title)}
                  </label>
                </div>
              );
            })}
          </div>
          {saveError ? <p role="alert">{t('saveError')}</p> : null}
          <div className="garden-editor-actions">
            <Button
              disabled={saving}
              variant="primary"
              onClick={() => {
                runAction(save());
              }}
            >
              {saving ? t('loading') : t('save')}
            </Button>
            <Button
              disabled={saving}
              onClick={() => {
                setDraft(null);
              }}
            >
              {t('cancel')}
            </Button>
          </div>
        </section>
      ) : null}
      {layout.isError ? (
        <div role="alert">
          {t('error')}
          <Button
            onClick={() => {
              runAction(layout.refetch());
            }}
          >
            {t('retry')}
          </Button>
        </div>
      ) : null}
      {(['kpi', 'activity', 'projects', 'map'] as const).map((group) => (
        <div key={group} className={`garden-grid garden-grid-${group}`} data-garden-group={group}>
          {visible
            .filter((item) => WIDGETS[item.widget_key].group === group)
            .sort(
              (a, b) =>
                Object.keys(WIDGETS).indexOf(a.widget_key) -
                Object.keys(WIDGETS).indexOf(b.widget_key),
            )
            .map((item) => (
              <article
                className="garden-card"
                data-garden-widget={item.widget_key}
                key={item.widget_key}
              >
                <header>
                  <h2>
                    {destination[item.widget_key] ? (
                      <Link to={destination[item.widget_key] ?? '/dashboard'}>
                        {t(WIDGETS[item.widget_key].title)}
                      </Link>
                    ) : (
                      t(WIDGETS[item.widget_key].title)
                    )}
                  </h2>
                  {group === 'projects' ? (
                    <Link to="/dashboard/projects" className="garden-text-button">
                      {t('projectsAll')}
                    </Link>
                  ) : group === 'map' ? (
                    <button
                      type="button"
                      className="garden-text-button"
                      onClick={() => {
                        openMap(item.widget_key as 'load' | 'tags');
                      }}
                    >
                      {t('all')}
                    </button>
                  ) : null}
                </header>
                <div className="garden-card-content">{content(item.widget_key)}</div>
              </article>
            ))}
        </div>
      ))}
      {visible.length === 0 && layout.isSuccess ? <p>{t('empty')}</p> : null}
      <footer className="garden-footer">
        <details>
          <summary>{t('calculations')}</summary>
          <p>{t('calculationText')}</p>
          <p>{t('criteria')}</p>
        </details>
      </footer>
      {modal ? (
        <GardenModal
          title={t(WIDGETS[modal.kind].title)}
          onClose={() => {
            setModal(null);
          }}
        >
          {modal.kind === 'load' ? (
            <>
              <GardenLists
                items={lists}
                detail
                selected={modal.selected}
                onSelect={(id) => {
                  setModal({ kind: 'load', selected: id });
                }}
              />
              <p className="garden-review">
                {numeric(projects.needs_review) !== null
                  ? `${t('review')}: ${number(count(projects.needs_review))}`
                  : t('unknown')}
              </p>
              {lists.filter((item) => item.needsReview).length > 0 ? (
                <p>
                  {lists
                    .filter((item) => item.needsReview)
                    .map((item) => item.name)
                    .join(' · ')}
                </p>
              ) : null}
            </>
          ) : (
            <GardenTags
              items={tags}
              selected={modal.selected}
              onSelect={(id) => {
                setModal({ kind: 'tags', selected: id });
              }}
            />
          )}
        </GardenModal>
      ) : null}
    </section>
  );
}
