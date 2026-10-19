import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app';
import { ScreenBoundary } from './shell/ErrorBoundary';
import { applyTheme, readThemePreference } from './theme/preference';
import { applyPreferences, usePreferences } from './theme/preferences';
import './styles/tokens.css';
import './styles.css';
import './shell/shell.css';
import './components/ui.css';
import './features/today/today.css';
import './features/countdowns/countdowns.css';

applyTheme(
  readThemePreference(localStorage),
  window.matchMedia('(prefers-color-scheme: dark)').matches,
);
applyPreferences(usePreferences.getState().density, usePreferences.getState().accent);

registerSW({ immediate: true });

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
const root = document.getElementById('root');
if (root === null) {
  throw new Error('root is missing');
}

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ScreenBoundary>
        <App />
      </ScreenBoundary>
    </QueryClientProvider>
  </StrictMode>,
);
