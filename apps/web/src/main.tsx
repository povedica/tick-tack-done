import { QueryClientProvider } from '@tanstack/react-query';
import { createAppQueryClient } from './query-client';
import { installActionErrorFallback } from './components/run-action';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app';
import { loadMessages } from './i18n/catalog';
import { readLocaleChoice, resolveLocale } from './i18n/locale';
import { ScreenBoundary } from './shell/ErrorBoundary';
import { applyTheme, readThemePreference } from './theme/preference';
import { applyPreferences, usePreferences } from './theme/preferences';
import './styles/tokens.css';
import './styles.css';
import './shell/shell.css';
import './components/ui.css';
import './features/today/today.css';

applyTheme(
  readThemePreference(localStorage),
  window.matchMedia('(prefers-color-scheme: dark)').matches,
);
applyPreferences(usePreferences.getState().density, usePreferences.getState().accent);

registerSW({ immediate: true });

const queryClient = createAppQueryClient();
installActionErrorFallback();
const rootElement = document.getElementById('root');
if (rootElement === null) {
  throw new Error('root is missing');
}
const root = rootElement;

void boot().catch((error: unknown) => {
  throw error;
});

async function boot(): Promise<void> {
  const locale = resolveLocale(readLocaleChoice());
  document.documentElement.lang = locale;
  await loadMessages(locale);
  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <ScreenBoundary>
          <App />
        </ScreenBoundary>
      </QueryClientProvider>
    </StrictMode>,
  );
}
