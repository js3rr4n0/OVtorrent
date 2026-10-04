import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

/**
 * Content Security Policy for production builds.
 *
 * - `blob:` is required for Blob URLs used by the HTML5 player and future
 *   MediaSource-based streaming.
 * - `media-src` allows user-entered HTTP(S) media URLs (confirmed by the user).
 * - `connect-src wss:`/`ws:`/`https:` is needed by WebTorrent trackers (WebRTC
 *   signalling over WebSocket; plain ws:// only makes sense on LAN trackers).
 * - WebRTC DataChannels are not governed by CSP.
 *
 * It is injected only on build: the Vite dev server needs inline scripts for
 * React Fast Refresh, which this policy intentionally forbids.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "media-src 'self' blob: https: http:",
  "connect-src 'self' blob: https: wss: ws:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

function cspPlugin(): Plugin {
  return {
    name: 'ovtorrent-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<!-- CSP_PLACEHOLDER -->',
        `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      );
    },
  };
}

export default defineConfig({
  // Relative base so the same build works on GitHub Pages sub-paths, Nginx
  // sub-folders or the root of any static host.
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    cspPlugin(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: 'auto',
      includeAssets: ['icons/*.svg', 'icons/*.png'],
      manifest: {
        name: 'OVtorrent',
        short_name: 'OVtorrent',
        description:
          'Reproductor web P2P con búfer temporal limitado y limpieza automática de datos de sesión.',
        lang: 'es',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#0b1020',
        theme_color: '#0b1020',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        // Only the app shell and static assets are precached. Media, torrents
        // and blobs are never cached by the Service Worker.
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        globIgnores: ['webtorrent-sw.js'],
        // WebTorrent streaming handler (see public/webtorrent-sw.js): it runs
        // inside the same worker because a page's requests always go to the
        // worker that controls it, whatever the URL.
        importScripts: ['webtorrent-sw.js'],
        navigateFallback: 'index.html',
        // Take control of already-open pages as soon as the worker activates so
        // the first visit is offline-capable without a reload. Updates still
        // wait for the user's confirmation (registerType: 'prompt').
        clientsClaim: true,
        runtimeCaching: [],
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          state: ['zustand', 'zod'],
        },
      },
    },
  },
});
