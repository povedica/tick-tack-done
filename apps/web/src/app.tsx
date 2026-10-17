import { useEffect } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router';
import { CaptureSheet } from './features/capture/components/CaptureSheet';
import { HabitsPage } from './features/habits/components/HabitsPage';
import { draftFromShare } from './features/capture/share-target';
import { isCaptureShortcut } from './features/capture/draft';
import { useCaptureNotice } from './features/capture/notice';
import { LaterPage } from './features/screens/LaterPage';
import { AppearancePage } from './features/settings/AppearancePage';
import { TodayPage } from './features/today/TodayPage';
import { AppShell } from './shell/AppShell';
import { ThemeSync } from './theme/ThemeSync';

export function App() {
  return (
    <BrowserRouter>
      <ThemeSync />
      <CaptureHotkey />
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/today" replace />} />
          <Route path="/today" element={<TodayPage />} />
          <Route path="/quick-add" element={<QuickAddRoute />} />
          <Route path="/inbox" element={<LaterPage titleKey="inboxTitle" />} />
          <Route path="/list/:id" element={<LaterPage titleKey="listTitle" />} />
          <Route path="/list/:id/note/:taskId" element={<LaterPage titleKey="noteTitle" />} />
          <Route path="/filter/:id" element={<LaterPage titleKey="filterTitle" />} />
          <Route path="/smart/:key" element={<SmartRoute />} />
          <Route path="/task/:id" element={<LaterPage titleKey="taskTitle" />} />
          <Route path="/habits" element={<HabitsPage />} />
          <Route path="/habits/:id" element={<LaterPage titleKey="habitTitle" />} />
          <Route path="/calendar/:view" element={<LaterPage titleKey="calendarTitle" />} />
          <Route path="/matrix" element={<LaterPage titleKey="matrixTitle" />} />
          <Route path="/focus" element={<LaterPage titleKey="focusTitle" />} />
          <Route path="/dashboard" element={<LaterPage titleKey="dashboardTitle" />} />
          <Route path="/reports/weekly" element={<LaterPage titleKey="reportsTitle" />} />
          <Route path="/reports/weekly/:week" element={<LaterPage titleKey="reportTitle" />} />
          <Route path="/review/weekly" element={<LaterPage titleKey="reviewTitle" />} />
          <Route path="/search" element={<LaterPage titleKey="searchTitle" />} />
          <Route path="/settings">
            <Route index element={<Navigate to="/settings/appearance" replace />} />
            <Route path="appearance" element={<AppearancePage />} />
            <Route path="*" element={<LaterPage titleKey="settingsTitle" />} />
          </Route>
          <Route path="/login" element={<LaterPage titleKey="loginTitle" />} />
          <Route path="/register" element={<LaterPage titleKey="registerTitle" />} />
          <Route path="/forgot-password" element={<LaterPage titleKey="forgotTitle" />} />
          <Route path="*" element={<Navigate to="/today" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

function SmartRoute() {
  const params = useParams();
  return <LaterPage titleKey="smartTitle" key={params.key ?? ''} />;
}

function QuickAddRoute() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const setNotice = useCaptureNotice((state) => state.setNotice);
  const initialText = draftFromShare({
    title: params.get('title') ?? '',
    text: params.get('text') ?? '',
    url: params.get('url') ?? '',
  });

  return (
    <CaptureSheet
      key={initialText}
      initialText={initialText}
      onClose={() => {
        void navigate('/today');
      }}
      onCreated={(created) => {
        setNotice(created);
        void navigate('/today');
      }}
    />
  );
}

function CaptureHotkey() {
  const navigate = useNavigate();

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      const target = event.target;
      const typing =
        target instanceof HTMLElement &&
        (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
      if (
        !isCaptureShortcut({
          key: event.key,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          typing,
        })
      ) {
        return;
      }
      event.preventDefault();
      if (window.location.pathname === '/quick-add') {
        document.getElementById('capture-input')?.focus();
        return;
      }
      void navigate('/quick-add');
    }
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [navigate]);

  return null;
}
