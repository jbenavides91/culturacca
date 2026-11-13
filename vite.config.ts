import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Lee las cabeceras del bloque "/*" de public/_headers (formato de Cloudflare Pages) para que
 * `npm run preview` sirva la app con la misma CSP que producción. En local (http) se omiten
 * HSTS y `upgrade-insecure-requests`, que forzarían https sobre localhost.
 */
function cabecerasDePreview(): Record<string, string> {
  try {
    const texto = fs.readFileSync(path.resolve(import.meta.dirname, 'public/_headers'), 'utf8');
    const cabeceras: Record<string, string> = {};
    let enBloqueGlobal = false;
    for (const linea of texto.split(/\r?\n/)) {
      if (!linea.trim() || linea.trim().startsWith('#')) continue;
      if (!/^\s/.test(linea)) {
        enBloqueGlobal = linea.trim() === '/*';
        continue;
      }
      if (!enBloqueGlobal) continue;
      const i = linea.indexOf(':');
      if (i < 0) continue;
      const nombre = linea.slice(0, i).trim();
      let valor = linea.slice(i + 1).trim();
      if (nombre.toLowerCase() === 'strict-transport-security') continue;
      if (nombre.toLowerCase() === 'content-security-policy') {
        valor = valor.replace(/;\s*upgrade-insecure-requests/, '');
      }
      cabeceras[nombre] = valor;
    }
    return cabeceras;
  } catch {
    return {};
  }
}

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon-32x32.png', 'favicon-64x64.png', 'apple-touch-icon.png', 'manifest.json'],
        manifest: {
          id: '/',
          name: 'Cultura CCA',
          short_name: 'Cultura CCA',
          description: 'Sistema institucional de control de asistencia para talleres vespertinos de arte y cultura con sincronización offline.',
          theme_color: '#4F46E5',
          background_color: '#101318',
          display: 'standalone',
          orientation: 'portrait-primary',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,json}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        // Desactivado en desarrollo: el service worker servía versiones viejas del código
        // tras cambios frecuentes (síntoma: la app regresaba al login). En producción sigue activo.
        devOptions: {
          enabled: false,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    // Misma política de seguridad que Cloudflare Pages (public/_headers). El servidor de desarrollo
    // no la usa: HMR necesita websockets y scripts que la CSP bloquearía.
    preview: {
      headers: cabecerasDePreview(),
    },
  };
});
