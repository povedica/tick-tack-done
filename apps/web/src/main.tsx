import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app';
import { applyTheme, readThemePreference } from './theme/preference';
import './styles/tokens.css';
import './styles.css';
import './shell/shell.css';

applyTheme(
  readThemePreference(localStorage),
  window.matchMedia('(prefers-color-scheme: dark)').matches,
);

registerSW({ immediate: true });

const queryClient = new QueryClient();
const root = document.getElementById('root');
if (root === null) {
  throw new Error('root is missing');
}

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
