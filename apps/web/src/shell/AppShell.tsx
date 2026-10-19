import { useEffect, useState } from 'react';
import { Outlet, useSearchParams } from 'react-router';
import { LocationWatch } from '../features/product/ProductPages';
import { TaskDetail } from '../features/tasks/TaskDetail';
import { useQueryClient } from '@tanstack/react-query';
import { useActionToast } from '../components/action-toast';
import '../components/toast.css';
import { CaptureSheet } from '../features/capture/components/CaptureSheet';
import { openTaskComposer, useCaptureOpen } from '../features/capture/notice';
import { refreshTaskSurfaces } from '../features/tasks/refresh';
import { useMessages } from '../i18n';
import { BottomBar } from './BottomBar';
import { IconRail } from './IconRail';
import { readSidebarCollapsed, writeSidebarCollapsed } from './sidebar-state';
import { ShellActionsProvider } from './shell-actions';
import { Sidebar } from './Sidebar';
import { isSidebarShortcut, isTypingTarget } from './shortcuts';

export function AppShell() {
  const messages = useMessages();
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
            openTaskComposer();
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
        <ActionToast />
        <CaptureHost />
      </div>
    </ShellActionsProvider>
  );
}

function CaptureHost() {
  const open = useCaptureOpen((state) => state.open);
  const text = useCaptureOpen((state) => state.text);
  const hide = useCaptureOpen((state) => state.hide);
  const queryClient = useQueryClient();
  const showToast = useActionToast((state) => state.show);
  if (!open) {
    return null;
  }
  return (
    <CaptureSheet
      initialText={text}
      onClose={hide}
      onCreated={(created) => {
        const warning = created.warnings
          .map((item) => item.name)
          .filter((name): name is string => name !== undefined)
          .join(', ');
        showToast(warning.length > 0 ? `${created.title} · ${warning}` : created.title);
        hide();
        void refreshTaskSurfaces(queryClient);
      }}
    />
  );
}

function ActionToast() {
  const messages = useMessages();
  const text = useActionToast((state) => state.text);
  const undo = useActionToast((state) => state.undo);
  const clear = useActionToast((state) => state.clear);
  useEffect(() => {
    if (text === null) {
      return;
    }
    const id = window.setTimeout(clear, 4000);
    return () => {
      window.clearTimeout(id);
    };
  }, [text, clear]);
  if (text === null) {
    return null;
  }
  return (
    <div className="toast-stack">
      <p className="toast" role="status">
        <span>{text}</span>
        {undo === null ? null : (
          <button
            type="button"
            onClick={() => {
              undo();
              clear();
            }}
          >
            {messages.undo}
          </button>
        )}
      </p>
    </div>
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
