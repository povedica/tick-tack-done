import { runAction } from '../components/run-action';
import { ControlChip } from '../features/statistics/ControlSummary';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type CSSProperties } from 'react';
import { Outlet, useLocation, useSearchParams } from 'react-router';
import { api } from '../api';
import { dismissPopover } from '../components/popover-stack';
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
import { CalendarSidebar } from './CalendarSidebar';
import { DetailEmpty } from './DetailEmpty';
import { IconRail } from './IconRail';
import { readSidebarCollapsed, writeSidebarCollapsed } from './sidebar-state';
import { ShellActionsProvider } from './shell-actions';
import { DetailResizer, readDetailWidth, storeDetailWidth } from './DetailResizer';
import { FocusCloser, formatClock, useActiveFocus } from './useActiveFocus';
import { ScreenBoundary } from './ErrorBoundary';
import { sectionOf, sectionShowsDetailPane, sectionShowsSidebar } from './section-of';
import { Sidebar } from './Sidebar';
import { isSidebarShortcut, isTypingTarget } from './shortcuts';

export function AppShell() {
  const messages = useMessages();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const taskId = params.get('task');
  const [collapsed, setCollapsed] = useState(() => readSidebarCollapsed(localStorage));
  const [drawer, setDrawer] = useState(false);
  const [drawerSection, setDrawerSection] = useState<'lists' | 'more'>('lists');
  const narrow = useNarrow();
  const [online, setOnline] = useState(() => navigator.onLine);
  const [detailWidth, setDetailWidth] = useState(() => readDetailWidth(localStorage));
  const section = sectionOf(location.pathname);
  const showSidebar = sectionShowsSidebar(section);
  const showDetailPane = sectionShowsDetailPane(section) && !narrow;
  const sidebarCollapsed = !showSidebar || collapsed;
  const detailOpen = showDetailPane || taskId !== null;

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
        if (dismissPopover()) {
          return;
        }
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
      setDrawerSection('lists');
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
        data-sidebar={sidebarCollapsed ? 'collapsed' : 'expanded'}
        data-section={section}
        data-drawer={drawer ? 'open' : 'closed'}
        data-drawer-section={drawer ? drawerSection : undefined}
        data-detail={detailOpen ? 'open' : 'closed'}
        style={{ '--detail-w': `${String(detailWidth)}px` } as CSSProperties}
      >
        <FocusTitle />
        <IconRail
          collapsed={sidebarCollapsed}
          onToggleCollapsed={toggleNav}
          onCapture={() => {
            closeDrawer();
            openTaskComposer();
          }}
        />
        {section === 'calendar' ? (
          <CalendarSidebar
            collapsed={sidebarCollapsed}
            concealed={narrow ? !drawer : sidebarCollapsed}
            onNavigate={closeDrawer}
          />
        ) : showSidebar ? (
          <Sidebar
            collapsed={sidebarCollapsed}
            mobileSection={narrow ? drawerSection : undefined}
            concealed={narrow ? !drawer : sidebarCollapsed}
            onNavigate={closeDrawer}
          />
        ) : (
          <aside className="sidebar" data-collapsed="true" data-concealed="true" hidden />
        )}
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
          {narrow ? (
            <div className="mobile-control-bar">
              <ControlChip />
            </div>
          ) : null}
          {online ? null : (
            <p className="offline-banner" role="status">
              {messages.offline}. {messages.pendingSync}.
            </p>
          )}
          <LocationWatch />
          <div className="outlet" id="content">
            <ScreenBoundary resetKey={location.pathname}>
              <Outlet />
            </ScreenBoundary>
          </div>
        </div>
        {detailOpen ? (
          <div className="detail-slot">
            <DetailResizer
              width={detailWidth}
              onWidth={(next) => {
                setDetailWidth(next);
                storeDetailWidth(localStorage, next);
              }}
            />
            {taskId !== null ? (
              <TaskDetail taskId={taskId} onClose={closeDetail} />
            ) : (
              <DetailEmpty />
            )}
          </div>
        ) : null}
        <FocusCloser />
        <BottomBar
          openSection={drawer ? drawerSection : null}
          onOpenLists={() => {
            setDrawerSection('lists');
            setDrawer(!drawer || drawerSection !== 'lists');
          }}
          onOpenMore={() => {
            setDrawerSection('more');
            setDrawer(!drawer || drawerSection !== 'more');
          }}
        />
        <ActionToast />
        <CaptureHost />
      </div>
    </ShellActionsProvider>
  );
}

function FocusTitle() {
  const focus = useActiveFocus();
  const task = useQuery({
    queryKey: ['task', focus?.taskId],
    queryFn: () => api.taskDetail(focus?.taskId ?? ''),
    enabled: focus?.taskId !== null && focus?.taskId !== undefined,
  });
  const remaining = focus?.remaining ?? null;
  const taskTitle = task.data?.title ?? '';
  useEffect(() => {
    if (remaining === null) {
      document.title = 'tick-tack-done';
      return;
    }
    document.title =
      taskTitle.length > 0 ? `${formatClock(remaining)} · ${taskTitle}` : formatClock(remaining);
  }, [remaining, taskTitle]);
  return null;
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
        runAction(refreshTaskSurfaces(queryClient));
      }}
    />
  );
}

function ActionToast() {
  const messages = useMessages();
  const text = useActionToast((state) => state.text);
  const tone = useActionToast((state) => state.tone);
  const undo = useActionToast((state) => state.undo);
  const clear = useActionToast((state) => state.clear);
  useEffect(() => {
    if (text === null) {
      return;
    }
    const id = window.setTimeout(clear, tone === 'error' ? 8000 : 4000);
    return () => {
      window.clearTimeout(id);
    };
  }, [text, clear, tone]);
  if (text === null) {
    return null;
  }
  return (
    <div className="toast-stack">
      <p className="toast" role={tone === 'error' ? 'alert' : 'status'}>
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
