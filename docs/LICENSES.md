# Licencias

OVtorrent se publica bajo licencia **MIT** (ver `LICENSE`). Todas las dependencias son open source y gratuitas, con licencias compatibles con un proyecto MIT. No se usa ninguna dependencia comercial, de pago o que requiera cuenta.

## Dependencias de producción (incluidas en el build)

| Paquete                         | Licencia | Uso                                     |
| ------------------------------- | -------- | --------------------------------------- |
| react, react-dom                | MIT      | Interfaz                                |
| react-router-dom                | MIT      | Hash routing                            |
| zustand                         | MIT      | Estado local                            |
| zod                             | MIT      | Validación de esquemas                  |
| workbox-* (vía vite-plugin-pwa) | MIT      | Service Worker / precache del app shell |

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

## Previstas en fases posteriores

| Paquete                              | Licencia   | Fase |
| ------------------------------------ | ---------- | ---- |
| webtorrent                           | MIT        | 2    |
| hls.js (si se necesita MSE para HLS) | Apache-2.0 | 3    |

## Servicios públicos del protocolo

Los trackers WebSocket públicos que WebTorrent usa para descubrir peers (Fase 2) son infraestructura del protocolo, no servicios de OVtorrent. Se configurarán de forma opcional y documentada; la aplicación no depende de ninguno en concreto.

Para regenerar el inventario completo: `npx license-checker --summary` (no incluido como dependencia).
