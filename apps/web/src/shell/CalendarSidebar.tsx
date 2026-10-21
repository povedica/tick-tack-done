import { useMessages } from '../i18n';

/**
 * TTD-AUD-61: calendar-specific secondary sidebar.
 * Mini-month and source checkboxes land in a follow-up; for now the slot
 * replaces the tasks sidebar so calendar is not stuck on the tasks nav.
 */
export function CalendarSidebar({
  collapsed,
  concealed,
  onNavigate,
}: {
  readonly collapsed: boolean;
  readonly concealed: boolean;
  readonly onNavigate?: () => void;
}) {
  const messages = useMessages();
  return (
    <aside
      className="sidebar calendar-sidebar"
      data-collapsed={collapsed ? 'true' : 'false'}
      data-concealed={concealed ? 'true' : 'false'}
      aria-label={messages.calendarSidebarTitle}
    >
      <div className="sidebar-block">
        <h2 className="sidebar-heading">{messages.calendarSidebarTitle}</h2>
        <p className="ui-muted">{messages.detailEmptyHint}</p>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            onNavigate?.();
          }}
        >
          {messages.navToday}
        </button>
      </div>
    </aside>
  );
}
