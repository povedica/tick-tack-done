import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useNavigate, useSearchParams } from 'react-router';
import { CaptureSheet } from './features/capture/components/CaptureSheet';
import { TodayPage } from './features/capture/components/TodayPage';
import { draftFromShare } from './features/capture/share-target';
import { isCaptureShortcut } from './features/capture/draft';
import { useCaptureNotice } from './features/capture/notice';

export function App() {
  return (
    <BrowserRouter>
      <CaptureHotkey />
      <Routes>
        <Route path="/" element={<Navigate to="/today" replace />} />
        <Route path="/today" element={<TodayPage />} />
        <Route path="/quick-add" element={<QuickAddRoute />} />
        <Route path="*" element={<Navigate to="/today" replace />} />
      </Routes>
    </BrowserRouter>
  );
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
