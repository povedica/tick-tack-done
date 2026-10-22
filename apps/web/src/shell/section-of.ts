export type ShellSection =
  | 'tasks'
  | 'calendar'
  | 'matrix'
  | 'focus'
  | 'habits'
  | 'countdowns'
  | 'stats'
  | 'search'
  | 'settings'
  | 'ticky'
  | 'other';

/** TTD-AUD-61: map the current path to the primary shell section. */
export function sectionOf(pathname: string): ShellSection {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path.startsWith('/calendar')) {
    return 'calendar';
  }
  if (path.startsWith('/matrix')) {
    return 'matrix';
  }
  if (path.startsWith('/focus')) {
    return 'focus';
  }
  if (path.startsWith('/habits')) {
    return 'habits';
  }
  if (path.startsWith('/countdowns')) {
    return 'countdowns';
  }
  if (path.startsWith('/statistics') || path.startsWith('/reports')) {
    return 'stats';
  }
  if (path.startsWith('/search')) {
    return 'search';
  }
  if (path.startsWith('/settings') || path.startsWith('/me')) {
    return 'settings';
  }
  if (path.startsWith('/ticky')) {
    return 'ticky';
  }
  if (
    path.startsWith('/today') ||
    path.startsWith('/inbox') ||
    path.startsWith('/list') ||
    path.startsWith('/tag') ||
    path.startsWith('/filter') ||
    path.startsWith('/smart') ||
    path.startsWith('/all') ||
    path.startsWith('/plan') ||
    path === '/'
  ) {
    return 'tasks';
  }
  return 'other';
}

/** Sections that keep the secondary sidebar (TTD-AUD-61). */
export function sectionShowsSidebar(section: ShellSection): boolean {
  return section === 'tasks' || section === 'calendar';
}

/** Task-family routes keep a fixed detail column on desktop (TTD-AUD-60). */
export function sectionShowsDetailPane(section: ShellSection): boolean {
  return section === 'tasks';
}
