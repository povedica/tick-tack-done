import { api } from '../../api';

export interface StatsParams {
  readonly from: string;
  readonly to: string;
  readonly tz: string;
  readonly list?: string;
  readonly tag?: string;
  readonly priority?: string;
  readonly type?: string;
  readonly day?: string;
}

function qs(params: StatsParams & { format?: string }): string {
  const search = new URLSearchParams();
  search.set('from', params.from);
  search.set('to', params.to);
  search.set('tz', params.tz);
  if (params.list !== undefined && params.list.length > 0) {
    search.set('list', params.list);
  }
  if (params.tag !== undefined && params.tag.length > 0) {
    search.set('tag', params.tag);
  }
  if (params.priority !== undefined && params.priority.length > 0) {
    search.set('priority', params.priority);
  }
  if (params.type !== undefined && params.type.length > 0) {
    search.set('type', params.type);
  }
  if (params.day) search.set('day', params.day);
  if (params.format !== undefined) {
    search.set('format', params.format);
  }
  return search.toString();
}

export const statsApi = {
  overview: (params: StatsParams) => api.statsOverview(qs(params)),
  tasks: (params: StatsParams) => api.statsTasks(qs(params)),
  focus: (params: StatsParams) => api.statsFocus(qs(params)),
  habits: (params: StatsParams) => api.statsHabits(qs(params)),
  achievement: () => api.statsAchievement(),
  export: (params: StatsParams, format: 'csv' | 'json') =>
    api.statsExport(`${qs(params)}&format=${format}`),
};

/** RF-2324: browser-local export from the exact TanStack Query data shown on screen. */
export function createStatisticsFile(
  payload: {
    overview: Record<string, unknown>;
    tasks: Record<string, unknown>;
    focus: Record<string, unknown>;
    habits: Record<string, unknown>;
    from: string;
    to: string;
  },
  format: 'csv' | 'json',
): Blob {
  if (format === 'json')
    return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const daily = Array.isArray(payload.overview.daily)
    ? (payload.overview.daily as Record<string, unknown>[])
    : [];
  const s = payload.overview.summary as Record<string, unknown>;
  const lines = [
    'date,completed,created,completion_completed,planned,completion_rate,focus_seconds,focus_minutes,pomodoros,habit_percent',
    ...daily.map((row) =>
      [
        row.date,
        row.completed,
        row.created,
        row.completion_completed,
        row.planned,
        Number(row.planned) === 0
          ? ''
          : (Number(row.completion_completed) / Number(row.planned)) * 100,
        row.focus_seconds,
        row.focus_minutes,
        row.pomodoros,
        row.habit_percent ?? '',
      ].join(','),
    ),
    [
      'TOTAL',
      s.completed,
      daily.reduce((sum, row) => sum + Number(row.created), 0),
      s.completion_completed,
      s.completion_planned,
      s.completion_rate ?? '',
      payload.focus.focus_seconds,
      s.focus_minutes,
      s.pomodoros,
      s.habit_percent,
    ].join(','),
  ];
  return new Blob([lines.join('\n') + '\n'], { type: 'text/csv;charset=utf-8' });
}
