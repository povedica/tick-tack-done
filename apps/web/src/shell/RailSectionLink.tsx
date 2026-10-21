import type { LucideIcon } from 'lucide-react';
import { NavLink, useLocation } from 'react-router';
import { sectionOf } from './section-of';

/** Lucide has outline glyphs: active sections use the heavier-stroke fallback. */
export function RailSectionLink({
  to,
  label,
  icon: Icon,
  tasks = false,
}: {
  readonly to: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly tasks?: boolean;
}) {
  const { pathname, search } = useLocation();
  const base = to === '/settings/shortcuts' ? to : `/${to.split('/')[1] ?? ''}`;
  const active = tasks
    ? sectionOf(pathname) === 'tasks'
    : pathname === base || pathname.startsWith(`${base}/`);
  return (
    <NavLink
      to={active ? { pathname, search } : to}
      aria-label={label}
      data-rail-tooltip={label}
      aria-current={active ? 'page' : undefined}
      className={() => `rail-section ${active ? 'rail-section-active' : 'rail-section-inactive'}`}
    >
      <Icon
        size={20}
        aria-hidden="true"
        strokeWidth={active ? 3 : 2}
        data-variant={active ? 'heavy' : 'outline'}
      />
    </NavLink>
  );
}
