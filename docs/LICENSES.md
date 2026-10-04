# Licencias

OVtorrent se publica bajo licencia **MIT** (ver `LICENSE`). Todas las dependencias son open source y gratuitas, con licencias compatibles con un proyecto MIT. No se usa ninguna dependencia comercial, de pago o que requiera cuenta.

## Dependencias de producción (incluidas en el build)

| Paquete                                                            | Licencia                                                            | Uso                                                                                                                                     |
| ------------------------------------------------------------------ | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| react, react-dom                                                   | MIT                                                                 | Interfaz                                                                                                                                |
| react-router-dom                                                   | MIT                                                                 | Hash routing                                                                                                                            |
| zustand                                                            | MIT                                                                 | Estado local                                                                                                                            |
| zod                                                                | MIT                                                                 | Validación de esquemas                                                                                                                  |
| workbox-* (vía vite-plugin-pwa)                                    | MIT                                                                 | Service Worker / precache del app shell                                                                                                 |
| webtorrent (bundle `dist/webtorrent.min.js`, cargado bajo demanda) | MIT                                                                 | Motor P2P en navegador (WebRTC + trackers WebSocket); incluye bittorrent-tracker, bittorrent-protocol, parse-torrent y otras, todas MIT |
| `public/webtorrent-sw.js`                                          | MIT (reimplementación del protocolo de `webtorrent/dist/sw.min.js`) | Handler de streaming en el Service Worker                                                                                               |
| hls.js (chunk diferido, solo sin HLS nativo)                       | Apache-2.0                                                          | HLS multivariant sobre MediaSource Extensions, pistas de audio y subtítulos                                                             |

## Dependencias de desarrollo

| Paquete                                                                                                | Licencia   |
| ------------------------------------------------------------------------------------------------------ | ---------- |
| vite, @vitejs/plugin-react                                                                             | MIT        |
| typescript                                                                                             | Apache-2.0 |
| tailwindcss, @tailwindcss/vite                                                                         | MIT        |
| vite-plugin-pwa                                                                                        | MIT        |
| vitest, jsdom                                                                                          | MIT        |
| @testing-library/react, jest-dom, user-event                                                           | MIT        |
| @playwright/test                                                                                       | Apache-2.0 |
| eslint, @eslint/js, typescript-eslint, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals | MIT        |
| prettier                                                                                               | MIT        |
| fake-indexeddb                                                                                         | Apache-2.0 |
| bittorrent-tracker (server, solo en e2e; dependencia de webtorrent)                                    | MIT        |
| @axe-core/playwright, axe-core (solo e2e)                                                              | MPL-2.0    | Auditoría de accesibilidad automatizada |

## Previstas en fases posteriores

| Paquete                              | Licencia   | Fase |
| ------------------------------------ | ---------- | ---- |
| hls.js (si se necesita MSE para HLS) | Apache-2.0 | 3    |

## Servicios públicos del protocolo

Los trackers WebSocket públicos que WebTorrent usa para descubrir peers son infraestructura del protocolo, no servicios de OVtorrent. Están configurados de forma opcional (Ajustes → Calidad y búfer → P2P) y la aplicación no depende de ninguno en concreto.

Para regenerar el inventario completo: `npx license-checker --summary` (no incluido como dependencia).
