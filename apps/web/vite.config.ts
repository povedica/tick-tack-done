import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig, loadEnv } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));

// PWA (sección 2, D1): instalable, offline-first, push. Ver RF-13010 para la cola de mutaciones.
export default defineConfig(({ mode }) => {
  // Worktrees set VITE_API_PROXY in the repo-root .env. The main checkout keeps :3000.
  const env = loadEnv(mode, path.resolve(root, '../..'), '');
  const api = env.VITE_API_PROXY || 'http://localhost:3000';

  return {
    plugins: [
      react(),
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        registerType: 'prompt',
        injectRegister: 'auto',
        manifest: {
          name: 'tick-tack-done',
          short_name: 'tick-tack-done',
          start_url: '/today',
          display: 'standalone',
          background_color: '#ffffff',
          theme_color: '#4772fa',
          icons: [
            { src: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
            { src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
            {
              src: '/android-chrome-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
          shortcuts: [
            { name: 'Hoy', short_name: 'Hoy', url: '/today' },
            { name: 'Captura', short_name: 'Captura', url: '/quick-add' },
            { name: 'Foco', short_name: 'Foco', url: '/focus' },
          ],
          share_target: {
            // RF-106: "compartir a la app" desde el móvil vuelca al quick add
            action: '/quick-add',
            method: 'POST',
            enctype: 'multipart/form-data',
            params: { title: 'title', text: 'text', url: 'url' },
          },
        },
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,svg,ico,webmanifest}'],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        // The package entry is CJS. Rollup skips it because the workspace link
        // resolves outside node_modules, so the browser bundle uses the source.
        '@reflexionia/domain': path.resolve(root, '../../packages/domain/src/index.ts'),
      },
    },
    server: {
      proxy: {
        '/api': api,
        '/mcp': api,
      },
    },
  };
});
