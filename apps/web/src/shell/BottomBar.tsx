import { CalendarDays, List, MoreHorizontal, Plus, Sun } from 'lucide-react';
import { useState } from 'react';
import { NavLink } from 'react-router';
import { useCaptureOpen } from '../features/capture/notice';
import { useMessages } from '../i18n';

export function BottomBar({ onOpenLists }: { readonly onOpenLists: () => void }) {
  const messages = useMessages();
  const showCapture = useCaptureOpen((state) => state.show);
  const [more, setMore] = useState(false);

  return (
    <nav className="bottom-bar" aria-label={messages.navLists}>
      <NavLink to="/today" end className={({ isActive }) => (isActive ? 'is-active' : undefined)}>
        <Sun size={20} aria-hidden="true" />
        {messages.navToday}
      </NavLink>
      <NavLink
        to="/calendar/month"
        className={({ isActive }) => (isActive ? 'is-active' : undefined)}
      >
        <CalendarDays size={20} aria-hidden="true" />
        {messages.navCalendar}
      </NavLink>
      <button
        type="button"
        className="fab-slot"
        aria-label={messages.fab}
        aria-keyshortcuts="N"
        onClick={() => {
          showCapture();
        }}
      >
        <Plus size={22} aria-hidden="true" />
      </button>
      <button type="button" onClick={onOpenLists}>
        <List size={20} aria-hidden="true" />
        {messages.navLists}
      </button>
      <button
        type="button"
        aria-expanded={more}
        onClick={() => {
          setMore((current) => !current);
        }}
      >
        <MoreHorizontal size={20} aria-hidden="true" />
        {messages.navMore}
      </button>
      {more ? (
        <div className="more-sheet">
          <NavLink
            to="/search"
            onClick={() => {
              setMore(false);
            }}
          >
            {messages.navSearch}
          </NavLink>
          <NavLink
            to="/habits"
            onClick={() => {
              setMore(false);
            }}
          >
            {messages.navHabits}
          </NavLink>
          <NavLink
            to="/filters"
            onClick={() => {
              setMore(false);
            }}
          >
            {messages.filtersTitle}
          </NavLink>
          <NavLink
            to="/settings/appearance"
            onClick={() => {
              setMore(false);
            }}
          >
            {messages.navSettings}
          </NavLink>
        </div>
      ) : null}
    </nav>
  );
}
