import {
  BarChart3,
  CalendarCheck,
  CalendarDays,
  CircleDot,
  ClipboardList,
  Grid2x2,
  Hourglass,
  LayoutDashboard,
  MessageSquare,
  Search,
} from 'lucide-react';
import type { NavigationModule } from '@reflexionia/domain';
import type { Messages } from '../i18n';
import type { FeatureFlags } from '../features/settings/feature-flags';

export const MODULES = {
  calendar: { to: '/calendar/month', label: 'navCalendar', icon: CalendarDays },
  matrix: { to: '/matrix', label: 'navMatrix', icon: Grid2x2 },
  countdowns: { to: '/countdowns', label: 'navCountdowns', icon: Hourglass },
  focus: { to: '/focus', label: 'navFocus', icon: CircleDot },
  habits: { to: '/habits', label: 'navHabits', icon: CalendarCheck },
  ticky: { to: '/ticky', label: 'navTicky', icon: MessageSquare },
  statistics: { to: '/statistics', label: 'navStatistics', icon: BarChart3 },
  dashboard: { to: '/dashboard', label: 'navDashboard', icon: LayoutDashboard },
  reports: { to: '/reports/weekly', label: 'navReports', icon: BarChart3 },
  review: { to: '/review/weekly', label: 'navReview', icon: ClipboardList },
  search: { to: '/search', label: 'navSearch', icon: Search },
} satisfies Record<NavigationModule, { to: string; label: keyof Messages; icon: typeof Search }>;

export function moduleEnabled(
  key: NavigationModule,
  flags: FeatureFlags,
  tickyAvailable = false,
): boolean {
  if (key === 'ticky') return tickyAvailable;
  return key === 'matrix' || key === 'focus' || key === 'countdowns' ? flags[key] : true;
}
