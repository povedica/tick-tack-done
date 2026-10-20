import {
  Award,
  CalendarCheck,
  CalendarDays,
  CircleDot,
  Grid2x2,
  Hourglass,
  LayoutDashboard,
  List,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  Sun,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink } from 'react-router';
import { openTaskComposer } from '../features/capture/notice';
import { useFeatures } from '../features/settings/feature-flags';
import { useMessages } from '../i18n';

export function BottomBar({ onOpenLists }: { readonly onOpenLists: () => void }) {
  const messages = useMessages();
  const flags = useFeatures((state) => state.flags);
  const [more, setMore] = useState(false);

  useEffect(() => {
    if (!more) {
      return;
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setMore(false);
      }
    };
    const onDown = (event: MouseEvent): void => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (target.closest('.more-sheet') !== null || target.closest('[data-more-toggle]') !== null) {
        return;
      }
      setMore(false);
    };
    const onPop = (): void => {
      setMore(false);
    };
    history.pushState({ moreSheet: true }, '');
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('popstate', onPop);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('popstate', onPop);
    };
  }, [more]);

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
          openTaskComposer();
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
        data-more-toggle=""
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
          <SheetLink
            to="/search"
            label={messages.navSearch}
            icon={Search}
            onDone={() => {
              setMore(false);
            }}
          />
          <SheetLink
            to="/habits"
            label={messages.navHabits}
            icon={CalendarCheck}
            onDone={() => {
              setMore(false);
            }}
          />
          {flags.matrix ? (
            <SheetLink
              to="/matrix"
              label={messages.navMatrix}
              icon={Grid2x2}
              onDone={() => {
                setMore(false);
              }}
            />
          ) : null}
          {flags.focus ? (
            <SheetLink
              to="/focus"
              label={messages.navFocus}
              icon={CircleDot}
              onDone={() => {
                setMore(false);
              }}
            />
          ) : null}
          {flags.countdowns ? (
            <SheetLink
              to="/countdowns"
              label={messages.navCountdowns}
              icon={Hourglass}
              onDone={() => {
                setMore(false);
              }}
            />
          ) : null}
          <SheetLink
            to="/dashboard"
            label={messages.navDashboard}
            icon={LayoutDashboard}
            onDone={() => {
              setMore(false);
            }}
          />
          <SheetLink
            to="/statistics"
            label={messages.navStatistics}
            icon={Award}
            onDone={() => {
              setMore(false);
            }}
          />
          <SheetLink
            to="/reports/weekly"
            label={messages.navReports}
            icon={LayoutDashboard}
            onDone={() => {
              setMore(false);
            }}
          />
          <SheetLink
            to="/review/weekly"
            label={messages.navReview}
            icon={CalendarCheck}
            onDone={() => {
              setMore(false);
            }}
          />
          <SheetLink
            to="/filters"
            label={messages.filtersTitle}
            icon={List}
            onDone={() => {
              setMore(false);
            }}
          />
          <SheetLink
            to="/settings/appearance"
            label={messages.navSettings}
            icon={Settings}
            onDone={() => {
              setMore(false);
            }}
          />
        </div>
      ) : null}
    </nav>
  );
}

function SheetLink({
  to,
  label,
  icon: Icon,
  onDone,
}: {
  readonly to: string;
  readonly label: string;
  readonly icon: typeof Sun;
  readonly onDone: () => void;
}) {
  return (
    <NavLink to={to} onClick={onDone}>
      <Icon size={18} aria-hidden="true" />
      {label}
    </NavLink>
  );
}
