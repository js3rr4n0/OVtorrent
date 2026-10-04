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
