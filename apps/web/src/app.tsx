import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useNavigate, useSearchParams } from 'react-router';
import { CaptureSheet } from './features/capture/components/CaptureSheet';
import { TodayPage } from './features/capture/components/TodayPage';
import { HabitsPage } from './features/habits/components/HabitsPage';
import { TokensPage } from './features/tokens/components/TokensPage';
import { CommandPalette } from './features/views/components/CommandPalette';
import { FiltersPage } from './features/views/components/FiltersPage';
import { SmartListsPage } from './features/views/components/SmartListsPage';
import {
  FilterViewPage,
  ProjectListPage,
  SmartListViewPage,
} from './features/views/components/ViewPages';
import { isPaletteShortcut } from './features/views/shortcuts';
import { draftFromShare } from './features/capture/share-target';
import { isCaptureShortcut } from './features/capture/draft';
import { useCaptureNotice } from './features/capture/notice';

export function App() {
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  );
}

function Shell() {
  const [palette, setPalette] = useState(false);
  return (
    <>
      <CaptureHotkey />
      <PaletteHotkey
        onToggle={() => {
          setPalette((current) => !current);
        }}
      />
      {palette ? (
        <CommandPalette
          onClose={() => {
            setPalette(false);
          }}
        />
      ) : null}
      <Routes>
        <Route path="/" element={<Navigate to="/today" replace />} />
        <Route path="/today" element={<TodayPage />} />
        <Route path="/habits" element={<HabitsPage />} />
        <Route path="/smart-lists" element={<SmartListsPage />} />
        <Route path="/smart-lists/:key" element={<SmartListViewPage />} />
        <Route path="/filters" element={<FiltersPage />} />
        <Route path="/tokens" element={<TokensPage />} />
        <Route path="/filters/:id" element={<FilterViewPage />} />
        <Route path="/lists/:id" element={<ProjectListPage />} />
        <Route path="/quick-add" element={<QuickAddRoute />} />
        <Route path="*" element={<Navigate to="/today" replace />} />
      </Routes>
    </>
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

function PaletteHotkey({ onToggle }: { readonly onToggle: () => void }) {
  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      const target = event.target;
      const typing =
        target instanceof HTMLElement &&
        (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
      if (
        !isPaletteShortcut({
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
      onToggle();
    }
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onToggle]);

  return null;
}
