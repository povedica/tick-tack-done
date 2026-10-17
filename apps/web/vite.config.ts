import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vite';

// PWA (sección 2, D1): instalable, offline-first, push. Ver RF-13010 para la cola de mutaciones.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
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
    }),
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/mcp': 'http://localhost:3000',
    },
  },
});
