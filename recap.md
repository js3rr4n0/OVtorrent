# recap.md

Registro acumulativo del proyecto. **Nunca se borran entradas anteriores**; cada fase añade una entrada al final.

---

## 2026-10-04 — Fase 1 completada

### Fase completada

Fase 1: PWA estática con React y TypeScript, biblioteca local, playlists locales, importación JSON, importación de magnet, reproductor HTML5, configuración de buffering, IndexedDB local opcional, modo TV básico, diagnóstico de capacidades, limpieza de sesión, tests principales y documentación base.

### Archivos creados

- Configuración: `package.json`, `tsconfig*.json`, `vite.config.ts` (base relativa, CSP en build, PWA), `vitest.config.ts`, `playwright.config.ts`, `eslint.config.js`, `.prettierrc`, `.gitignore`, `.npmrc`, `index.html`, `LICENSE`.
- Scripts: `scripts/clean.mjs`, `scripts/generate-icons.mjs` (PNG generados sin dependencias nativas).
- Recursos: `public/icons/icon.svg`, `icon-192.png`, `icon-512.png`, `public/robots.txt`.
- Núcleo (`src/core`): `schemas/` (media, playlist v1, settings, history, export), `storage/` (StorageAdapter, claves, jsonStore, wrapper IndexedDB), `buffer/` (tipos + política de ventanas, Memory/IndexedDb/NoPersistence stores, factoría), `streaming/` (contratos, capacidades, HtmlMediaEngine, registry, sessionId), `import/` (magnet, torrentFile con bencode propio, json), `security/sanitize.ts`, `media/compat.ts`, `tv/` (detect, spatialNavigation), `cleanup/SessionCleanup.ts`.
- Estado (`src/state`): storage, settingsStore, libraryStore, playlistStore, historyStore, sessionStore, dataManagement.
- Aplicación (`src/app`): AppShell, router (hash), PwaUpdatePrompt, OfflineBanner, hooks useTheme/useTvMode/useDocumentTitle.
- Componentes: `ui.tsx`, `ConfirmDialog.tsx`, `format.ts`.
- Pantallas: biblioteca (+ MediaItemRow, AddToPlaylistDialog), importación (magnet, .torrent, archivo local, URL, JSON), playlists (lista, detalle, exportación), reproductor (PlayerPage, PlayerControls, PlayerIndicators, usePlaybackSession), historial, ajustes (general, playback, storage, tv), diagnóstico, acerca de.
- Tests: `src/test/setup.ts`, `src/test/fakes/*`, `src/test/stubs/pwa-register.ts`, 11 archivos de test unitario/integración, `e2e/app.spec.ts`.
- Documentación: `README.md`, `CONTRIBUTING.md`, `recap.md`, `docs/ARCHITECTURE.md`, `docs/STATIC-DEPLOYMENT.md`, `docs/PRIVACY.md`, `docs/SECURITY.md`, `docs/ACCESSIBILITY.md`, `docs/TV-COMPATIBILITY.md`, `docs/BROWSER-COMPATIBILITY.md`, `docs/STREAMING-LIMITATIONS.md`, `docs/LOCAL-STORAGE.md`, `docs/PLAYLIST-SCHEMA.md`, `docs/TESTING.md`, `docs/LICENSES.md`.
- CI: `.github/workflows/ci.yml`, `.github/workflows/deploy-pages.yml`.

### Archivos modificados

Ninguno: el repositorio estaba vacío.

### Funcionalidades implementadas

- PWA instalable con Service Worker que solo precachea el app shell (sin runtime caching de medios). Aviso de actualización y banner offline.
- Hash routing con todas las pantallas requeridas: `/`, `/import`, `/playlists`, `/playlists/:id`, `/player/:id`, `/history`, `/settings`, `/settings/playback`, `/settings/storage`, `/settings/tv`, `/diagnostics`, `/about`.
- Biblioteca local con búsqueda, filtro por tipo/favoritos, favoritos, eliminación con confirmación, añadir a playlist.
- Importación: magnet (hex/base32, normalización, aviso si no hay trackers WebSocket), `.torrent` (parser bencode seguro, hash SHA-1, lista de archivos), archivos locales (object URLs, sin copiar), URLs con validación de esquema y confirmación de fuente externa, playlist JSON con errores por campo, límite y confirmación de listas grandes.
- Playlists: crear, editar, renombrar, duplicar, eliminar, importar, exportar, reordenar, reproducir todo, aleatorio, repetición, progreso.
- Reproductor HTML5: play/pause/stop/seek, ±10 s/±30 s, volumen, silencio, pantalla completa, PiP, siguiente/anterior, repetir, aleatorio, velocidad, subtítulos WebVTT locales, selección de calidad entre variantes existentes, indicadores (estado, motor, resolución, bitrate, buffering, peers, velocidad, disponibilidad, caché temporal), mensajes de error claros, atajos de teclado.
- Calidad: Auto / Ahorro / Balanceado / Máxima, 480p–2160p, bitrate máximo y mínimo, prioridad estabilidad/calidad/inicio rápido, con explicación de que solo selecciona variantes existentes.
- Búfer: presets Ahorro (15/45/5), Balanceado (30/90/15), 4K estable (60/180/30), Personalizado; almacén sin persistencia (defecto), memoria limitada o IndexedDB efímero; estimación de espacio; límites de peers y concurrencia.
- Limpieza: al detener, cambiar de fuente, cerrar sesión, superar límite de memoria, seek lejano, cambiar de elemento, `pagehide`, `beforeunload`, `visibilitychange`.
- Almacenamiento: exportar/importar toda la configuración a JSON, eliminar todo / solo historial / solo playlists / solo caché, restablecer configuración; funcionamiento con almacenamiento lleno o deshabilitado.
- Modo TV: detección por user agent y activación manual, navegación espacial con flechas/D-pad, Back/Escape/Backspace, foco visible, objetivos ≥ 48 px, texto grande, alto contraste, ocultar diagnósticos.
- Diagnóstico: navegador, SO, pantalla, WebRTC, DataChannel, MediaSource, IndexedDB, localStorage, Service Worker, PiP, pantalla completa, Workers, File System Access, contexto seguro, codecs, conexión, memoria, almacenamiento, limitaciones detectadas, informe copiable.
- Privacidad y seguridad: sin telemetría ni terceros, CSP en build, validación Zod estricta, bloqueo de `javascript:`/`data:`, sanitización de metadatos, sin `eval`.

### Decisiones arquitectónicas

- Vite + React + TypeScript strict en lugar de Next.js para garantizar exportación estática sin rutas de servidor.
- Hash routing para evitar 404 en recargas en hosting estático.
- Abstracciones `StreamingEngine`/`StreamingSession` y `EphemeralBufferStore` definidas en la Fase 1 con `HtmlMediaEngine` como implementación de referencia; `resolveEngine()` explica por qué una fuente no se puede reproducir en lugar de simularlo.
- `NoPersistenceBufferStore` como modo predeterminado.
- Wrapper propio de IndexedDB (sin Dexie) y decodificador bencode propio (sin dependencias) para minimizar superficie.
- CSP inyectada solo en build porque el dev server necesita scripts inline.
- Service Worker con `clientsClaim: true` (control inmediato de la pestaña abierta, la interfaz es offline-capable desde la primera visita) y `registerType: 'prompt'` (las actualizaciones esperan confirmación del usuario). `errorElement` en el router para explicar fallos de carga de pantallas sin conexión.
- Archivos locales nunca se persisten: se guarda el nombre y se pide volver a seleccionar.

### Limitaciones conocidas

- Los magnets y `.torrent` se importan pero no se reproducen hasta la Fase 2 (WebTorrent en navegador). El reproductor lo indica.
- Sin M3U/M3U8, HLS multivariant, carpetas locales, conversión SRT ni selección de pista de audio (Fase 3).
- El bitrate no se puede medir con el motor HTML5; se muestra «n/d».
- La limpieza al cerrar la pestaña es best effort.
- El tamaño del chunk principal (~245 KB sin comprimir) puede optimizarse en la Fase 4.

### Pruebas ejecutadas

- `npm run lint`: sin errores.
- `npm run typecheck`: sin errores.
- `npm run test`: 11 archivos, 64 tests, todos pasan.
- `npm run build`: sitio estático en `dist/` (30 entradas precacheadas, ~542 KiB).
- `npm run test:e2e`: 8 escenarios Playwright en Chromium, todos pasan.

### Comandos utilizados

`npm install`, `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, `npm run test:e2e`, `node scripts/generate-icons.mjs`.

### Tareas pendientes

- **Fase 2**: integración de WebTorrent para navegador (`WebTorrentStreamingEngine`), selección de archivo dentro del torrent, métricas de peers y velocidad, prioridad secuencial, búfer temporal conectado al motor, manejo avanzado de errores, limpieza avanzada, configuración de trackers WebSocket públicos documentada como dependencia del protocolo.
- **Fase 3**: importación M3U/M3U8, HLS multivariant, selección de calidad por variantes HLS, subtítulos SRT→VTT, audio multicanal, mejoras para TV boxes, compatibilidad ampliada.
- **Fase 4**: optimización de memoria, Worker para parsing y métricas, exportación completa, diagnóstico ampliado, pruebas de compatibilidad, auditoría de seguridad y accesibilidad.

---

## 2026-10-04 — Fase 2 completada

### Fase completada

Fase 2: integración de WebTorrent para navegador, selección de archivo dentro del torrent, métricas de peers y velocidad, prioridad secuencial, búfer temporal, manejo avanzado de errores y limpieza avanzada.

### Archivos creados

- `src/core/streaming/webtorrent/types.ts` (tipos estructurales del subconjunto de API de WebTorrent v3), `trackers.ts` (trackers WebSocket públicos por defecto y validación), `windowPolicy.ts` (ventana, piezas críticas, throttling, piezas expiradas, archivo por defecto), `EphemeralChunkStore.ts` (adaptador abstract-chunk-store → `EphemeralBufferStore`), `loadWebTorrent.ts` (carga diferida del bundle, cliente compartido, registro del Service Worker de streaming), `WebTorrentStreamingEngine.ts` (motor y sesión), `index.ts`.
- `public/webtorrent-sw.js`: handler de streaming para el Service Worker (reimplementación legible del protocolo de `webtorrent/dist/sw.min.js`, sin `skipWaiting`).
- `src/types/webtorrent-dist.d.ts`: tipado del bundle `webtorrent/dist/webtorrent.min.js`.
- `src/test/fakes/FakeWebTorrentClient.ts`, `src/core/streaming/webtorrent/__tests__/engine.test.ts`, `windowPolicy.test.ts`.
- `e2e/p2p.spec.ts` (streaming P2P real con tracker local y dos contextos de navegador), `e2e/types.d.ts`.

### Archivos modificados

- `package.json` (dependencia `webtorrent`), `vite.config.ts` (`importScripts` del handler, `globIgnores`, CSP `connect-src ws:`), `tsconfig.node.json` (`DOM.Iterable`).
- `src/core/schemas/settings.ts`: sección `p2p` (trackers por defecto, trackers propios, subida, tiempo sin peers, reinicio por memoria) opcional con valores por defecto para no invalidar ajustes guardados.
- `src/core/buffer/IndexedDbBufferStore.ts`: metadatos de piezas en memoria (sin releer datos de IndexedDB para ventana ni uso), límite infinito permitido.
- `src/core/streaming/registry.ts`: magnet/torrent → `WebTorrentStreamingEngine` cuando hay WebRTC DataChannel, Service Worker y contexto seguro; en caso contrario, causas explícitas.
- `src/core/import/magnet.ts`, `torrentFile.ts`: el `xt=urn:btih:` se mantiene literal (los parsers rechazan la urn percent-encoded; detectado por el test P2P real).
- `src/features/player/usePlaybackSession.ts` (metadatos, índice de archivo, corrección de sobrescritura del estado de error), `PlayerPage.tsx` (selector de archivo del torrent, aviso de conexión, lista de avisos), `PlayerIndicators.tsx` (velocidad de subida, caché de la sesión P2P).
- `src/features/settings/PlaybackSettingsPage.tsx`: tarjeta P2P.
- Textos de `MagnetImport`, `AboutPage`, `DiagnosticsPage`; tests de registro, páginas y streaming; `e2e/app.spec.ts`.
- Documentación: README, ARCHITECTURE, STREAMING-LIMITATIONS, LOCAL-STORAGE, PRIVACY, SECURITY, LICENSES, TESTING, BROWSER-COMPATIBILITY.

### Funcionalidades implementadas

- Reproducción de magnets y `.torrent` en el navegador con WebTorrent (WebRTC DataChannels + trackers WebSocket), entregada al `<video>` como stream HTTP con rangos por el Service Worker.
- Selección del archivo dentro del torrent (por defecto el mayor con contenedor reproducible); solo se descargan piezas del archivo elegido.
- Prioridad secuencial con piezas críticas en el playhead y en cada seek; ventana futura aplicada mediante throttling de descarga; reinicio automático desde la posición actual al superar el límite de memoria; liberación de peers, store y object URLs al detener; limpieza en ciclo de vida de la página.
- Búfer temporal en RAM (predeterminado) o IndexedDB efímero inyectado en WebTorrent; nunca OPFS.
- Métricas: peers, velocidad de descarga y subida, disponibilidad, búfer, bytes en caché, bitrate aproximado, resolución, reinicios.
- Manejo de errores: sin WebRTC/Service Worker/contexto seguro, timeout de metadatos, sin peers tras el tiempo configurado («Esta fuente no tiene peers compatibles con el transporte web disponible en este navegador»), avisos del protocolo, autoplay bloqueado, errores de codec/contenedor del `<video>`.
- Ajustes P2P: trackers por defecto (desactivables), trackers propios validados, compartir piezas, tiempo sin peers, reinicio por memoria.

### Decisiones arquitectónicas

- Un único Service Worker: el handler de streaming se importa dentro del worker de Workbox porque las peticiones de una página siempre van al worker que la controla; en desarrollo se registra solo.
- Reimplementación del `sw.min.js` de WebTorrent para no forzar `skipWaiting()` y conservar el aviso de actualización de la PWA.
- Store efímero propio inyectado en WebTorrent (RAM o IndexedDB) en lugar de su OPFS por defecto.
- Ventana por throttling y reinicio por memoria, no por borrado de piezas por debajo del motor (lo corrompería).
- Cliente WebTorrent compartido por pestaña, cargado bajo demanda como chunk separado.

### Limitaciones conocidas

- Solo peers WebRTC/WebTorrent; sin trackers WebSocket alcanzables no habrá peers.
- El throttling limita la descarga adelantada pero no cancela piezas una a una; el reinicio por memoria implica un corte breve.
- Contenedores no reproducibles progresivamente por el navegador (MKV con codecs no soportados, MP4 sin `faststart`) pueden fallar aunque haya peers.
- Bitrate aproximado; sin selección de pista de audio ni subtítulos SRT (Fase 3).
- El `BrowserServer` depende de streams en respuestas del Service Worker (Safari antiguo no soportado).

### Pruebas ejecutadas

- `npm run lint`, `npm run typecheck`: sin errores.
- `npm run test`: 13 archivos, 82 tests, todos pasan.
- `npm run build`: sitio estático; bundle de WebTorrent como chunk diferido (~222 KB, 67 KB gzip).
- `npm run test:e2e`: 9 escenarios Playwright, incluido streaming P2P real entre dos contextos de Chromium con tracker local.

### Comandos utilizados

`npm install webtorrent`, `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, `npm run test:e2e`.

### Tareas pendientes

- **Fase 3**: importación M3U/M3U8, HLS multivariant, selección de calidad por variantes HLS, subtítulos SRT→VTT, audio multicanal, mejoras para TV boxes, compatibilidad ampliada.
- **Fase 4**: optimización de memoria, Worker para parsing y métricas, exportación completa, diagnóstico ampliado, pruebas de compatibilidad, auditoría de seguridad y accesibilidad.

---

## 2026-10-04 — Fase 3 completada

### Fase completada

Fase 3: importación M3U/M3U8, HLS multivariant, selección de calidad, subtítulos, audio multicanal cuando el navegador lo soporte, mejoras para TV boxes y compatibilidad ampliada.

### Archivos creados

- `src/core/import/m3u.ts`: parser y importador M3U/M3U8 (listas de medios, HLS master y HLS de segmentos), con tests en `src/core/import/__tests__/m3u.test.ts`.
- `src/core/subtitles/srtToVtt.ts`: detección SRT/VTT y conversión local a WebVTT con limpieza de etiquetas; tests en `src/core/subtitles/__tests__/srtToVtt.test.ts`.
- `src/core/streaming/hls/`: `types.ts` (subconjunto estructural de hls.js), `loadHls.ts` (carga diferida), `qualityPolicy.ts` (niveles permitidos, tope automático, nivel inicial, configuración desde la ventana de búfer), `HlsStreamingEngine.ts` (motor nativo o hls.js con variantes, pistas de audio, subtítulos, reintentos), `index.ts`; tests en `__tests__/hls.test.ts`.
- `src/test/fakes/FakeHls.ts`.
- `src/features/import/M3uImport.tsx` (archivo, URL con confirmación y descarga única, texto pegado, URL base, creación de playlist).
- `src/features/player/TrackSelectors.tsx` (calidad, pista de audio, subtítulos: engine + archivo local .srt/.vtt).

### Archivos modificados

- `package.json` (dependencia `hls.js`, Apache-2.0).
- `src/core/streaming/types.ts`: `VariantOption`, `TrackOption` y métodos opcionales `variants/selectVariant`, `audioTracks/selectAudioTrack`, `subtitleTracks/selectSubtitleTrack` en `StreamingSession`.
- `src/core/streaming/capabilities.ts`: `hasNativeHls`, `hasMseForHls`, `hasAudioTracksApi`.
- `src/core/streaming/registry.ts`: `hls` → `HlsStreamingEngine`; `m3u` explicado como lista importable.
- `src/core/streaming/HtmlMediaEngine.ts`: pistas de audio mediante `AudioTrackList` (helpers reutilizados por HLS nativo).
- `src/core/streaming/webtorrent/WebTorrentStreamingEngine.ts` y `types.ts`: subtítulos .srt/.vtt dentro del torrent (`file.arrayBuffer`, conversión local, object URL liberada al limpiar); fake actualizado.
- `src/core/schemas/settings.ts`: `tv.simplifiedPlayer` y `tv.autoFocusPlayer` (opcionales con valor por defecto).
- `src/features/player/PlayerControls.tsx` (modo simplificado con «Más», foco configurable), `PlayerPage.tsx` (selectores de pistas, panel TV), `src/features/settings/TvSettingsPage.tsx`, `src/features/import/ImportPage.tsx` (pestaña M3U / M3U8), `UrlImport.tsx` (las URL `.m3u8` se añaden como fuente HLS), `src/features/diagnostics/DiagnosticsPage.tsx` (HLS nativo, hls.js, AudioTrackList y limitaciones asociadas).
- `e2e/app.spec.ts`: importación M3U, subtítulos SRT locales, panel TV simplificado.
- Documentación: README, ARCHITECTURE, STREAMING-LIMITATIONS, SECURITY, LICENSES, TESTING, BROWSER-COMPATIBILITY, ACCESSIBILITY, TV-COMPATIBILITY, LOCAL-STORAGE, PRIVACY, PLAYLIST-SCHEMA.

### Funcionalidades implementadas

- Importación M3U/M3U8 por archivo, URL (descarga única con confirmación) o texto pegado: listas de medios → elementos `url`/`hls`/`magnet` validados con errores por línea, límite de 500 y confirmación a partir de 50; playlists HLS → una fuente `hls` con las variantes declaradas en la descripción. Opción de crear playlist además de añadir a la biblioteca.
- Reproducción HLS: nativa cuando el navegador la ofrece; en caso contrario hls.js (carga diferida) sobre MediaSource/ManagedMediaSource con la ventana de búfer aplicada (`maxBufferLength`, `backBufferLength`), tope automático y nivel inicial según los ajustes de calidad (resolución preferida, presets, bitrate máximo/mínimo, prioridad), recuperación de errores de red y de decodificación con mensajes claros.
- Selección de calidad: variantes HLS declaradas («Auto» + niveles) o, en su defecto, versiones del mismo título en la playlist. Nunca se transcodifica.
- Subtítulos: archivo local `.srt` (convertido a WebVTT en el navegador) o `.vtt`; archivos `.srt`/`.vtt` incluidos en el torrent; pistas declaradas en HLS.
- Pistas de audio: declaradas en HLS (hls.js) o expuestas por `AudioTrackList` en archivos/URLs cuando el navegador lo soporta; el audio multicanal depende de los codecs del dispositivo y se indica así.
- Modo TV: panel de reproducción simplificado con «Más», foco automático en reproducir (configurables), diagnóstico ampliado (HLS nativo, hls.js, pistas de audio).

### Decisiones arquitectónicas

- API opcional de pistas/variantes en `StreamingSession` para que cada motor exponga solo lo que existe; el reproductor no inventa opciones.
- HLS nativo primero y hls.js solo bajo demanda para no cargar ~190 KB gzip en Safari/TV con soporte nativo.
- Las listas M3U se convierten en elementos individuales (no existe un «motor M3U»); las playlists HLS requieren URL porque no pueden reproducirse desde texto pegado.
- Conversión SRT → WebVTT propia (sin dependencia) con lista blanca de etiquetas.

### Limitaciones conocidas

- Con HLS nativo la variante la elige el navegador; los ajustes de calidad solo informan.
- HLS requiere CORS en el servidor y no soporta DRM.
- `AudioTrackList` solo existe en Safari (y Chromium con flags); en otros navegadores las pistas alternativas solo funcionan en HLS.
- No hay e2e de reproducción HLS real (no se dispone de un codificador para generar segmentos en el entorno); el motor se prueba con un hls.js falso.
- Carpetas locales (File System Access API) siguen pendientes.

### Pruebas ejecutadas

- `npm run lint`, `npm run typecheck`: sin errores.
- `npm run test`: 16 archivos, 101 tests, todos pasan.
- `npm run build`: hls.js como chunk diferido independiente.
- `npm run test:e2e`: 12 escenarios Playwright (9 anteriores + M3U, subtítulos SRT y panel TV).

### Comandos utilizados

`npm install hls.js`, `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, `npm run test:e2e`.

### Tareas pendientes

- **Fase 4**: optimización de memoria, Worker para parsing y métricas, exportación completa de configuración, diagnóstico ampliado, pruebas de compatibilidad, auditoría de seguridad y accesibilidad, carpetas locales con File System Access API.

---

## 2026-10-04 — Fase 4 completada

### Fase completada

Fase 4: optimización de memoria, Worker para parsing y métricas, exportación completa de configuración, diagnóstico ampliado, pruebas de compatibilidad, auditoría de seguridad y auditoría de accesibilidad. Además se cerró la tarea pendiente de carpetas locales (File System Access API con fallback clásico).

### Archivos creados

- `src/workers/protocol.ts` (trabajos, respuestas, disponibilidad por bitfields), `jobs.ts` (`runJob`), `parse.worker.ts` (Worker de módulo), `workerClient.ts` (`ParseWorkerClient` con tiempo máximo y fallback al hilo principal), `__tests__/worker.test.ts`.
- `src/core/memory/memoryPolicy.ts` (perfil de memoria y plan de búfer efectivo) y `__tests__/memoryPolicy.test.ts`.
- `src/core/compat/mediaCapabilities.ts` (sondas de decodificación por perfil), `webrtcProbe.ts` (autoprueba WebRTC local sin STUN), `__tests__/compat.test.ts`.
- `src/components/VirtualList.tsx` (lista virtualizada sin dependencias, semántica de lista y foco visible).
- `src/features/diagnostics/extendedReport.ts`, `ExtendedDiagnostics.tsx` (memoria, worker, almacenamiento persistente, Service Worker, tabla MediaCapabilities, botón «Probar WebRTC»).
- `src/features/settings/exportSections.ts` (exportación por secciones, vista previa de bundles).
- `src/features/import/folderScan.ts`, `FolderImport.tsx` (carpetas locales: `showDirectoryPicker` o `<input webkitdirectory>`; límites de 500 archivos y 6 niveles; playlist con el nombre de la carpeta).
- `src/test/audit/security.test.ts` (auditoría de seguridad estática ejecutada con los tests), `src/features/__tests__/phase4.test.tsx`.
- `e2e/a11y.spec.ts` (axe-core en todas las rutas, modo TV y reproductor).
- `docs/SECURITY-AUDIT.md`, `docs/ACCESSIBILITY-AUDIT.md`, `docs/COMPATIBILITY-TESTS.md`.

### Archivos modificados

- `package.json` / `package-lock.json`: `@axe-core/playwright` y `@testing-library/dom` (desarrollo); Vitest actualizado a 4.x para resolver el aviso de `@vitest/mocker`. La instalación requirió `--legacy-peer-deps` por un fallo de npm 10 (`edgesOut`) al resolver los peers opcionales de Vitest 4.
- `tsconfig.app.json` / `tsconfig.node.json`: el test de auditoría (Node) se compila con el tsconfig de Node.
- `src/core/schemas/settings.ts`: `buffer.autoLowMemory` (opcional, por defecto activado).
- `src/core/streaming/webtorrent/WebTorrentStreamingEngine.ts`: plan de búfer efectivo (memoria), disponibilidad calculada en el Worker a partir de bitfields serializados (`bitfieldBytes`), sondeo reducido con la pestaña oculta; `types.ts` y fake ampliados.
- `src/core/streaming/hls/HlsStreamingEngine.ts`: plan de búfer efectivo.
- `src/features/player/usePlaybackSession.ts`: métricas pausadas con la pestaña oculta.
- `src/features/library/LibraryPage.tsx`: lista virtualizada a partir de 80 elementos.
- `src/features/import/JsonPlaylistImport.tsx`, `M3uImport.tsx`, `TorrentFileImport.tsx`: parsing a través del Worker; `LocalFileImport.tsx` incluye la importación de carpetas; `ImportPage.tsx`.
- `src/features/settings/StorageSettingsPage.tsx` (secciones a exportar, vista previa antes de aplicar la importación), `PlaybackSettingsPage.tsx` (reducción automática en poca memoria).
- `src/features/diagnostics/DiagnosticsPage.tsx` (informe ampliado incluido en «Copiar informe»).
- `src/components/ConfirmDialog.tsx` (devuelve el foco al disparador al cerrar), `src/components/ui.tsx` (colores de `Badge` con contraste AA, hallazgo de la auditoría axe).
- Documentación: README, ARCHITECTURE, TESTING, LICENSES, LOCAL-STORAGE, TV-COMPATIBILITY.

### Funcionalidades implementadas

- Worker de parsing y métricas (M3U, JSON, `.torrent` con hash SHA-1, disponibilidad de piezas) con fallback transparente al hilo principal y tiempo máximo por trabajo; estado visible en Diagnóstico.
- Optimización de memoria: ventana y límite reducidos automáticamente en dispositivos con ≤ 2 GB (con aviso y opt-out), listas virtualizadas, sondeo de métricas pausado en pestañas ocultas, bitfields copiados fuera del hilo principal para la disponibilidad.
- Exportación completa y selectiva (ajustes, biblioteca, playlists, favoritos, historial) y vista previa validada antes de aplicar una importación.
- Diagnóstico ampliado: memoria del dispositivo y heap JS, modo del worker con ida y vuelta, almacenamiento persistente, estado del Service Worker, tabla de decodificación MediaCapabilities (H.264/VP9/HEVC/AV1 a 1080p y 2160p, archivo y MediaSource) con resumen de limitaciones, autoprueba WebRTC manual sin STUN.
- Carpetas locales con File System Access API o selector clásico.
- Auditoría de seguridad: test estático de patrones prohibidos, CSP, `index.html`, licencias de producción y Service Worker de streaming; `npm audit` analizado y documentado.
- Auditoría de accesibilidad: axe-core en todas las pantallas, modo TV y reproductor sin violaciones graves; foco devuelto al cerrar diálogos; contraste de etiquetas corregido.

### Decisiones arquitectónicas

- El Worker ejecuta exactamente el mismo `runJob` que el fallback: ninguna función depende de que exista un Worker.
- La disponibilidad se calcula sobre copias de los bitfields (bytes MSB-first) en lugar de recorrer objetos de WebTorrent en el hilo principal.
- La reducción por poca memoria es un «plan efectivo» calculado al crear la sesión y siempre notificado; los ajustes del usuario no se modifican.
- Las auditorías son ejecutables: fallan la suite si reaparece un patrón prohibido o una violación axe grave.

### Limitaciones conocidas

- `npm audit` mantiene un aviso en `ip` (vía `bittorrent-tracker` → `webtorrent`) que no alcanza al bundle del navegador; documentado en `docs/SECURITY-AUDIT.md`.
- `performance.memory` y `deviceMemory` solo existen en navegadores Chromium; en otros se muestra «no expuesto».
- Las pruebas con lectores de pantalla en dispositivos reales siguen pendientes.
- La instalación limpia necesita `npm install --legacy-peer-deps` con npm 10 (ver arriba).

### Pruebas ejecutadas

- `npm run lint`, `npm run typecheck`: sin errores.
- `npm run test` (Vitest 4): 21 archivos, 122 tests, todos pasan (incluida la auditoría de seguridad estática).
- `npm run build`: Worker de parsing como chunk independiente.
- `npm run test:e2e`: 23 escenarios Playwright (aplicación, P2P real y 11 auditorías axe), todos pasan tras corregir el contraste de `Badge`.
- `npm audit --omit=dev`: 4 avisos transitivos de `ip` sin impacto en el navegador; `npm audit` sin avisos de desarrollo tras actualizar Vitest.

### Comandos utilizados

`npm install --legacy-peer-deps`, `npm install -D @axe-core/playwright @testing-library/dom --legacy-peer-deps`, `npm audit`, `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, `npm run test:e2e`.

### Tareas pendientes

- Pruebas con lectores de pantalla (NVDA, VoiceOver, TalkBack) en dispositivos reales.
- Revisar `npm audit` en cada actualización de `webtorrent` y `hls.js`.
- Posibles mejoras futuras fuera del plan: anuncios `aria-live` más granulares en el reproductor, virtualización del detalle de playlist, e2e de HLS real cuando el entorno disponga de un codificador.

---

## 2026-10-04 — Corrección tras la Fase 4: magnets sin peers web

### Problema

Al importar un magnet con solo trackers `udp://`, el reproductor mostraba un aviso por cada tracker («Unsupported tracker protocol»), un error de conexión con `wss://tracker.btorrent.xyz` (tracker caído desde hace años) y se quedaba en «Conectando…» sin explicar qué ocurría ni qué hacer.

### Cambios

- `src/core/streaming/webtorrent/trackers.ts`: lista por defecto sin `btorrent.xyz`; añadidos `tracker.files.fm:7073` y `tracker.novage.com.ua`.
- `WebTorrentStreamingEngine.ts`: los avisos «Unsupported tracker protocol» dejan de listarse (se cuentan como trackers UDP/HTTP ignorados); los errores de conexión se consolidan y solo son aviso cuando ningún tracker WebSocket responde; se escucha `trackerAnnounce` para saber cuántos trackers responden; nuevo `metrics().status` con «Trackers WebSocket: N (M respondieron) · K trackers UDP/HTTP ignorados · Peers web: P»; el mensaje de falta de peers y el timeout de metadatos incluyen la guía honesta (`NO_PEERS_GUIDANCE`): hace falta un peer WebRTC, p. ej. un cliente híbrido como WebTorrent Desktop en otro dispositivo.
- `src/core/streaming/types.ts`: campo opcional `status` en `StreamingMetrics`.
- `PlayerPage.tsx`: el aviso de conexión muestra el estado de trackers y peers en tiempo real.
- Documentación: `STREAMING-LIMITATIONS.md` (sección «Por qué un magnet popular puede no reproducirse»), `PRIVACY.md`.

### Lo que no se puede arreglar

Un navegador no puede conectar con peers BitTorrent clásicos. Si el enjambre no tiene peers WebRTC, el torrent no se reproduce en la web; la aplicación lo dice claramente y no simula lo contrario (regla de honestidad técnica).

---

## 2026-10-04 — Puente autoalojado: «pegar un magnet y reproducir»

### Petición

El usuario pidió que baste con pegar cualquier magnet y reproducir. Un navegador no puede alcanzar los enjambres BitTorrent clásicos (TCP/UDP), así que la única solución honesta es un puente que corra fuera del navegador. Se ha construido como componente **opcional y autoalojado**, documentando que es una excepción deliberada a la restricción «sin procesos fuera del navegador» del prompt maestro; la aplicación web sigue funcionando sin él.

### Archivos creados

- `bridge/` (paquete Node.js independiente, MIT): `package.json`, `src/protocol.mjs` (hash de encuentro, mensajes JSON, validación), `src/extension.mjs` (extensión BitTorrent `ovt_bridge`), `src/bridge.mjs` (cliente WebTorrent híbrido: TCP/uTP/DHT para el enjambre clásico y WebRTC para el navegador; descarga secuencial a disco; estado cada 2 s; **solo responde ofertas WebRTC**), `src/cli.mjs` (`--code`, `--dir`, `--tracker`, `--name`), `test/protocol.test.mjs`.
- `src/core/streaming/webtorrent/bridge/protocol.ts` (mismo protocolo en el navegador, SHA-1 con WebCrypto), `BridgeClient.ts` (torrent de encuentro en el cliente compartido, extensión, cola de magnets, estado, re-anuncio periódico mientras no hay puente), `index.ts`, `__tests__/bridge.test.ts`.
- `src/app/bridgeBoot.ts` (empareja según `p2p.bridgeCode`), `src/state/bridgeStore.ts`.
- `e2e/bridge.spec.ts`, `docs/BRIDGE.md`.

### Archivos modificados

- `src/core/schemas/settings.ts`: `p2p.bridgeCode`.
- `WebTorrentStreamingEngine.ts`: envía cada magnet al puente, se re-anuncia con ofertas nuevas cuando el puente confirma (`added`) y cada 15 s mientras el puente tenga el torrent y no haya peers; estado «Puente: descargando N % · peers clásicos M»; guía actualizada.
- `types.ts` (`discovery.tracker.update`), `App.tsx`, `PlaybackSettingsPage.tsx` (tarjeta Puente con código, estado e instrucciones), `e2e/types.d.ts`, `.github/workflows/ci.yml` (tests del puente).
- Documentación: README, ARCHITECTURE, STREAMING-LIMITATIONS, PRIVACY, LICENSES, TESTING, SECURITY-AUDIT, CONTRIBUTING.

### Hallazgos técnicos

- WebTorrent 2.x en Node fallaba al añadir magnets (`arr2hex(undefined)`); el puente usa WebTorrent 3.
- uTP retrasaba segundos cada conexión a peers clásicos; desactivado (TCP).
- «Glare» WebRTC: si navegador y puente emiten ofertas a la vez, cada lado acaba con dos peers del mismo id, descarta uno y la pareja superviviente nunca coincide. Solución: el puente nunca ofrece (`WebSocketTracker.prototype._generateOffers` → `[]`) y el navegador vuelve a anunciarse cuando el puente confirma el torrent.
- `node-datachannel` en este entorno solo expone un candidato host de prueba (`192.0.2.2`); aun así la conexión se establece por los candidatos del navegador.

### Pruebas ejecutadas

- `cd bridge && npm test`: 3 tests.
- `npm run test`: 131 tests (incluye `BridgeClient`).
- `npm run test:e2e -- e2e/bridge.spec.ts`: el navegador pega un magnet de enjambre clásico (solo tracker HTTP), el puente lo descarga por TCP (`peer tcpOutgoing`) y lo sirve por WebRTC (`peer webrtc`), y el vídeo reproduce.

### Limitaciones

- El puente no transcodifica: AV1/HEVC/Atmos/MKV que el navegador no decodifique seguirán sin reproducirse.
- Requiere Node.js ≥ 20 en una máquina del usuario y, entre redes distintas, conectividad WebRTC (STUN).
- Instalación del puente: `cd bridge && npm install` (en este entorno, `--legacy-peer-deps` no fue necesario).

---

## 2026-10-04 — Ventana real de descarga y reinicio por memoria sin cortar la reproducción

### Síntoma

Con el magnet de Big Buck Bunny (276 MB, web seed HTTPS de webtorrent.io) el reproductor mostraba «No se pudo iniciar la reproducción automáticamente» y «Reinicios por memoria en esta sesión: 1» sin llegar a reproducir.

### Causas

1. `start()` seleccionaba el archivo completo (`file.select`) y confiaba en `client.throttleDownload` para frenar la descarga cuando el búfer futuro estaba lleno. Ese límite solo se aplica a las conexiones de peers (tuberías de `Peer.setThrottlePipes`); los **web seeds HTTP no pasan por él**, así que el archivo entero se descargaba a toda velocidad, superaba el límite de memoria (256 MB) y forzaba el reinicio.
2. Aunque no hubiera selección explícita, el `<video>` pide rangos abiertos (`bytes=N-`) y el `BrowserServer` crea una selección de stream hasta el final del archivo: WebTorrent habría descargado igualmente todo.
3. El reinicio destruía el torrent, esperaba a vaciar el store y volvía a ejecutar `start()` (nueva negociación de metadatos, `video.src` reasignado y `play()` sin gesto reciente): el `play()` original quedaba abortado y el nuevo fallaba → aviso de autoplay y vídeo parado.

### Cambios

- `windowPolicy.ts`: desaparece el throttling (`THROTTLED_RATE_BPS`, `throttle`, `bufferedAheadSeconds`); `computeWindow` devuelve `rangeBytes` (`streamRangeBytes`: ventana futura en bytes, 1–64 MiB, en piezas enteras).
- `WebTorrentStreamingEngine.ts`: al empezar se deselecciona todo el torrent y se selecciona solo `[head, keepEnd]` del archivo elegido; la selección se desplaza en cada tick y en cada seek (`applyWindow`). El tamaño de rango se envía al Service Worker (`ovtorrent-stream-config`). El límite de memoria se mide con los bytes almacenados por la instancia actual. El reinicio sustituye el torrent en el sitio: destruye el antiguo (sale del cliente de forma síncrona), añade el nuevo con el `.torrent` cacheado (`torrent.torrentFile`), re-centra la ventana en la posición actual y deja el `<video>` intacto; solo lo recarga si ya había fallado o falla en los 15 s siguientes. Los `AbortError` de `play()` (intento superado por una recarga o una pausa) ya no generan aviso.
- `public/webtorrent-sw.js`: acota los rangos abiertos u oversized a `maxRangeBytes` (16 MiB por defecto, configurable por mensaje) antes de pedirlos a la página; la respuesta `206` conserva el tamaño total.
- `EphemeralBufferStore`: nuevo `clearSession(sessionId)` (memoria, IndexedDB, sin persistencia, fake) para liberar las piezas de la instancia anterior sin tocar las nuevas.
- `types.ts`: `torrentFile?`. Fake de WebTorrent: `torrentFile`, `add()` con buffer, `addCalls`.
- Tests: `windowPolicy.test.ts` (rangos), `engine.test.ts` (ventana móvil y mensaje al SW; reinicio en el sitio con store liberado, misma URL y sin aviso de autoplay), `e2e/p2p.spec.ts` (acotado de rangos + reproducción con rangos de 64 KiB; reinicio por memoria real con clip de >18 MB y límite de 16 MB).
- Documentación: `STREAMING-LIMITATIONS.md`, `ARCHITECTURE.md`, `TESTING.md`.

### Pruebas ejecutadas

- `npm run lint`, `npx prettier --check .`, `npm run typecheck`: limpios.
- `npm run test`: 132 tests.
- `npm run test:e2e`: 25 escenarios, incluidos los dos de `p2p.spec.ts` (el reinicio por memoria ocurre durante la reproducción y el vídeo sigue avanzando sin `video.error`).

### Limitaciones que siguen

- El selector «Calidad» del reproductor solo lista variantes HLS declaradas o ítems de la misma playlist con calidad distinta: un torrent tiene un único archivo de vídeo, así que no hay nada que elegir.
- Las piezas detrás del playhead siguen en memoria hasta el siguiente reinicio (WebTorrent no admite borrado pieza a pieza).
