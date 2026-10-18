export interface AppRoute {
  readonly path: string;
  readonly titleKey:
    | 'todayTitle'
    | 'captureTitle'
    | 'inboxTitle'
    | 'listTitle'
    | 'noteTitle'
    | 'filterTitle'
    | 'smartTitle'
    | 'taskTitle'
    | 'habitsTitle'
    | 'habitTitle'
    | 'calendarTitle'
    | 'matrixTitle'
    | 'focusTitle'
    | 'dashboardTitle'
    | 'reportsTitle'
    | 'reportTitle'
    | 'reviewTitle'
    | 'searchTitle'
    | 'appearanceTitle'
    | 'settingsTitle'
    | 'loginTitle'
    | 'registerTitle'
    | 'forgotTitle'
    | 'repeatTitle';
}

/** Stable paths from the UI spec map. Direct loads must resolve (UI-101). */
export const APP_ROUTES: readonly AppRoute[] = [
  { path: '/today', titleKey: 'todayTitle' },
  { path: '/quick-add', titleKey: 'captureTitle' },
  { path: '/inbox', titleKey: 'inboxTitle' },
  { path: '/list/:id', titleKey: 'listTitle' },
  { path: '/list/:id/note/:taskId', titleKey: 'noteTitle' },
  { path: '/filter/:id', titleKey: 'filterTitle' },
  { path: '/smart/:key', titleKey: 'smartTitle' },
  { path: '/task/:id', titleKey: 'taskTitle' },
  { path: '/habits', titleKey: 'habitsTitle' },
  { path: '/habits/:id', titleKey: 'habitTitle' },
  { path: '/calendar/:view', titleKey: 'calendarTitle' },
  { path: '/matrix', titleKey: 'matrixTitle' },
  { path: '/focus', titleKey: 'focusTitle' },
  { path: '/dashboard', titleKey: 'dashboardTitle' },
  { path: '/reports/weekly', titleKey: 'reportsTitle' },
  { path: '/reports/weekly/:week', titleKey: 'reportTitle' },
  { path: '/review/weekly', titleKey: 'reviewTitle' },
  { path: '/search', titleKey: 'searchTitle' },
  { path: '/settings/appearance', titleKey: 'appearanceTitle' },
  { path: '/settings/*', titleKey: 'settingsTitle' },
  { path: '/repeat', titleKey: 'repeatTitle' },
  { path: '/login', titleKey: 'loginTitle' },
  { path: '/register', titleKey: 'registerTitle' },
  { path: '/forgot-password', titleKey: 'forgotTitle' },
];

export interface SidebarLink {
  readonly to: string;
  readonly labelKey:
    | 'navToday'
    | 'navTomorrow'
    | 'navNext7'
    | 'navAll'
    | 'navInbox'
    | 'navNoDate'
    | 'navRecent'
    | 'navCompleted'
    | 'navTrash'
    | 'navHabits';
}

export const SIDEBAR_LINKS: readonly SidebarLink[] = [
  { to: '/today', labelKey: 'navToday' },
  { to: '/smart/tomorrow', labelKey: 'navTomorrow' },
  { to: '/smart/next7', labelKey: 'navNext7' },
  { to: '/smart/all', labelKey: 'navAll' },
  { to: '/inbox', labelKey: 'navInbox' },
  { to: '/smart/no-date', labelKey: 'navNoDate' },
  { to: '/smart/recent', labelKey: 'navRecent' },
  { to: '/smart/completed', labelKey: 'navCompleted' },
  { to: '/smart/trash', labelKey: 'navTrash' },
  { to: '/habits', labelKey: 'navHabits' },
];
