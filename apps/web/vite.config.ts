import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig, loadEnv, type Plugin } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));

// PWA (sección 2, D1): instalable, offline-first, push. Ver RF-13010 para la cola de mutaciones.
export default defineConfig(({ mode }) => {
  // Worktrees set VITE_API_PROXY in the repo-root .env. The main checkout keeps :3000.
  const env = loadEnv(mode, path.resolve(root, '../..'), '');
  const api = process.env.VITE_API_PROXY || env.VITE_API_PROXY || 'http://localhost:3000';

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
      calendarModulePreload(),
      deferRouteCss(),
      ...(process.env.BUNDLE_MODULES === '1' ? [bundleModuleSizes()] : []),
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
          globPatterns: ['**/*.{js,css,html,svg,ico,webmanifest,png}'],
          globIgnores: ['**/deferred-*'],
          manifestTransforms: [
            (entries: { url: string }[]) => ({
              manifest: entries.filter((entry) => {
                if (!entry.url.startsWith('assets/')) return true;
                return /^assets\/(?:index-|core-)/.test(entry.url);
              }),
              warnings: [],
            }),
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
    ],
    // Keep each precached asset below Workbox's 2 MiB limit as features grow.
    build: {
      manifest: true,
      rollupOptions: {
        output: {
          chunkFileNames(chunk) {
            const deferred =
              chunk.isDynamicEntry === true ||
              chunk.name === 'charts' ||
              chunk.name === 'markdown' ||
              chunk.name === 'rrule';
            return deferred ? 'assets/deferred-[name]-[hash].js' : 'assets/[name]-[hash].js';
          },
          manualChunks(id) {
            const pkg = packageName(id);
            if (pkg === null) return;
            if (pkg === 'react' || pkg === 'react-dom' || pkg === 'react-router') return 'core';
            if (pkg === 'recharts' || pkg.startsWith('d3-')) return 'charts';
            if (
              pkg === 'rrule' ||
              pkg.includes('micromark') ||
              pkg.includes('mdast') ||
              pkg.includes('hast') ||
              pkg === 'react-markdown' ||
              pkg.startsWith('remark-') ||
              pkg.startsWith('rehype-') ||
              pkg === 'unified' ||
              pkg === 'mdast-util-from-markdown' ||
              pkg === 'mdast-util-to-hast'
            ) {
              if (pkg === 'rrule') return 'rrule';
              return 'markdown';
            }
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
    preview: {
      // The baseline reaches this server as https://perf-web. Vite 6 blocks other hosts.
      allowedHosts: ['perf-web', 'localhost', '127.0.0.1'],
      proxy: {
        '/api': api,
        '/mcp': api,
      },
    },
  };
});

function bundleModuleSizes(): Plugin {
  return {
    name: 'bundle-module-sizes',
    generateBundle(_options, bundle) {
      const rows: string[] = [];
      for (const item of Object.values(bundle)) {
        if (item.type !== 'chunk' || !item.fileName.includes('index-')) continue;
        const modules = Object.entries(item.modules).sort(
          (left, right) => (right[1].renderedLength ?? 0) - (left[1].renderedLength ?? 0),
        );
        for (const [id, info] of modules.slice(0, 40)) {
          rows.push(`${String(info.renderedLength ?? 0).padStart(8)}  ${id}`);
        }
      }
      this.info(`\n${rows.join('\n')}\n`);
    },
  };
}

function packageName(id: string): string | null {
  const marker = '/node_modules/';
  const index = id.lastIndexOf(marker);
  if (index < 0) return null;
  const parts = id.slice(index + marker.length).split('/');
  const name = parts[0]?.startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
  return name && name.length > 0 ? name : null;
}

/** CSS of deferred routes is renamed so the precache glob can ignore it. */
function deferRouteCss(): Plugin {
  return {
    name: 'defer-route-css',
    apply: 'build',
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).filter((item) => item.type === 'chunk');
      const byFile = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
      const entry = chunks.find((chunk) => chunk.isEntry);
      const reachable = new Set<string>();
      const pending = entry === undefined ? [] : [entry.fileName];
      while (pending.length > 0) {
        const fileName = pending.pop();
        if (fileName === undefined || reachable.has(fileName)) continue;
        reachable.add(fileName);
        const chunk = byFile.get(fileName);
        if (chunk === undefined) continue;
        for (const imported of chunk.imports) {
          const match = [...byFile.keys()].find(
            (candidate) => candidate === imported || candidate.endsWith(`/${imported}`),
          );
          if (match !== undefined) pending.push(match);
        }
      }
      const renames: Array<[string, string]> = [];
      const seen = new Set<string>();
      for (const chunk of chunks) {
        const deferred = !reachable.has(chunk.fileName) || chunk.fileName.includes('/deferred-');
        if (!deferred) continue;
        for (const file of chunk.viteMetadata?.importedCss ?? []) {
          if (file.includes('/deferred-') || seen.has(file)) continue;
          seen.add(file);
          const slash = file.lastIndexOf('/');
          renames.push([file, `${file.slice(0, slash + 1)}deferred-${file.slice(slash + 1)}`]);
        }
      }
      for (const [from, to] of renames) {
        const fromBase = from.slice(from.lastIndexOf('/') + 1);
        const toBase = to.slice(to.lastIndexOf('/') + 1);
        for (const item of Object.values(bundle)) {
          if (item.type === 'chunk' && item.code.includes(fromBase)) {
            item.code = item.code.replaceAll(fromBase, toBase);
          } else if (item.type === 'asset' && typeof item.source === 'string' && item.source.includes(fromBase)) {
            item.source = item.source.replaceAll(fromBase, toBase);
          }
        }
        const key = Object.keys(bundle).find((candidate) => bundle[candidate]?.fileName === from);
        const asset = key === undefined ? undefined : bundle[key];
        if (key !== undefined && asset !== undefined) {
          asset.fileName = to;
          delete bundle[key];
          bundle[to] = asset;
        }
      }
    },
  };
}

/** Preload the calendar chunk when the document starts on /calendar/*. */
function calendarModulePreload(): Plugin {
  return {
    name: 'calendar-modulepreload',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const bundle = ctx.bundle;
        if (bundle === undefined) return html;
        const chunk = Object.values(bundle).find(
          (item) =>
            item.type === 'chunk' &&
            item.fileName.includes('deferred-') &&
            (item.facadeModuleId?.endsWith('/Places.tsx') === true ||
              item.name === 'Places' ||
              item.name === 'CalendarPage'),
        );
        if (chunk === undefined || chunk.type !== 'chunk') return html;
        const tag =
          `<script>if(location.pathname.startsWith("/calendar")){` +
          `var link=document.createElement("link");link.rel="modulepreload";` +
          `link.href="/${chunk.fileName}";document.head.appendChild(link);}</script>`;
        return html.replace('</head>', `${tag}</head>`);
      },
    },
  };
}
