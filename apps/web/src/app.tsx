import { composerContextFor } from './features/capture/context';
import { PolicyPage } from './features/auth/PolicyPage';
import { runAction } from './components/run-action';
import { SkeletonRows } from './components/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { lazy, Suspense, useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useNavigate, useSearchParams } from 'react-router';
import { api } from './api';
import { CaptureSheet } from './features/capture/components/CaptureSheet';
import { CommandPalette } from './features/views/components/CommandPalette';
import {
  CancelledPage,
  FilterViewPage,
  ProjectListPage,
  SmartListViewPage,
  TagViewPage,
} from './features/views/components/ViewPages';
import { isPaletteShortcut } from './features/views/shortcuts';
import { draftFromShare } from './features/capture/share-target';
import { isCaptureShortcut } from './features/capture/draft';
import { useCaptureNotice, openTaskComposer, useCaptureOpen } from './features/capture/notice';
import { featureFlags, useFeatures, type FeatureFlags } from './features/settings/feature-flags';
import { ConsentPage } from './features/auth/ConsentPage';
import { LoginPage, RegisterPage } from './features/auth/AuthPages';
import { RequireSession, SessionBootstrap } from './features/auth/RequireSession';
import { TodayPage } from './features/today/TodayPage';
import { ShortcutHelp } from './shell/ShortcutHelp';
import { GlobalKeys } from './shell/GlobalKeys';
import { AppShell } from './shell/AppShell';
import { NotFoundPage } from './shell/NotFoundPage';
import { ThemeSync } from './theme/ThemeSync';

const InboxPage = lazyNamed(() => import('./features/places/InboxPage'), 'InboxPage');
const SearchPage = lazyNamed(() => import('./features/places/SearchPage'), 'SearchPage');
const NoteRoute = lazyNamed(() => import('./features/places/TaskRoutes'), 'NoteRoute');
const TaskRoute = lazyNamed(() => import('./features/places/TaskRoutes'), 'TaskRoute');
const SettingsHome = lazyNamed(() => import('./features/places/SettingsShell'), 'SettingsHome');
const SettingsLayout = lazyNamed(() => import('./features/places/SettingsShell'), 'SettingsLayout');
const ForgotPage = lazyNamed(() => import('./features/places/ForgotPage'), 'ForgotPage');
const AccountPage = lazyNamed(() => import('./features/places/AccountPage'), 'AccountPage');
const CaptureSettings = lazyNamed(
  () => import('./features/places/CaptureSettingsPage'),
  'CaptureSettings',
);
const FiltersPage = lazyNamed(() => import('./features/views/components/FiltersPage'), 'FiltersPage');
const SmartListsPage = lazyNamed(
  () => import('./features/views/components/SmartListsPage'),
  'SmartListsPage',
);
const CalendarPage = lazyNamed(() => import('./features/places/Places'), 'CalendarPage');
const MatrixPage = lazyNamed(() => import('./features/matrix/MatrixBoard'), 'MatrixPage');
const HabitsPage = lazyNamed(() => import('./features/habits/components/HabitsPage'), 'HabitsPage');
const HabitDetailPage = lazyNamed(
  () => import('./features/habits/components/HabitDetailPage'),
  'HabitDetailPage',
);
const CountdownsPage = lazyNamed(() => import('./features/countdowns/CountdownsPage'), 'CountdownsPage');
const TickyPage = lazyNamed(() => import('./features/ticky/TickyPage'), 'TickyPage');
const TokensPage = lazyNamed(() => import('./features/tokens/components/TokensPage'), 'TokensPage');
const StatisticsPage = lazyNamed(() => import('./features/statistics/StatisticsPage'), 'StatisticsPage');
const ProjectsPage = lazyNamed(() => import('./features/projects/ProjectsPage'), 'ProjectsPage');
const DayPlanEntry = lazyNamed(() => import('./features/planning/DayPlanEntry'), 'DayPlanEntry');
const WontDoPage = lazyNamed(() => import('./features/planning/WontDoPage'), 'WontDoPage');
const DayShutdownPage = lazy(async () => {
  const module = await import('./features/closing/ShutdownPage');
  return {
    default: function DayShutdownPage() {
      return <module.ShutdownPage kind="shutdown" />;
    },
  };
});
const ReviewPage = lazyNamed(() => import('./features/product/WeeklyPages'), 'ReviewPage');
const ReportsPage = lazyNamed(() => import('./features/product/WeeklyPages'), 'ReportsPage');
const FocusPage = lazyNamed(() => import('./features/focus/FocusPage'), 'FocusPage');
const DashboardPage = lazyNamed(() => import('./features/dashboard/DashboardPage'), 'DashboardPage');
const RepeatPage = lazyNamed(() => import('./features/repeat/RepeatPage'), 'RepeatPage');
const CalendarSettings = lazyNamed(
  () => import('./features/product/ProductPages'),
  'CalendarSettings',
);
const IntegrationSettings = lazyNamed(
  () => import('./features/product/ProductPages'),
  'IntegrationSettings',
);
const AppearancePage = lazyNamed(() => import('./features/settings/AppearancePage'), 'AppearancePage');
const FeaturesPage = lazyNamed(() => import('./features/settings/FeaturesPage'), 'FeaturesPage');
const WorkdaySettings = lazyNamed(() => import('./features/settings/WorkdaySettings'), 'WorkdaySettings');
const FocusSettingsPage = lazyNamed(
  () => import('./features/settings/FocusSettingsPage'),
  'FocusSettingsPage',
);
const AboutPage = lazyNamed(() => import('./features/settings/AboutPage'), 'AboutPage');
const NotificationsPage = lazyNamed(
  () => import('./features/settings/NotificationsPage'),
  'NotificationsPage',
);
const AutomationSettings = lazyNamed(
  () => import('./features/settings/MoreSettings'),
  'AutomationSettings',
);
const DataSettings = lazyNamed(() => import('./features/settings/MoreSettings'), 'DataSettings');
const PluginSettings = lazyNamed(() => import('./features/settings/MoreSettings'), 'PluginSettings');
const SharingSettings = lazyNamed(() => import('./features/settings/MoreSettings'), 'SharingSettings');
const ShortcutSettings = lazyNamed(
  () => import('./features/settings/MoreSettings'),
  'ShortcutSettings',
);
const WebhookSettings = lazyNamed(() => import('./features/settings/MoreSettings'), 'WebhookSettings');

function lazyNamed<Key extends string>(
  load: () => Promise<Record<Key, ComponentType>>,
  key: Key,
) {
  return lazy(async () => ({ default: (await load())[key] }));
}

function Suspended({ children }: { readonly children: ReactNode }) {
  return <Suspense fallback={<SkeletonRows />}>{children}</Suspense>;
}

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
        <Route path="/privacy" element={<PolicyPage />} />
        <Route path="/terms" element={<PolicyPage terms />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<Suspended><ForgotPage /></Suspended>} />
        <Route element={<RequireSession />}>
          <Route element={<AppShell />}>
            <Route path="/" element={<Navigate to="/today" replace />} />
            <Route path="/today" element={<TodayPage />} />
            <Route path="/quick-add" element={<QuickAddRoute />} />
            <Route path="/inbox" element={<Suspended><InboxPage /></Suspended>} />
            <Route path="/list/:id" element={<ProjectListPage />} />
            <Route path="/projects/:id" element={<ProjectListPage />} />
            <Route path="/lists/:id" element={<ProjectListPage />} />
            <Route path="/list/:id/note/:taskId" element={<Suspended><NoteRoute /></Suspended>} />
            <Route path="/filter/:id" element={<FilterViewPage />} />
            <Route path="/filters" element={<Suspended><FiltersPage /></Suspended>} />
            <Route path="/filters/:id" element={<FilterViewPage />} />
            <Route path="/tag/:id" element={<TagViewPage />} />
            <Route path="/trash" element={<Navigate to="/smart/trash" replace />} />
            <Route path="/tasks/completed" element={<Navigate to="/smart/completed" replace />} />
            <Route path="/tasks/cancelled" element={<CancelledPage />} />
            <Route path="/smart/:key" element={<SmartListViewPage />} />
            <Route path="/smart-lists" element={<Suspended><SmartListsPage /></Suspended>} />
            <Route path="/smart-lists/:key" element={<SmartListViewPage />} />
            <Route path="/task/:id" element={<Suspended><TaskRoute /></Suspended>} />
            <Route path="/habits" element={<Suspended><HabitsPage /></Suspended>} />
            <Route
              path="/countdowns"
              element={
                <Suspended>
                  <FeatureRoute flag="countdowns">
                    <CountdownsPage />
                  </FeatureRoute>
                </Suspended>
              }
            />
            <Route path="/habits/:id" element={<Suspended><HabitDetailPage /></Suspended>} />
            <Route path="/calendar" element={<Navigate to="/calendar/month" replace />} />
            <Route path="/calendar/:view" element={<Suspended><CalendarPage /></Suspended>} />
            <Route
              path="/matrix"
              element={
                <Suspended>
                  <FeatureRoute flag="matrix">
                    <MatrixPage />
                  </FeatureRoute>
                </Suspended>
              }
            />
            <Route
              path="/focus"
              element={
                <Suspended>
                  <FeatureRoute flag="focus">
                    <FocusPage />
                  </FeatureRoute>
                </Suspended>
              }
            />
            <Route path="/dashboard" element={<Suspended><DashboardPage /></Suspended>} />
            <Route path="/dashboard/projects" element={<Suspended><ProjectsPage /></Suspended>} />
            <Route path="/statistics" element={<Suspended><StatisticsPage /></Suspended>} />
            <Route path="/statistics/:tab" element={<Suspended><StatisticsPage /></Suspended>} />
            <Route path="/reports/weekly" element={<Suspended><ReportsPage /></Suspended>} />
            <Route path="/reports/weekly/:week" element={<Suspended><ReportsPage /></Suspended>} />
            <Route path="/plan/day" element={<Suspended><DayPlanEntry /></Suspended>} />
            <Route path="/cierre" element={<Suspended><DayShutdownPage /></Suspended>} />
            <Route path="/replan" element={<Navigate to="/plan/day" replace />} />
            <Route path="/wont-do" element={<Suspended><WontDoPage /></Suspended>} />
            <Route path="/review" element={<Suspended><ReviewPage /></Suspended>} />
            <Route path="/review/daily" element={<Suspended><ReviewPage /></Suspended>} />
            <Route path="/review/weekly" element={<Suspended><ReviewPage /></Suspended>} />
            <Route path="/search" element={<Suspended><SearchPage /></Suspended>} />
            <Route
              path="/ticky"
              element={
                <Suspended>
                  <FeatureRoute flag="ticky">
                    <TickyPage />
                  </FeatureRoute>
                </Suspended>
              }
            />
            <Route path="/sticky" element={<Suspended><DashboardPage /></Suspended>} />
            <Route path="/tokens" element={<Suspended><TokensPage /></Suspended>} />
            <Route path="/oauth/consent" element={<ConsentPage />} />
            <Route path="/settings" element={<Suspended><SettingsLayout /></Suspended>}>
              <Route index element={<Suspended><SettingsHome /></Suspended>} />
              <Route path="appearance" element={<Suspended><AppearancePage /></Suspended>} />
              <Route path="features" element={<Suspended><FeaturesPage /></Suspended>} />
              <Route path="account" element={<Suspended><AccountPage /></Suspended>} />
              <Route path="workday" element={<Suspended><WorkdaySettings /></Suspended>} />
              <Route path="capture" element={<Suspended><CaptureSettings /></Suspended>} />
              <Route path="focus" element={<Suspended><FocusSettingsPage /></Suspended>} />
              <Route path="about" element={<Suspended><AboutPage /></Suspended>} />
              <Route path="notifications" element={<Suspended><NotificationsPage /></Suspended>} />
              <Route path="smart-lists" element={<Suspended><SmartListsPage /></Suspended>} />
              <Route path="calendar" element={<Suspended><CalendarSettings /></Suspended>} />
              <Route path="tokens" element={<Suspended><TokensPage /></Suspended>} />
              <Route path="integrations" element={<Suspended><IntegrationSettings /></Suspended>} />
              <Route path="automations" element={<Suspended><AutomationSettings /></Suspended>} />
              <Route path="webhooks" element={<Suspended><WebhookSettings /></Suspended>} />
              <Route path="data" element={<Suspended><DataSettings /></Suspended>} />
              <Route path="plugins" element={<Suspended><PluginSettings /></Suspended>} />
              <Route path="sharing" element={<Suspended><SharingSettings /></Suspended>} />
              <Route path="shortcuts" element={<Suspended><ShortcutSettings /></Suspended>} />
            </Route>
            <Route path="/repeat" element={<Suspended><RepeatPage /></Suspended>} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </>
  );
}

function FeatureRoute({
  flag,
  children,
}: {
  readonly flag: keyof FeatureFlags;
  readonly children: ReactNode;
}) {
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.getMe() });
  const storedEnabled = useFeatures((state) => {
    const value = state.flags[flag];
    return typeof value === 'boolean' ? value : true;
  });
  if (me.isPending) {
    return <div className="page-loading" aria-busy="true" />;
  }
  const configured = me.data === undefined ? storedEnabled : featureFlags(me.data.features)[flag];
  const enabled = typeof configured === 'boolean' ? configured : true;
  if (!enabled) {
    return <Navigate to="/today?disabled=1" replace />;
  }
  return children;
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
        runAction(Promise.resolve(navigate('/today')));
      }}
      onCreated={(created) => {
        setNotice(created);
        runAction(Promise.resolve(navigate('/today')));
      }}
    />
  );
}

function CaptureHotkey() {
  const composerClient = useQueryClient();
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
        document
          .querySelector<HTMLInputElement>('.calendar-quick-add input[name="title"]')
          ?.focus();
        return;
      }
      openTaskComposer(composerContextFor(window.location, { cache: composerClient }));
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
