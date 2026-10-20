import { describe, it, expect } from 'vitest';
import { createStatisticsFile } from './api';
describe('RF-2324 local statistics export', () => {
  it('RF-2324: CSV uses the same cohort and exact seconds as the displayed query data', async () => {
    const payload = {
      from: '2026-10-19',
      to: '2026-10-20',
      overview: {
        summary: {
          completed: 2,
          completion_completed: 1,
          completion_planned: 1,
          completion_rate: 100,
          focus_minutes: 58 / 60,
          pomodoros: 2,
          habit_percent: null,
        },
        daily: [
          {
            date: '2026-10-19',
            completed: 2,
            created: 0,
            completion_completed: 1,
            planned: 1,
            focus_seconds: 29,
            focus_minutes: 29 / 60,
            pomodoros: 1,
            habit_percent: null,
          },
          {
            date: '2026-10-20',
            completed: 0,
            created: 0,
            completion_completed: 0,
            planned: 0,
            focus_seconds: 29,
            focus_minutes: 29 / 60,
            pomodoros: 1,
            habit_percent: null,
          },
        ],
      },
      tasks: {},
      focus: { focus_seconds: 58 },
      habits: {},
    };
    const csv = await createStatisticsFile(payload, 'csv').text();
    expect(csv).toContain('TOTAL,2,0,1,1,100,58,');
    expect(csv.split('\n')).toHaveLength(5);
    expect(JSON.parse(await createStatisticsFile(payload, 'json').text())).toEqual(payload);
  });
});
