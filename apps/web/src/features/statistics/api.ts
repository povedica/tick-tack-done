import { api } from '../../api';

export interface StatsParams {
  readonly from: string;
  readonly to: string;
  readonly tz: string;
  readonly list?: string;
  readonly tag?: string;
  readonly priority?: string;
  readonly type?: string;
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
  async export(params: StatsParams, format: 'csv' | 'json'): Promise<Blob> {
    const response = await fetch(`/api/v1/stats/export?${qs({ ...params, format })}`, {
      credentials: 'include',
    });
    if (!response.ok) {
      throw new Error(`export_${String(response.status)}`);
    }
    return response.blob();
  },
};
