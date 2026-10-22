import type { Page } from '@playwright/test';
export async function r80Fixture(
  page: Page,
  options: {
    anchorWarning?: boolean;
    count?: number;
    duration?: number;
    delayed?: boolean;
    error?: boolean;
    startOnly?: boolean;
    bars?: number;
    filtering?: boolean;
    allDayEvents?: boolean;
    lateTask?: boolean;
  } = {},
) {
  const task = {
    id: 'task',
    project_id: 'list',
    parent_id: null,
    column_id: null,
    title: 'Tarea sintética con título largo que conserva toda su información en el calendario',
    content: '',
    status: 'active',
    kind: 'task',
    priority: 'high',
    due_date: options.anchorWarning ? '2026-10-19T22:00:00Z' : '2026-10-22T08:00:00Z',
    start_date: null,
    time_zone: 'Europe/Madrid',
    is_all_day: options.anchorWarning ?? false,
    repeat_rule: options.anchorWarning ? 'RRULE:FREQ=WEEKLY;BYDAY=MO' : null,
    tag_ids: options.filtering ? ['tag'] : [],
    checklist_progress: { completed: 0, total: 0 },
    duration_minutes: options.duration ?? 60,
    completed_at: null,
    created_at: '2026-10-01T08:00:00Z',
    source: 'manual',
  };
  if (options.lateTask) {
    task.due_date = '2026-10-22T21:00:00Z';
    task.title = 'Revisando la app ticktackdone';
  }
  const base = {
    subscription_id: 'cal',
    calendar_id: 'cal',
    provider: 'google',
    time_zone: 'Europe/Madrid',
    description: null,
    location: null,
    color: '#0f766e',
    is_all_day: false,
  };
  const external = [
    {
      ...base,
      id: 'midnight',
      title: 'Evento real a medianoche',
      starts_at: '2026-10-19T22:00:00Z',
      ends_at: '2026-10-19T23:00:00Z',
    },
    {
      ...base,
      id: 'overlap',
      color: '#c2410c',
      title: 'Evento simultáneo',
      starts_at: '2026-10-22T08:30:00Z',
      ends_at: '2026-10-22T09:30:00Z',
    },
    {
      ...base,
      id: 'all',
      title: 'Evento de tres días',
      starts_at: '2026-10-18T22:00:00Z',
      ends_at: '2026-10-21T22:00:00Z',
      is_all_day: true,
    },
    {
      ...base,
      id: 'overnight',
      title: 'Evento con hora entre dos días',
      starts_at: '2026-10-22T21:00:00Z',
      ends_at: '2026-10-22T23:00:00Z',
    },
  ];
  await page.clock.install({ time: new Date('2026-10-22T10:00:00Z') });
  await page.addInitScript(() => localStorage.setItem('tick-tack-done.account-prefs', '1'));
  const completed = new Set<string>();
  let icalVisible = true;
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    let body: unknown = { items: [], next_cursor: null };
    if (path === '/auth/session' || path === '/me')
      body = {
        id: 'user',
        display_name: 'Prueba',
        email: 'test@example.test',
        csrf_token: 'test',
        locale: 'es',
        time_zone: 'Europe/Madrid',
        features: {},
      };
    if (path === '/focus/settings')
      body = {
        pomodoroMinutes: 25,
        shortBreakMinutes: 5,
        longBreakMinutes: 15,
        cyclesBeforeLongBreak: 4,
      };
    if (path === '/focus/stats')
      body = {
        today_pomodoros: 0,
        today_focus_seconds: 0,
        completed_pomodoros: 0,
        focus_seconds: 0,
      };
    if (path === '/tasks')
      body = {
        items: [
          task,
          {
            ...task,
            id: 'all-task',
            title: 'Cumpleaños sintético: tarea de todo el día',
            tag_ids: [],
            is_all_day: true,
            due_date: '2026-10-19T22:00:00Z',
          },
        ],
        next_cursor: null,
      };
    if (path === '/filters/preview') body = { groups: [{key:'none', label:'', tasks:[task]}], count:1, group_by:'none', sort:'manual', next_cursor:null };
    if (path === '/tasks/task')
      body = {
        ...task,
        items: [],
        subtasks: [],
        activity: [],
        tags: [],
        attachments: [],
        comments: [],
        reminders: [],
      };
    if (path === '/projects')
      body = {
        items: [
          {
            id: 'list',
            name: 'Lista sintética',
            color: '#4772fa',
            is_inbox: true,
            kind: 'task',
            sort_order: '1',
          },
        ],
        next_cursor: null,
      };
    if (path === '/calendar/events')
      body = {
        external: options.allDayEvents
          ? external.map((event) => (event.id === 'all' ? { ...event, is_all_day: true } : event))
          : external,
        tasks: [],
      };
    if (options.filtering && path === '/tags')
      body = { items: [{ id: 'tag', name: 'Trabajo', color: null }], next_cursor: null };
    if (options.filtering && path === '/filters')
      body = { items: [{ id: 'filter', name: 'Prioridad alta' }], next_cursor: null };
    if (options.filtering && path === '/filters/filter/tasks')
      body = {
        groups: [{ key: 'none', label: '', tasks: [{ id: 'task' }] }],
        count: 1,
        group_by: 'none',
        sort: 'manual',
        next_cursor: null,
      };
    if (path === '/calendar/subscriptions/ical' && route.request().method() === 'PATCH') {
      icalVisible = route.request().postDataJSON().visible;
      body = { id: 'ical', summary: 'iCal sintético', provider: 'ical', visible: icalVisible };
    }
    if (path === '/calendar/subscriptions')
      body = {
        items: [
          {
            id: 'cal',
            summary: 'Calendario sintético',
            visible: true,
            color: '#4772fa',
            provider: 'google',
          },
          ...(options.filtering
            ? [
                {
                  id: 'ical',
                  summary: 'iCal sintético',
                  visible: icalVisible,
                  color: '#0f766e',
                  provider: 'ical',
                },
              ]
            : []),
        ],
        next_cursor: null,
      };
    if (path === '/tasks' && options.count !== undefined)
      body = {
        items: Array.from({ length: options.count }, (_, index) => ({
          ...task,
          id: `density-${index}`,
          title:
            index === 0
              ? 'Breve'
              : `Elemento ${index + 1}: título largo de prueba que necesita varias líneas para mantener toda su información`,
          is_all_day: true,
        })),
        next_cursor: null,
      };
    if (path === '/calendar/events' && options.count !== undefined && !options.allDayEvents)
      body = { external: [], tasks: [] };
    if (options.bars !== undefined && path === '/calendar/events')
      body = {
        tasks: [],
        external: Array.from({ length: options.bars }, (_, index) => ({
          ...external[2],
          id: `bar-${index}`,
          title: `Barra ${index + 1} con título multilínea que ocupa su altura natural sin pisar las otras barras del calendario`,
        })),
      };
    if (options.startOnly && path === '/calendar/events')
      body = {
        external: [],
        tasks: [{ id: 'start-only', start_date: task.due_date, due_date: null }],
      };
    if (path === '/tasks/start-only')
      body = {
        ...task,
        id: 'start-only',
        title: 'Tarea solo con inicio',
        start_date: task.due_date,
        due_date: null,
      };
    if ((path === '/tasks' || path === '/calendar/events') && options.delayed)
      await new Promise((resolve) => setTimeout(resolve, 700));
    if (path === '/calendar/events' && options.error) {
      await route.fulfill({
        status: 503,
        json: { code: 'unavailable', message: 'Prueba sintética' },
      });
      return;
    }
    if (path === '/tasks/task/complete' || path === '/tasks/start-only/complete') {
      completed.add(path.includes('start-only') ? 'start-only' : 'task');
      body = { ...task, status: 'completed' };
    }
    if (path === '/calendar/events' && options.startOnly && completed.has('start-only'))
      body = { external: [], tasks: [] };
    if (path === '/tasks' && completed.size) {
      const result = body as { items: { id: string }[] };
      result.items = result.items.filter((item) => !completed.has(item.id));
    }
    await route.fulfill({ json: body });
  });
}
