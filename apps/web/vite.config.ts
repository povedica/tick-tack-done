import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));

// PWA (sección 2, D1): instalable, offline-first, push. Ver RF-13010 para la cola de mutaciones.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: 'auto',
      manifest: {
        name: 'Reflexionia Tasks',
        short_name: 'Tasks',
        start_url: '/today',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#4f46e5',
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
      '/api': 'http://localhost:3000',
      '/mcp': 'http://localhost:3000',
    },
  },
});
