import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'candle-192.png', 'candle-512.png'],
      manifest: {
        name: 'Bedikat Chametz',
        short_name: 'Bedikat Chametz',
        description: 'Collaborative chametz search tracker for Passover',
        theme_color: '#007AFF',
        background_color: '#f2f2f7',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'candle-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'candle-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-cache', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } }
          }
        ]
      }
    })
  ]
});
