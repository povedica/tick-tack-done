import path from 'node:path';
import { execFileSync } from 'node:child_process';
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

  let commit = process.env.GIT_COMMIT || env.GIT_COMMIT || 'unknown';
  if (commit === 'unknown') {
    try {
      commit = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: root,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .toString()
        .trim();
    } catch {
      /* Source archives may not contain Git. */
    }
  }
  return {
    define: {
      // Production artifacts must always bootstrap cookie sessions and send CSRF tokens,
      // including builds prepared outside the production Dockerfile.
      'import.meta.env.VITE_AUTH_MODE': JSON.stringify(
        mode === 'production'
          ? 'session'
          : (process.env.VITE_AUTH_MODE ?? env.VITE_AUTH_MODE ?? 'dev'),
      ),
      __APP_COMMIT__: JSON.stringify(/^[a-f0-9]{7,40}$/i.test(commit) ? commit : 'unknown'),
      __BUILD_TIME__: JSON.stringify(
        process.env.BUILD_TIME || env.BUILD_TIME || new Date().toISOString(),
      ),
    },
    plugins: [
      react(),
      {
        name: 'manifest-json-redirect',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (req.url === '/manifest.json') {
              res.statusCode = 308;
              res.setHeader('Location', '/manifest.webmanifest');
              res.end();
              return;
            }
            next();
          });
        },
      },
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
    // Keep each precached asset below Workbox's 2 MiB limit as features grow.
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) return 'vendor';
          },
        },
      },
    },
    resolve: {
      alias: {
        // The package entry is CJS. Rollup skips it because the workspace link
        // resolves outside node_modules, so the browser bundle uses the source.
        '@reflexionia/domain': path.resolve(root, '../../packages/domain/src/index.ts'),
      },
    },
    server: {
      host: process.env.DEV_BIND_HOST || 'localhost',
      port: 5173,
      strictPort: true,
      watch:
        process.env.CHOKIDAR_USEPOLLING === 'true'
          ? { usePolling: true, interval: 300 }
          : undefined,
      proxy: {
        '/api': api,
        '/mcp': api,
      },
    },
  };
});
