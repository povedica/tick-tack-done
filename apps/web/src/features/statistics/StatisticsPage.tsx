import { runAction } from '../../components/run-action';
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  Download,
  Flame,
  LoaderCircle,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { api } from '../../api';
import { collectProjects, collectTags } from '../tasks/collect';
import { isIanaTimeZone } from '@reflexionia/domain';
import { statsApi, createStatisticsFile, type StatsParams } from './api';
import { Charts } from './ChartSuspense';
import { DayTimeline } from './DayTimeline';
import { YearHeatmap } from './YearHeatmap';
import { DataTable } from './DataTable';
import { useChartTheme } from './chart-theme';
import { useStatisticsText, type StatisticsTextKey } from './text';
import {
  rangeFor,
  shiftRange,
  readStatsState,
  writeStatsState,
  validDay,
  type RangeKey,
} from './range';
import './statistics.css';
import { ControlSummary } from './ControlSummary';
type Row = Record<string, unknown>;
type Tab = 'overview' | 'tasks' | 'focus' | 'habits';
const TABS: readonly Tab[] = ['overview', 'tasks', 'focus', 'habits'];
const RANGES: readonly RangeKey[] = ['today', 'week', 'month', 'year', 'custom'];
const FilterContext = createContext<{ active: boolean; clear: () => void }>({
  active: false,
  clear: () => undefined,
});
function keyboardOptions(event: KeyboardEvent<HTMLElement>) {
  if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
  const buttons = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-option]'),
  );
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? buttons.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
  event.preventDefault();
  buttons[next]?.focus();
  buttons[next]?.click();
}
export function StatisticsPage() {
  const { t, day, number, duration } = useStatisticsText();
  const navigate = useNavigate();
  const { tab: tabParam } = useParams();
  const [search, setSearch] = useSearchParams();
  const client = useQueryClient();
  const account = useQuery({ queryKey: ['me'], queryFn: () => api.getMe() });
  const stored = new URLSearchParams(readStatsState());
  const rangeValue = search.get('range') ?? stored.get('range') ?? 'week';
  const rangeKey: RangeKey = RANGES.includes(rangeValue as RangeKey)
    ? (rangeValue as RangeKey)
    : 'week';
  const requestedTz =
    search.get('tz') ??
    stored.get('tz') ??
    account.data?.time_zone ??
    Intl.DateTimeFormat().resolvedOptions().timeZone;
  const waitingForTimeZone = !search.has('tz') && !stored.has('tz') && account.isPending;
  const tz = isIanaTimeZone(requestedTz) ? requestedTz : 'Europe/Madrid';
  const tab: Tab = TABS.includes(tabParam as Tab) ? (tabParam as Tab) : 'overview';
  const source = search.size === 0 ? stored : search;
  const from = source.get('from');
  const to = source.get('to');
  const custom = from && to ? { from, to } : undefined;
  const bounds = rangeFor(rangeKey, tz, custom);
  const invalid =
    !isIanaTimeZone(requestedTz) ||
    (!!custom &&
      (!validDay(custom.from) ||
        !validDay(custom.to) ||
        custom.from > custom.to ||
        (Date.parse(custom.to) - Date.parse(custom.from)) / 86400000 > 731));
  const params: StatsParams = {
    from: bounds.from,
    to: bounds.to,
    tz,
    ...Object.fromEntries(
      ['list', 'tag', 'priority', 'type', 'day'].flatMap((key) =>
        source.get(key) ? [[key, source.get(key)]] : [],
      ),
    ),
  };
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(false);
  const filterCount = ['list', 'tag', 'priority'].reduce(
    (sum, key) => sum + (source.get(key)?.split(',').length ?? 0),
    0,
  );
  const filterRef = useRef<HTMLDivElement>(null);
  const path = (next: Tab) => (next === 'overview' ? '/statistics' : `/statistics/${next}`);
  function update(values: Record<string, string | null>, replace = false) {
    const copy = new URLSearchParams(source);
    for (const [key, value] of Object.entries(values)) {
      if (value === null || value === '') copy.delete(key);
      else copy.set(key, value);
    }
    setSearch(copy, { replace });
  }
  function clear() {
    update({ list: null, tag: null, priority: null });
  }
  useLayoutEffect(() => {
    if (waitingForTimeZone) return;
    if (search.size === 0) {
      const copy = new URLSearchParams(stored);
      copy.set('range', rangeKey);
      copy.set('from', bounds.from);
      copy.set('to', bounds.to);
      copy.set('tz', tz);
      let fallback: string | null = null;
      try {
        fallback = localStorage.getItem('tick-tack-done.stats.tab');
      } catch {
        /* Optional storage. */
      }
      if (
        tabParam === undefined &&
        fallback !== null &&
        fallback !== 'overview' &&
        TABS.includes(fallback as Tab)
      ) {
        runAction(
          Promise.resolve(
            navigate(`${path(fallback as Tab)}?${copy.toString()}`, { replace: true }),
          ),
        );
      } else setSearch(copy, { replace: true });
    } else writeStatsState(search.toString());
  }, [search, bounds.from, bounds.to, rangeKey, tz, setSearch, waitingForTimeZone]);
  useEffect(() => {
    try {
      localStorage.setItem('tick-tack-done.stats.tab', tab);
    } catch {
      /* optional */
    }
  }, [tab]);
  const options = (kind: 'overview' | 'tasks' | 'focus' | 'habits') => ({
    queryKey: ['stats', kind, params],
    queryFn: async (): Promise<Row> => statsApi[kind](params),
    staleTime: 5 * 60_000,
  });
  const overview = useQuery({
    ...options('overview'),
    enabled: !waitingForTimeZone && !invalid && tab === 'overview',
    placeholderData: keepPreviousData,
  });
  const tasks = useQuery({
    ...options('tasks'),
    enabled: !waitingForTimeZone && !invalid && tab === 'tasks',
    placeholderData: keepPreviousData,
  });
  const focus = useQuery({
    ...options('focus'),
    enabled: !waitingForTimeZone && !invalid && tab === 'focus',
    placeholderData: keepPreviousData,
  });
  const habits = useQuery({
    ...options('habits'),
    enabled: !waitingForTimeZone && !invalid && tab === 'habits',
    placeholderData: keepPreviousData,
  });
  const projects = useQuery({
    queryKey: ['stats', 'lists'],
    queryFn: collectProjects,
    staleTime: 5 * 60_000,
  });
  const tags = useQuery({
    queryKey: ['stats', 'tags'],
    queryFn: collectTags,
    staleTime: 5 * 60_000,
  });
  useEffect(() => {
    if (tab === 'overview' && !invalid && !waitingForTimeZone) {
      for (const kind of ['tasks', 'focus', 'habits'] as const)
        void client.query(options(kind)).catch(() => undefined);
    }
  }, [
    tab,
    params.from,
    params.to,
    params.list,
    params.tag,
    params.priority,
    params.type,
    tz,
    invalid,
    waitingForTimeZone,
    client,
  ]);
  useEffect(() => {
    const refresh = () => {
      runAction(client.invalidateQueries({ queryKey: ['stats'] }));
    };
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
    };
  }, [client]);
  function setRange(next: RangeKey) {
    const nextBounds = rangeFor(next, tz);
    update({ range: next, ...nextBounds });
  }
  function nudge(direction: -1 | 1) {
    update({
      range: rangeKey === 'today' ? 'custom' : rangeKey,
      ...shiftRange(rangeKey, bounds.from, bounds.to, direction),
    });
  }
  async function exportFile(format: 'csv' | 'json') {
    setExporting(true);
    setExportError(false);
    try {
      const [overviewData, tasksData, focusData, habitsData] = await Promise.all(
        (['overview', 'tasks', 'focus', 'habits'] as const).map((kind) =>
          client.query(options(kind)),
        ),
      );
      const blob = createStatisticsFile(
        {
          overview: overviewData ?? {},
          tasks: tasksData ?? {},
          focus: focusData ?? {},
          habits: habitsData ?? {},
          from: params.from,
          to: params.to,
        },
        format,
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `stats-${params.from}_${params.to}.${format}`;
      anchor.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 1000);
    } catch {
      setExportError(true);
    } finally {
      setExporting(false);
    }
  }
  const query =
    tab === 'tasks' ? tasks : tab === 'focus' ? focus : tab === 'habits' ? habits : overview;
  const listRows = rows(projects.data?.items);
  const tagRows = rows(tags.data?.items);
  return (
    <FilterContext.Provider value={{ active: filterCount > 0, clear }}>
      <section className="stats-page">
        <header className="stats-header">
          <div className="stats-header-row">
            <h1>{t('title')}</h1>
            <div
              className="stats-range"
              role="group"
              aria-label={t('date')}
              onKeyDown={keyboardOptions}
            >
              <button
                type="button"
                onClick={() => {
                  nudge(-1);
                }}
                aria-label={t('previous')}
              >
                ‹
              </button>
              {RANGES.map((key) => (
                <button
                  data-option
                  key={key}
                  type="button"
                  disabled={waitingForTimeZone}
                  aria-pressed={rangeKey === key}
                  className={rangeKey === key ? 'is-active' : undefined}
                  onClick={() => {
                    setRange(key);
                  }}
                >
                  {t(key)}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  nudge(1);
                }}
                aria-label={t('next')}
              >
                ›
              </button>
            </div>
            <div className="stats-actions">
              {tab !== 'habits' ? (
                <button
                  className="stats-filter-btn"
                  type="button"
                  aria-expanded={filtersOpen}
                  onClick={() => {
                    setFiltersOpen(!filtersOpen);
                  }}
                >
                  <SlidersHorizontal size={16} />
                  {t('filters')}
                  {filterCount ? ` · ${String(filterCount)}` : ''}
                </button>
              ) : null}
              <details className="stats-export">
                <summary aria-label={t('export')}>
                  {exporting ? (
                    <LoaderCircle className="stats-spinner" size={16} />
                  ) : (
                    <Download size={16} />
                  )}
                  <span>{exporting ? t('generating') : t('export')}</span>
                </summary>
                <div>
                  {(['csv', 'json'] as const).map((format) => (
                    <button
                      key={format}
                      type="button"
                      disabled={exporting || invalid}
                      onClick={() => {
                        runAction(exportFile(format));
                      }}
                    >
                      {format.toUpperCase()}
                    </button>
                  ))}
                </div>
              </details>
              <Link className="stats-link" to="/reports/weekly">
                {t('report')}
              </Link>
            </div>
          </div>
          {rangeKey === 'custom' ? (
            <div className="stats-custom">
              {(['from', 'to'] as const).map((key) => (
                <label key={key}>
                  {t(key)}
                  <input
                    type="date"
                    value={source.get(key) ?? bounds[key]}
                    onChange={(event) => {
                      update({ [key]: event.target.value });
                    }}
                  />
                </label>
              ))}
            </div>
          ) : null}
          {invalid ? <p role="alert">{t('invalidRange')}</p> : null}
          {exportError ? (
            <p role="alert">
              {t('error')}{' '}
              <button
                type="button"
                onClick={() => {
                  runAction(exportFile('csv'));
                }}
              >
                {t('retry')}
              </button>
            </p>
          ) : null}
          {filtersOpen && tab !== 'habits' ? (
            <div
              ref={filterRef}
              className="stats-filters-panel"
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setFiltersOpen(false);
                }
              }}
            >
              {(
                [
                  ['list', 'lists', listRows],
                  ['tag', 'tags', tagRows],
                  [
                    'priority',
                    'priority',
                    ['high', 'medium', 'low', 'none'].map((id) => ({
                      id,
                      name: t(id as StatisticsTextKey),
                    })),
                  ],
                ] as const
              ).map(([key, label, choices]) => (
                <fieldset key={key}>
                  <legend>{t(label)}</legend>
                  {choices.map((choice) => (
                    <label key={String(choice.id)}>
                      <input
                        type="checkbox"
                        checked={(source.get(key)?.split(',') ?? []).includes(String(choice.id))}
                        onChange={(event) => {
                          const selected = new Set(source.get(key)?.split(',') ?? []);
                          if (event.target.checked) selected.add(String(choice.id));
                          else selected.delete(String(choice.id));
                          update({ [key]: [...selected].join(',') });
                        }}
                      />
                      {String(choice.name)}
                    </label>
                  ))}
                </fieldset>
              ))}
            </div>
          ) : null}
          <div className="stats-chips">
            {(['list', 'tag', 'priority'] as const).flatMap((key) =>
              (source.get(key)?.split(',') ?? []).map((id) => {
                const label =
                  key === 'priority'
                    ? t(id as 'high' | 'medium' | 'low' | 'none')
                    : text(
                        (key === 'list' ? listRows : tagRows).find((row) => row.id === id)?.name ??
                          t(key === 'list' ? 'lists' : 'tags'),
                      );
                return (
                  <span className="stats-chip" key={`${key}-${id}`}>
                    {label}
                    <button
                      type="button"
                      aria-label={`${t('clear')}: ${label}`}
                      onClick={() => {
                        update({
                          [key]: (source.get(key)?.split(',') ?? [])
                            .filter((value) => value !== id)
                            .join(','),
                        });
                      }}
                    >
                      ×
                    </button>
                  </span>
                );
              }),
            )}
          </div>
        </header>
        <nav
          className="stats-tabs"
          role="tablist"
          aria-label={t('title')}
          onKeyDown={keyboardOptions}
        >
          {TABS.map((key) => (
            <button
              data-option
              id={`stats-tab-${key}`}
              type="button"
              role="tab"
              disabled={waitingForTimeZone}
              aria-selected={tab === key}
              aria-controls={`stats-panel-${key}`}
              tabIndex={tab === key ? 0 : -1}
              key={key}
              className={tab === key ? 'is-active' : undefined}
              onClick={() => {
                runAction(Promise.resolve(navigate(`${path(key)}?${source.toString()}`)));
              }}
            >
              {t(key)}
            </button>
          ))}
        </nav>
        <div className={overview.isPlaceholderData ? 'stats-phrase stats-stale' : 'stats-phrase'}>
          <p className="stats-period">
            <CalendarDays size={14} aria-hidden="true" />
            <span>
              <time dateTime={bounds.from}>{day(bounds.from)}</time> –{' '}
              <time dateTime={bounds.to}>{day(bounds.to)}</time>
            </span>
          </p>
          {overview.data && tab === 'overview' ? (
            <dl className="stats-summary-facts">
              <div>
                <dt>{t('completed')}</dt>
                <dd>{number(num(record(overview.data.summary).completed))}</dd>
              </div>
              <div>
                <dt>{t('planned')}</dt>
                <dd>{number(num(record(overview.data.summary).completion_planned))}</dd>
              </div>
              <div>
                <dt>{t('focusTime')}</dt>
                <dd>{duration(num(record(overview.data.summary).focus_minutes))}</dd>
              </div>
              <div>
                <dt>{t('habits')}</dt>
                <dd>
                  {num(record(overview.data.summary).habit_expected) === 0
                    ? '—'
                    : `${number(num(record(overview.data.summary).habit_percent))} %`}
                </dd>
              </div>
            </dl>
          ) : null}
        </div>
        <div
          role="tabpanel"
          id={`stats-panel-${tab}`}
          aria-labelledby={`stats-tab-${tab}`}
          aria-busy={query.isFetching}
          className={query.isPlaceholderData ? 'stats-stale' : undefined}
        >
          {invalid ? null : query.isLoading ? (
            <Skeleton />
          ) : query.isError ? (
            <div className="stats-error" role="alert">
              {t('error')}
              <button
                type="button"
                onClick={() => {
                  runAction(query.refetch());
                }}
              >
                {t('retry')}
              </button>
            </div>
          ) : query.data ? (
            <>
              {tab === 'overview' ? (
                <Overview
                  data={query.data}
                  open={(next) => {
                    runAction(Promise.resolve(navigate(`${path(next)}?${source.toString()}`)));
                  }}
                />
              ) : null}
              {tab === 'tasks' ? <Tasks data={query.data} /> : null}
              {tab === 'focus' ? (
                <>
                  <label className="stats-session-type">
                    {t('sessionType')}
                    <select
                      value={source.get('type') ?? 'focus'}
                      onChange={(event) => {
                        update({ type: event.target.value });
                      }}
                    >
                      {(['focus', 'short_break', 'long_break'] as const).map((type) => (
                        <option key={type} value={type}>
                          {t(type)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Focus
                    data={query.data}
                    tz={tz}
                    selectedDay={
                      source.get('day') ?? (text(record(query.data).timeline_day) || bounds.to)
                    }
                    select={(day) => {
                      update({ day });
                    }}
                  />
                </>
              ) : null}
              {tab === 'habits' ? <Habits data={query.data} /> : null}
            </>
          ) : null}
        </div>
      </section>
    </FilterContext.Provider>
  );
}
function Card({
  title,
  children,
  span = 12,
}: {
  readonly title: string;
  readonly children: ReactNode;
  readonly span?: 4 | 6 | 8 | 12;
}) {
  return (
    <article className={`stats-card stats-span-${String(span)}`}>
      <h2>{title}</h2>
      {children}
    </article>
  );
}
function Empty({ kind = 'tasks' }: { readonly kind?: 'tasks' | 'focus' | 'habits' }) {
  const { t } = useStatisticsText();
  const filter = useContext(FilterContext);
  return (
    <div className="stats-empty">
      <p>
        {filter.active
          ? t('noMatch')
          : t(kind === 'tasks' ? 'emptyTasks' : kind === 'focus' ? 'emptyFocus' : 'emptyHabits')}
      </p>
      {filter.active ? (
        <button type="button" onClick={filter.clear}>
          {t('clear')}
        </button>
      ) : (
        <Link to={kind === 'tasks' ? '/today' : `/${kind}`}>{t(kind)}</Link>
      )}
    </div>
  );
}
function Kpi({
  label,
  value,
  hint,
  delta,
  points = false,
  onClick,
}: {
  readonly label: string;
  readonly value: string;
  readonly hint?: string | undefined;
  readonly delta?: number | null;
  readonly points?: boolean;
  readonly onClick?: () => void;
}) {
  const { t, number } = useStatisticsText();
  const content = (
    <>
      <p className="stats-kpi-label">{label}</p>
      <p className="stats-kpi-value">{value}</p>
      {hint ? <p className="stats-kpi-hint">{hint}</p> : null}
      {delta !== undefined && delta !== null ? (
        <p className={`stats-delta ${delta > 0 ? 'is-up' : delta < 0 ? 'is-down' : 'is-flat'}`}>
          {delta > 0 ? <TrendingUp size={14} /> : delta < 0 ? <TrendingDown size={14} /> : null}
          {delta === 0
            ? t('unchanged')
            : `${delta > 0 ? '+' : ''}${number(delta)} ${points ? t('percentagePoints') : '%'}`}{' '}
          · {t('previousRange')}
        </p>
      ) : null}
    </>
  );
  return onClick ? (
    <button className="stats-card stats-kpi" type="button" onClick={onClick}>
      {content}
    </button>
  ) : (
    <article className="stats-card stats-kpi">{content}</article>
  );
}
function Overview({ data, open }: { readonly data: Row; readonly open: (tab: Tab) => void }) {
  const { t, number, duration, countDays } = useStatisticsText();
  const s = record(data.summary);
  const achievement = record(s.achievement);
  const best = record(data.best_moment);
  const productive = num(s.completed) > 0 || rows(data.trend).some((row) => num(row.created) > 0);
  return (
    <div className="stats-body">
      <div className="stats-kpi-grid">
        <Kpi
          label={t('completed')}
          value={number(num(s.completed))}
          hint={`${t('previousValue')}: ${number(num(s.completed_previous))}`}
          delta={num(s.completed_previous) >= 5 ? nullable(s.completed_delta_percent) : null}
          onClick={() => {
            open('tasks');
          }}
        />
        <Kpi
          label={t('rate')}
          value={s.completion_rate === null ? '—' : `${number(num(s.completion_rate))} %`}
          hint={`${number(num(s.completion_completed))}/${number(num(s.completion_planned))}`}
          delta={nullable(s.completion_rate_delta_pt)}
          points
          onClick={() => {
            open('tasks');
          }}
        />
        <Kpi
          label={t('focusTime')}
          value={duration(num(s.focus_minutes))}
          hint={`${number(num(s.pomodoros))} ${t(num(s.pomodoros) === 1 ? 'pomodoro' : 'pomodoros')}`}
          delta={nullable(s.focus_minutes_delta_percent)}
          onClick={() => {
            open('focus');
          }}
        />
        <Kpi
          label={t('habitRate')}
          value={num(s.habit_expected) === 0 ? '—' : `${number(num(s.habit_percent))} %`}
          hint={
            num(s.habit_expected) > 0
              ? `${number(num(s.habit_done))}/${number(num(s.habit_expected))}`
              : undefined
          }
          delta={num(s.habit_expected) > 0 ? nullable(s.habit_delta_pt) : null}
          points
          onClick={() => {
            open('habits');
          }}
        />
        <Kpi
          label={t('streak')}
          value={countDays(num(s.streak_current))}
          hint={`${t('best')}: ${countDays(num(s.streak_best_year))}`}
          onClick={() => {
            open('tasks');
          }}
        />
        {achievement.enabled === true ? (
          <article className="stats-card stats-kpi">
            <h2>{t('achievement')}</h2>
            <ControlSummary value={achievement} />
            <a href="#stats-achievement-history">{t('history')}</a>
          </article>
        ) : null}
      </div>
      <Card title={t('trend')}>
        {productive ? <Charts.TrendChart data={graphRows(data.trend)} /> : <Empty />}
      </Card>
      <Card title={t('rate')} span={6}>
        {num(s.completion_planned) > 0 ? (
          <Charts.RateChart data={graphRows(data.completion_series)} />
        ) : (
          <Empty />
        )}
      </Card>
      <Card title={t('moment')} span={6}>
        {productive ? (
          <>
            <Distribution
              rows={rows(best.by_weekday).map((row) => ({
                key: String(row.weekday),
                label: weekdayName(num(row.weekday)),
                value: num(row.completed),
                percent: num(s.completed) === 0 ? 0 : (num(row.completed) / num(s.completed)) * 100,
              }))}
            />
            <DataTable
              caption={t('moment')}
              headers={[t('hour'), t('completed')]}
              rows={(['morning', 'afternoon', 'evening'] as const).map((key) => [
                t(key),
                number(num(record(best.by_band)[key])),
              ])}
            />
          </>
        ) : (
          <Empty />
        )}
      </Card>
      {achievement.enabled === true ? (
        <div className="stats-span-12" id="stats-achievement-history">
          <Card title={t('history')}>
            <Charts.AchievementChart data={graphRows(achievement.history)} />
          </Card>
        </div>
      ) : (
        <p>
          <Link to="/settings/features">{t('settings')}</Link>
        </p>
      )}
    </div>
  );
}
function Tasks({ data }: { readonly data: Row }) {
  const { t, number } = useStatisticsText();
  const punctuality = record(data.punctuality);
  const age = record(data.age_on_complete);
  return (
    <div className="stats-body">
      <Card title={t('trend')}>
        {rows(data.trend).some((row) => num(row.completed) + num(row.created) > 0) ? (
          <Charts.TrendChart data={graphRows(data.trend)} />
        ) : (
          <Empty />
        )}
      </Card>
      <Card title={t('rate')} span={6}>
        {rows(data.completion_series).some((row) => num(row.planned) > 0) ? (
          <Charts.RateChart data={graphRows(data.completion_series)} />
        ) : (
          <Empty />
        )}
      </Card>
      <Card title={t('punctuality')} span={6}>
        {punctuality.on_time_percent === null ? (
          <Empty />
        ) : (
          <>
            <div className="stats-stacked-bar">
              <span
                style={{
                  width: `${String(num(punctuality.on_time_percent))}%`,
                  background: 'var(--success)',
                }}
              />
              <span
                style={{
                  width: `${String(100 - num(punctuality.on_time_percent))}%`,
                  background: 'var(--danger)',
                }}
              />
            </div>
            <p>
              {t('onTime')} {number(num(punctuality.on_time_percent))} % · {t('late')}{' '}
              {number(100 - num(punctuality.on_time_percent))} %
            </p>
            <p>
              {t('sample')}: {number(num(punctuality.sample))} · {t('cap')}:{' '}
              {number(num(punctuality.capped_samples))}
            </p>
            <p>
              {t('delay')} · {t('mean')} {number(num(punctuality.mean_delay_days))} {t('days')} ·{' '}
              {t('median')} {number(num(punctuality.median_delay_days))} {t('days')}
            </p>
          </>
        )}
      </Card>
      {(['by_list', 'by_tag', 'by_priority'] as const).map((key, index) => (
        <Card
          key={key}
          title={t((['byList', 'byTag', 'byPriority'] as const)[index] ?? 'byList')}
          span={4}
        >
          <Distribution rows={rows(data[key])} priority={key === 'by_priority'} />
        </Card>
      ))}
      <Card title={t('overdue')} span={6}>
        <Charts.OverdueChart data={graphRows(data.overdue_stock)} />
      </Card>
      <Card title={t('age')} span={6}>
        {num(age.sample) > 0 ? (
          <>
            <p className="stats-kpi-value">
              {number(num(age.mean_days))} {t('days')}
            </p>
            <p>
              {t('mean')} · {t('median')} {number(num(age.median_days))} {t('days')} · {t('sample')}{' '}
              {number(num(age.sample))}
            </p>
          </>
        ) : (
          <Empty />
        )}
      </Card>
    </div>
  );
}
function Focus({
  data,
  tz,
  selectedDay,
  select,
}: {
  readonly data: Row;
  readonly tz: string;
  readonly selectedDay: string;
  readonly select: (day: string) => void;
}) {
  const { t, number, duration, day } = useStatisticsText();
  const detail = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const blocks = rows(data.timeline).map((row) => ({
    id: String(row.id),
    start: String(row.start),
    end: typeof row.end === 'string' ? row.end : null,
    minutes: num(row.minutes),
    task_title: typeof row.task_title === 'string' ? row.task_title : null,
  }));
  useEffect(() => {
    if (expanded) detail.current?.focus();
  }, [expanded, selectedDay]);
  return (
    <div className="stats-body">
      <div className="stats-kpi-grid is-four">
        <Kpi label={t('focusTime')} value={duration(num(data.focus_minutes))} />
        <Kpi label={t('pomodoros')} value={number(num(data.pomodoros))} />
        <Kpi
          label={t('quality')}
          hint={`${number(num(data.completed_sessions))}/${number(num(data.completed_sessions) + num(data.abandoned_sessions))} ${t('sessions')}`}
          value={data.completed_percent === null ? '—' : `${number(num(data.completed_percent))} %`}
        />
        <Kpi label={t('interruptions')} value={number(num(data.interruptions_per_session))} />
      </div>
      <Card title={t('focusTrend')} span={8}>
        {num(data.focus_seconds) > 0 ? (
          <Charts.FocusTrendChart data={graphRows(data.trend)} />
        ) : (
          <Empty kind="focus" />
        )}
      </Card>
      <Card title={t('bestHour')} span={4}>
        {num(data.focus_seconds) >= 25 * 60 ? (
          <Charts.HourHistogram data={graphRows(data.hours)} bestHour={nullable(data.best_hour)} />
        ) : (
          <p className="stats-empty">{t('insufficient')}</p>
        )}
      </Card>
      <Card title={t('timeline')}>
        <label className="stats-select-day">
          {t('selectDay')}
          <input
            type="date"
            value={selectedDay}
            onChange={(event) => {
              if (validDay(event.target.value)) select(event.target.value);
            }}
          />
        </label>
        <PeriodTimeline data={rows(data.period_timeline)} tz={tz} />
        <details>
          <summary>
            {t('selectDay')}: {day(selectedDay)}
          </summary>
          <DayTimeline day={selectedDay} blocks={blocks} tz={tz} />
        </details>
      </Card>
      <Card title={t('annual')}>
        <YearHeatmap
          cells={rows(data.heatmap).map((row) => ({
            date: String(row.date),
            minutes: num(row.minutes),
            pomodoros: num(row.pomodoros),
            level: num(row.level),
          }))}
          onSelect={(cell) => {
            select(cell.date);
            setExpanded(true);
          }}
        />
        {expanded ? (
          <div
            ref={detail}
            tabIndex={-1}
            className="stats-day-detail"
            role="dialog"
            aria-label={`${t('sessions')} ${day(selectedDay)}`}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setExpanded(false);
            }}
          >
            <h3>{day(selectedDay)}</h3>
            {blocks.length === 0 ? (
              <p>{t('empty')}</p>
            ) : (
              <ul>
                {blocks.map((block) => (
                  <li key={block.id}>
                    {new Date(block.start).toLocaleTimeString(undefined, {
                      timeZone: tz,
                      hour: '2-digit',
                      minute: '2-digit',
                    })}{' '}
                    · {block.task_title ?? t('noTask')} · {duration(block.minutes)}
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => {
                setExpanded(false);
              }}
            >
              {t('close')}
            </button>
          </div>
        ) : null}
      </Card>
      {(['by_list', 'by_tag', 'by_task'] as const).map((key, index) => (
        <Card
          key={key}
          title={t((['byList', 'byTag', 'byTask'] as const)[index] ?? 'byTask')}
          span={key === 'by_task' ? 12 : 6}
        >
          <Distribution rows={rows(data[key])} unit="min" />
        </Card>
      ))}
      <p className="stats-caption stats-span-12">{t('precision')}</p>
    </div>
  );
}
function PeriodTimeline({ data, tz }: { readonly data: readonly Row[]; readonly tz: string }) {
  const { t, day } = useStatisticsText();
  const groups = new Map<string, Row[]>();
  for (const row of data) {
    const key = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(String(row.start)));
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return data.length === 0 ? (
    <Empty kind="focus" />
  ) : (
    <>
      {[...groups]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, items]) => (
          <section key={date}>
            <h3>{day(date)}</h3>
            <DayTimeline
              day={date}
              tz={tz}
              blocks={items.map((row) => ({
                id: String(row.id),
                start: String(row.start),
                end: typeof row.end === 'string' ? row.end : null,
                minutes: num(row.minutes),
                task_title: typeof row.task_title === 'string' ? row.task_title : null,
              }))}
            />
          </section>
        ))}
      <p className="stats-caption">{t('precision')}</p>
    </>
  );
}
function Habits({ data }: { readonly data: Row }) {
  const { t, number, weekday } = useStatisticsText();
  const filter = useContext(FilterContext);
  const cards = rows(data.habits);
  return (
    <div className="stats-body">
      {filter.active ? <p className="stats-note stats-span-12">{t('ignored')}</p> : null}
      <Card title={t('global')}>
        {cards.length ? (
          <Charts.HabitLineChart data={graphRows(data.global_series)} />
        ) : (
          <Empty kind="habits" />
        )}
      </Card>
      {cards.map((habit) => (
        <Card key={String(habit.id)} title={`${text(habit.icon)} ${String(habit.name)}`} span={4}>
          <p className="stats-habit-metrics">
            <Flame size={16} />
            {number(num(habit.streak_current))} · {t('best')} {number(num(habit.streak_best))} ·{' '}
            {number(num(habit.percent))} %
          </p>
          <YearHeatmap
            {...(typeof habit.color === 'string' ? { color: habit.color } : {})}
            cells={rows(habit.heatmap).map((row) => ({
              date: String(row.date),
              count: num(row.count),
              level: num(row.level),
            }))}
          />
        </Card>
      ))}
      {cards.length ? (
        <Card title={t('ranking')}>
          <DataTable
            caption={t('ranking')}
            headers={[t('habits'), t('percent'), t('weakest')]}
            rows={[...cards]
              .sort((a, b) => num(b.percent) - num(a.percent))
              .map((habit) => [
                String(habit.name),
                `${number(num(habit.percent))} %`,
                habit.weakest_weekday === null ? '—' : weekday(num(habit.weakest_weekday)),
              ])}
          />
          <ol>
            {[...cards]
              .sort((a, b) => num(b.percent) - num(a.percent))
              .map((habit) => (
                <li key={String(habit.id)}>
                  {String(habit.name)} · {number(num(habit.percent))} % · {t('weakest')}:{' '}
                  {habit.weakest_weekday === null ? '—' : weekday(num(habit.weakest_weekday))}
                </li>
              ))}
          </ol>
        </Card>
      ) : null}
    </div>
  );
}
function Distribution({
  rows: items,
  priority = false,
  unit = '',
}: {
  readonly rows: readonly Row[];
  readonly priority?: boolean;
  readonly unit?: string;
}) {
  const theme = useChartTheme();
  const { t, number } = useStatisticsText();
  if (items.length === 0) return <Empty />;
  const label = (row: Row) =>
    priority
      ? t(String(row.key) as 'high' | 'medium' | 'low' | 'none')
      : row.key === 'other'
        ? t('other')
        : row.key === 'none'
          ? t('noTask')
          : row.label === 'Sin etiqueta'
            ? t('noTag')
            : String(row.label);
  return (
    <>
      <ul className="stats-bars">
        {items.map((row, index) => (
          <li key={String(row.key)}>
            <span className="stats-bars-label">{label(row)}</span>
            <span className="stats-bars-track">
              <span
                style={{
                  width: `${String(num(row.percent))}%`,
                  background: priority
                    ? theme.prio[String(row.key) as 'high' | 'medium' | 'low' | 'none']
                    : row.key === 'other' || row.key === 'none'
                      ? theme.charts[7]
                      : typeof row.color === 'string'
                        ? row.color
                        : theme.charts[index % 7],
                }}
              />
            </span>
            <span className="stats-bars-value">
              {number(num(row.value))} {unit} · {number(num(row.percent))} %
            </span>
          </li>
        ))}
      </ul>
      <DataTable
        caption={t('value')}
        headers={[t('value'), unit || t('completed'), t('percent')]}
        rows={items.map((row) => [
          label(row),
          number(num(row.value)),
          `${number(num(row.percent))} %`,
        ])}
      />
    </>
  );
}
function Skeleton() {
  const { t } = useStatisticsText();
  return (
    <div className="stats-body" aria-label={t('loading')}>
      <div className="stats-kpi-grid">
        {Array.from({ length: 6 }, (_, i) => (
          <div className="stats-skeleton kpi" key={i} />
        ))}
      </div>
      <div className="stats-skeleton chart stats-span-12" />
    </div>
  );
}
function weekdayName(value: number) {
  return new Date(Date.UTC(2026, 9, 18 + value)).toLocaleDateString(
    document.documentElement.lang || 'es-ES',
    { weekday: 'short', timeZone: 'UTC' },
  );
}
function record(value: unknown): Row {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Row) : {};
}
function rows(value: unknown): Row[] {
  return Array.isArray(value)
    ? value.filter((row): row is Row => typeof row === 'object' && row !== null)
    : [];
}
function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
function nullable(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}
function graphRows(value: unknown): Record<string, string | number | null>[] {
  return rows(value).map((row) =>
    Object.fromEntries(
      Object.entries(row).filter(
        (entry): entry is [string, string | number | null] =>
          typeof entry[1] === 'string' || typeof entry[1] === 'number' || entry[1] === null,
      ),
    ),
  );
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
