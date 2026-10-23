export function statisticsFixture(empty: boolean, from = '2026-10-19', to = '2026-10-25') {
  const first = from;
  const completed = empty ? 0 : 3;
  const planned = empty ? 0 : 4;
  const trend = [{ date: first, completed, created: empty ? 0 : 5 }];
  const daily = [
    {
      date: first,
      completed,
      created: empty ? 0 : 5,
      planned,
      completion_completed: empty ? 0 : 2,
      focus_seconds: empty ? 0 : 1500,
      focus_minutes: empty ? 0 : 25,
      pomodoros: empty ? 0 : 1,
      habit_percent: empty ? null : 100,
    },
  ];
  const heatmap = Array.from({ length: 365 }, (_, index) => ({
    date: new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10),
    minutes: !empty && index === 291 ? 25 : 0,
    pomodoros: !empty && index === 291 ? 1 : 0,
    level: !empty && index === 291 ? 4 : 0,
  }));
  const distribution = empty
    ? []
    : [{ key: 'list', label: 'Trabajo de prueba', color: null, value: 25, percent: 100 }];
  const achievement = {
    enabled: !empty,
    score: 66,
    label: 'Justo',
    components: {
      tasks: { earned: 30, max: 50, configured: true },
      habits: { earned: 16, max: 20, configured: true },
      focus: { earned: 15, max: 20, configured: true },
      usage: { earned: 5, max: 10, configured: true },
    },
    topDeduction: 'Vencidas',
    history: [{ date: first, score: 66 }],
  };
  const summary = {
    completed,
    completed_previous: empty ? 3 : 6,
    completed_delta_percent: empty ? -100 : -50,
    completion_rate: empty ? null : 50,
    completion_rate_delta_pt: empty ? null : 5,
    completion_completed: empty ? 0 : 2,
    completion_planned: planned,
    focus_minutes: empty ? 0 : 25,
    focus_minutes_delta_percent: null,
    pomodoros: empty ? 0 : 1,
    habit_percent: empty ? null : 100,
    habit_done: empty ? 0 : 1,
    habit_expected: empty ? 0 : 1,
    habit_delta_pt: 0,
    streak_current: empty ? 0 : 2,
    streak_best_year: empty ? 0 : 5,
    achievement,
  };
  const timeline = empty
    ? []
    : [
        {
          id: 'session',
          start: `${first}T10:00:00Z`,
          end: `${first}T10:25:00Z`,
          minutes: 25,
          task_title: 'Tarea de prueba',
          completed: true,
        },
      ];
  const habit = {
    id: 'habit',
    name: 'Leer',
    icon: '🌱',
    color: '#1f9d55',
    streak_current: 2,
    streak_best: 5,
    percent: 100,
    done: 1,
    expected: 1,
    heatmap: heatmap.map((cell) => ({ ...cell, count: cell.level > 0 ? 1 : 0 })),
    weakest_weekday: 1,
  };
  return {
    overview: {
      summary,
      trend,
      daily,
      completion_series: [
        { date: first, rate: empty ? null : 50, completed: empty ? 0 : 2, planned },
      ],
      best_moment: {
        by_weekday: Array.from({ length: 7 }, (_, i) => ({
          weekday: i + 1,
          completed: !empty && i === 0 ? 3 : 0,
        })),
        by_band: { morning: completed, afternoon: 0, evening: 0 },
      },
      phrase: '',
    },
    tasks: {
      trend,
      daily,
      completion_series: [
        { date: first, rate: empty ? null : 50, completed: empty ? 0 : 2, planned },
      ],
      completion_rate: { completed: empty ? 0 : 2, planned, rate: empty ? null : 50 },
      by_list: distribution,
      by_tag: distribution,
      by_priority: empty
        ? []
        : [{ key: 'high', label: 'high', value: 3, percent: 100, color: null }],
      punctuality: {
        sample: completed,
        delay_cap_days: 30,
        capped_samples: empty ? 0 : 1,
        on_time: empty ? 0 : 2,
        late: empty ? 0 : 1,
        on_time_percent: empty ? null : 66.7,
        mean_delay_days: empty ? null : 10,
        median_delay_days: empty ? null : 0,
      },
      age_on_complete: {
        sample: completed,
        mean_days: empty ? null : 4.2,
        median_days: empty ? null : 1,
      },
      overdue_stock: [
        { date: first, under_7: empty ? 0 : 1, days_7_30: empty ? 0 : 2, over_30: empty ? 0 : 3 },
      ],
    },
    focus: {
      focus_minutes: empty ? 0 : 25,
      focus_seconds: empty ? 0 : 1500,
      pomodoros: empty ? 0 : 1,
      completed_sessions: empty ? 0 : 1,
      abandoned_sessions: 0,
      completed_percent: empty ? null : 100,
      interruptions_per_session: empty ? 0 : 0.5,
      trend: [{ date: first, minutes: empty ? 0 : 25, pomodoros: empty ? 0 : 1 }],
      best_hour: empty ? null : 12,
      hours: Array.from({ length: 24 }, (_, hour) => ({
        hour,
        minutes: !empty && hour === 12 ? 25 : 0,
      })),
      timeline_day: first,
      timeline,
      period_timeline: timeline,
      heatmap,
      by_list: distribution,
      by_tag: distribution,
      by_task: distribution,
    },
    habits: {
      habits: empty ? [] : [habit],
      ranking_best: empty ? [] : [habit],
      ranking_worst: empty ? [] : [habit],
      global_series: [{ date: first, percent: empty ? null : 100 }],
    },
    from,
    to,
  };
}
