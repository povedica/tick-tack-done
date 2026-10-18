import { useEffect, useState } from 'react';
import { Outlet, useNavigate, useSearchParams } from 'react-router';
import { LocationWatch } from '../features/product/ProductPages';
import { TaskDetail } from '../features/tasks/TaskDetail';
import { useMessages } from '../i18n';
import { BottomBar } from './BottomBar';
import { IconRail } from './IconRail';
import { readSidebarCollapsed, writeSidebarCollapsed } from './sidebar-state';
import { ShellActionsProvider } from './shell-actions';
import { Sidebar } from './Sidebar';
import { isSidebarShortcut, isTypingTarget } from './shortcuts';

export function AppShell() {
  const messages = useMessages();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const taskId = params.get('task');
  const [collapsed, setCollapsed] = useState(() => readSidebarCollapsed(localStorage));
  const [drawer, setDrawer] = useState(false);
  const narrow = useNarrow();
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const on = (): void => {
      setOnline(true);
    };
    const off = (): void => {
      setOnline(false);
    };
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  function toggleCollapsed(): void {
    setCollapsed((current) => {
      const next = !current;
      writeSidebarCollapsed(localStorage, next);
      return next;
    });
  }

  function closeDrawer(): void {
    setDrawer(false);
  }

  function closeDetail(): void {
    const next = new URLSearchParams(params);
    next.delete('task');
    setParams(next, { replace: true });
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      const typing = isTypingTarget(event.target);
      if (event.key === 'Escape') {
        if (drawer) {
          setDrawer(false);
          return;
        }
        if (taskId !== null && !typing) {
          const next = new URLSearchParams(params);
          next.delete('task');
          setParams(next, { replace: true });
        }
        return;
      }
      if (
        isSidebarShortcut({
          key: event.key,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          typing,
        })
      ) {
        event.preventDefault();
        setCollapsed((current) => {
          const next = !current;
          writeSidebarCollapsed(localStorage, next);
          return next;
        });
      }
    }
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [drawer, params, setParams, taskId]);

  function toggleNav(): void {
    if (narrow) {
      setDrawer((current) => !current);
      return;
    }
    toggleCollapsed();
  }

  return (
    <ShellActionsProvider
      value={{
        toggleNav,
        navLabel: collapsed ? messages.expandSidebar : messages.collapseSidebar,
      }}
    >
      <div
        className="shell"
        data-sidebar={collapsed ? 'collapsed' : 'expanded'}
        data-drawer={drawer ? 'open' : 'closed'}
        data-detail={taskId === null ? 'closed' : 'open'}
      >
        <IconRail
          collapsed={collapsed}
          onToggleCollapsed={toggleNav}
          onCapture={() => {
            closeDrawer();
            void navigate('/quick-add');
          }}
        />
        <Sidebar
          collapsed={collapsed}
          concealed={narrow ? !drawer : collapsed}
          onToggleCollapsed={toggleCollapsed}
          onNavigate={closeDrawer}
        />
        <a className="skip-link" href="#content">
          {messages.skip}
        </a>
        <button
          type="button"
          className="scrim"
          aria-label={messages.closeMenu}
          onClick={() => {
            closeDrawer();
            if (taskId !== null) {
              closeDetail();
            }
          }}
        />
        <div className="center">
          {online ? null : (
            <p className="offline-banner" role="status">
              {messages.offline}. {messages.pendingSync}.
            </p>
          )}
          <LocationWatch />
          <div className="outlet" id="content">
            <Outlet />
          </div>
        </div>
        {taskId !== null ? <TaskDetail taskId={taskId} onClose={closeDetail} /> : null}
        <BottomBar
          onOpenLists={() => {
            setDrawer(true);
          }}
        />
      </div>
    </ShellActionsProvider>
  );
}

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 1023px)');
    const apply = (): void => {
      setNarrow(query.matches);
    };
    apply();
    query.addEventListener('change', apply);
    return () => {
      query.removeEventListener('change', apply);
    };
  }, []);
  return narrow;
}
