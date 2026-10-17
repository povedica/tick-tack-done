import { useEffect, useState } from 'react';
import { Outlet, useNavigate, useSearchParams } from 'react-router';
import { messagesFor } from '../i18n';
import { BottomBar } from './BottomBar';
import { readSidebarCollapsed, writeSidebarCollapsed } from './sidebar-state';
import { Sidebar } from './Sidebar';
import { isSidebarShortcut, isTypingTarget } from './shortcuts';

export function AppShell() {
  const messages = messagesFor(navigator.language);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const taskId = params.get('task');
  const [collapsed, setCollapsed] = useState(() => readSidebarCollapsed(localStorage));
  const [drawer, setDrawer] = useState(false);

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

  return (
    <div
      className="shell"
      data-sidebar={collapsed ? 'collapsed' : 'expanded'}
      data-drawer={drawer ? 'open' : 'closed'}
      data-detail={taskId === null ? 'closed' : 'open'}
    >
      <Sidebar
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        onNavigate={closeDrawer}
        onCapture={() => {
          closeDrawer();
          void navigate('/quick-add');
        }}
      />
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
        <div className="outlet">
          <Outlet />
        </div>
      </div>
      {taskId !== null ? (
        <aside className="detail" aria-label={messages.taskTitle}>
          <button type="button" className="text-button" onClick={closeDetail}>
            {messages.closeDetail}
          </button>
          <h2>{messages.taskTitle}</h2>
          <p>{messages.detailBlocked}</p>
        </aside>
      ) : null}
      <BottomBar
        onOpenLists={() => {
          setDrawer(true);
        }}
      />
    </div>
  );
}
