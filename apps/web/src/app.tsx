import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useNavigate, useSearchParams } from 'react-router';
import { CaptureSheet } from './features/capture/components/CaptureSheet';
import { TokensPage } from './features/tokens/components/TokensPage';
import { CommandPalette } from './features/views/components/CommandPalette';
import { FiltersPage } from './features/views/components/FiltersPage';
import { SmartListsPage } from './features/views/components/SmartListsPage';
import {
  FilterViewPage,
  ProjectListPage,
  SmartListViewPage,
  TagViewPage,
} from './features/views/components/ViewPages';
import { isPaletteShortcut } from './features/views/shortcuts';
import { draftFromShare } from './features/capture/share-target';
import { isCaptureShortcut } from './features/capture/draft';
import { useCaptureNotice, openTaskComposer, useCaptureOpen } from './features/capture/notice';
import { HabitsPage } from './features/habits/components/HabitsPage';
import {
  AccountPage,
  CalendarPage,
  CaptureSettings,
  ForgotPage,
  HabitDetailPage,
  InboxPage,
  MatrixPage,
  NoteRoute,
  NotificationSettings,
  SearchPage,
  SettingsHome,
  SettingsLayout,
  TaskRoute,
} from './features/places/Places';
import {
  CalendarSettings,
  DashboardPage,
  FocusPage,
  IntegrationSettings,
  ReportsPage,
  ReviewPage,
} from './features/product/ProductPages';
import {
  AutomationSettings,
  DataSettings,
  PluginSettings,
  SharingSettings,
  ShortcutSettings,
  WebhookSettings,
} from './features/settings/MoreSettings';
import { AppearancePage } from './features/settings/AppearancePage';
import { ConsentPage } from './features/auth/ConsentPage';
import { LoginPage, RegisterPage } from './features/auth/AuthPages';
import { RequireSession, SessionBootstrap } from './features/auth/RequireSession';
import { RepeatPage } from './features/repeat/RepeatPage';
import { TodayPage } from './features/today/TodayPage';
import { ShortcutHelp } from './shell/ShortcutHelp';
import { GlobalKeys } from './shell/GlobalKeys';
import { AppShell } from './shell/AppShell';
import { ThemeSync } from './theme/ThemeSync';

export function App() {
  return (
    <BrowserRouter>
      <ThemeSync />
      <SessionBootstrap />
      <Shell />
    </BrowserRouter>
  );
}

function Shell() {
  const [palette, setPalette] = useState(false);
  const [help, setHelp] = useState(false);
  return (
    <>
      <CaptureHotkey />
      <GlobalKeys
        onHelp={() => {
          setHelp(true);
        }}
      />
      {help ? (
        <ShortcutHelp
          onClose={() => {
            setHelp(false);
          }}
        />
      ) : null}
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
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPage />} />
        <Route element={<RequireSession />}>
          <Route element={<AppShell />}>
            <Route path="/" element={<Navigate to="/today" replace />} />
            <Route path="/today" element={<TodayPage />} />
            <Route path="/quick-add" element={<QuickAddRoute />} />
            <Route path="/inbox" element={<InboxPage />} />
            <Route path="/list/:id" element={<ProjectListPage />} />
            <Route path="/lists/:id" element={<ProjectListPage />} />
            <Route path="/list/:id/note/:taskId" element={<NoteRoute />} />
            <Route path="/filter/:id" element={<FilterViewPage />} />
            <Route path="/filters" element={<FiltersPage />} />
            <Route path="/filters/:id" element={<FilterViewPage />} />
            <Route path="/tag/:id" element={<TagViewPage />} />
            <Route path="/trash" element={<Navigate to="/smart/trash" replace />} />
            <Route path="/smart/:key" element={<SmartListViewPage />} />
            <Route path="/smart-lists" element={<SmartListsPage />} />
            <Route path="/smart-lists/:key" element={<SmartListViewPage />} />
            <Route path="/task/:id" element={<TaskRoute />} />
            <Route path="/habits" element={<HabitsPage />} />
            <Route path="/habits/:id" element={<HabitDetailPage />} />
            <Route path="/calendar" element={<Navigate to="/calendar/month" replace />} />
            <Route path="/calendar/:view" element={<CalendarPage />} />
            <Route path="/matrix" element={<MatrixPage />} />
            <Route path="/focus" element={<FocusPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/reports/weekly" element={<ReportsPage />} />
            <Route path="/reports/weekly/:week" element={<ReportsPage />} />
            <Route path="/review" element={<ReviewPage />} />
            <Route path="/review/daily" element={<ReviewPage />} />
            <Route path="/review/weekly" element={<ReviewPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/sticky" element={<DashboardPage />} />
            <Route path="/tokens" element={<TokensPage />} />
            <Route path="/oauth/consent" element={<ConsentPage />} />
            <Route path="/settings" element={<SettingsLayout />}>
              <Route index element={<SettingsHome />} />
              <Route path="appearance" element={<AppearancePage />} />
              <Route path="account" element={<AccountPage />} />
              <Route path="capture" element={<CaptureSettings />} />
              <Route path="notifications" element={<NotificationSettings />} />
              <Route path="smart-lists" element={<SmartListsPage />} />
              <Route path="calendar" element={<CalendarSettings />} />
              <Route path="tokens" element={<TokensPage />} />
              <Route path="integrations" element={<IntegrationSettings />} />
              <Route path="automations" element={<AutomationSettings />} />
              <Route path="webhooks" element={<WebhookSettings />} />
              <Route path="data" element={<DataSettings />} />
              <Route path="plugins" element={<PluginSettings />} />
              <Route path="sharing" element={<SharingSettings />} />
              <Route path="shortcuts" element={<ShortcutSettings />} />
            </Route>
            <Route path="/repeat" element={<RepeatPage />} />
            <Route path="*" element={<Navigate to="/today" replace />} />
          </Route>
        </Route>
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
      if (window.location.pathname === '/quick-add' || useCaptureOpen.getState().open) {
        document.getElementById('capture-input')?.focus();
        return;
      }
      openTaskComposer();
    }
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);

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
