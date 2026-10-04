# OVtorrent

**Reproductor web P2P con búfer temporal limitado y limpieza automática de datos de sesión.**

PWA 100 % estática: se ejecuta íntegramente en el navegador, sin backend, sin base de datos, sin cuentas, sin claves API y sin servicios de pago. Se despliega como archivos estáticos en cualquier servidor HTTP (GitHub Pages, GitLab Pages, Cloudflare Pages, Netlify, Nginx o un servidor local).

> Estado: **Fase 2 completada**. Fase 1: PWA estática, biblioteca y playlists locales, importación de magnet/.torrent/archivo/URL/JSON, reproductor HTML5, configuración de búfer y calidad, modo TV básico, diagnóstico, limpieza de sesión. Fase 2: motor **WebTorrent en el navegador** (WebRTC + trackers WebSocket), selección de archivo dentro del torrent, métricas de peers y velocidad, prioridad secuencial con ventana temporal, búfer efímero en RAM o IndexedDB, reinicio automático al superar el límite de memoria y limpieza avanzada. Ver [recap.md](recap.md).

## Qué hace (y qué no)

- Reproduce contenido multimedia **autorizado** desde: magnet links y archivos `.torrent` (WebTorrent en navegador, solo peers compatibles con WebRTC), archivos multimedia locales, URLs multimedia introducidas manualmente, playlists JSON. M3U/M3U8 y HLS llegan en la Fase 3.
- Mantiene **todo** en el navegador: preferencias, tema, configuración del reproductor, calidad y búfer, playlists, historial, favoritos, metadatos introducidos por ti, modo TV y diagnósticos no sensibles.
- Prioriza un **modo de reproducción temporal**: no descarga intencionadamente el archivo completo, pide las piezas cercanas a la posición actual, mantiene una ventana futura e histórica configurable y limpia el resto al detener, cambiar de fuente o cerrar.
- **No** incluye buscador, indexador, scraping, catálogo remoto, cuentas, telemetría, analítica ni proxy.

No describimos el producto como «no descarga nada»: toda reproducción necesita transferir datos al navegador, y el navegador o la librería P2P pueden aplicar cachés internas que no siempre controla la aplicación.

## Restricciones de diseño (obligatorias)

| Requisito                        | Cumplimiento                                                                                                                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sin base de datos                | Solo `localStorage`, `sessionStorage`, IndexedDB **local** (búfer efímero opcional) y memoria. IndexedDB no es una base de datos remota ni un servidor.                                                             |
| Sin backend                      | Ningún proceso Node.js en producción. Node solo compila y sirve en desarrollo.                                                                                                                                      |
| Sin servicios de pago ni cuentas | No hay claves API, suscripciones, Firebase, Supabase, OAuth, trackers privados ni señalización propia. Los trackers WebSocket públicos son una dependencia del protocolo WebTorrent, configurables y desactivables. |
| Open source                      | Licencia MIT; dependencias MIT/Apache-2.0 ([docs/LICENSES.md](docs/LICENSES.md)).                                                                                                                                   |
| Offline                          | La interfaz y la configuración funcionan sin red (Service Worker con app shell). El streaming P2P y las URLs remotas necesitan Internet.                                                                            |

## Limitaciones técnicas reales

Se muestran en la aplicación (`/about`, `/diagnostics`) y en [docs/STREAMING-LIMITATIONS.md](docs/STREAMING-LIMITATIONS.md). Resumen:

- BitTorrent requiere transferir piezas al dispositivo; no se puede reproducir una pieza que ningún peer tenga.
- Un navegador solo conecta con peers compatibles con **WebRTC/WebTorrent**, no con todos los peers BitTorrent TCP/UDP tradicionales. Habrá menos peers que en un cliente nativo.
- El soporte depende de WebRTC, MediaSource Extensions, codecs y políticas del navegador. No se garantiza 4K en todos los TV boxes.
- No hay transcodificación: un archivo 4K único no se convierte a 1080p. La selección de resolución solo elige entre variantes existentes.
- El navegador o el sistema operativo pueden limpiar el almacenamiento local o limitar memoria. La limpieza final al cerrar la pestaña es best effort.

## Inicio rápido

```bash
npm install
npm run dev        # servidor de desarrollo (Vite)
npm run build      # salida estática en dist/
npm run preview    # sirve dist/ localmente
npm run test       # Vitest + React Testing Library
npm run test:e2e   # Playwright (usa npm run preview); incluye streaming P2P real con tracker local
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
npm run clean      # elimina dist/, coverage/, informes
```

Requisitos: Node.js ≥ 20 solo para compilar. El resultado en `dist/` no necesita Node.

## Despliegue

`dist/` es un sitio estático con `base: './'` y **hash routing** (`/#/playlists`), por lo que funciona en subcarpetas y recargas sin configurar fallbacks en el servidor. Guía completa en [docs/STATIC-DEPLOYMENT.md](docs/STATIC-DEPLOYMENT.md).

## Documentación

| Documento                                                      | Contenido                                                                                    |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)                   | Arquitectura client-side, módulos, abstracciones `StreamingEngine` y `EphemeralBufferStore`. |
| [docs/STATIC-DEPLOYMENT.md](docs/STATIC-DEPLOYMENT.md)         | GitHub Pages, GitLab Pages, Cloudflare Pages, Netlify, Nginx, servidor local.                |
| [docs/PRIVACY.md](docs/PRIVACY.md)                             | Política de privacidad local.                                                                |
| [docs/SECURITY.md](docs/SECURITY.md)                           | Validación, sanitización, CSP, límites.                                                      |
| [docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md)                 | Teclado, foco, contraste, ARIA.                                                              |
| [docs/TV-COMPATIBILITY.md](docs/TV-COMPATIBILITY.md)           | Modo TV, D-pad, TV boxes.                                                                    |
| [docs/BROWSER-COMPATIBILITY.md](docs/BROWSER-COMPATIBILITY.md) | APIs requeridas por navegador.                                                               |
| [docs/STREAMING-LIMITATIONS.md](docs/STREAMING-LIMITATIONS.md) | Limitaciones de WebTorrent/WebRTC en navegador.                                              |
| [docs/LOCAL-STORAGE.md](docs/LOCAL-STORAGE.md)                 | Qué se guarda, dónde y cómo borrarlo.                                                        |
| [docs/PLAYLIST-SCHEMA.md](docs/PLAYLIST-SCHEMA.md)             | Esquema JSON versionado.                                                                     |
| [docs/TESTING.md](docs/TESTING.md)                             | Estrategia de pruebas y adapters falsos.                                                     |
| [docs/LICENSES.md](docs/LICENSES.md)                           | Licencias de dependencias.                                                                   |
| [CONTRIBUTING.md](CONTRIBUTING.md)                             | Cómo contribuir.                                                                             |
| [recap.md](recap.md)                                           | Registro acumulativo por fases.                                                              |

## Uso responsable

Todos los usos deben respetar los derechos y licencias aplicables al contenido. OVtorrent no facilita el descubrimiento de contenido de terceros.
