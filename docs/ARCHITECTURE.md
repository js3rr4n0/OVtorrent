# Arquitectura

OVtorrent es una aplicación **completamente client-side**. No existe API propia, servidor de base de datos, autenticación ni lógica que requiera Node.js en producción. El servidor de desarrollo (Vite) solo compila y sirve archivos; la versión final es un conjunto de archivos estáticos en `dist/`.

```text
Navegador
  |
  +-- React UI (src/features, src/components, src/app)
  |
  +-- Estado de aplicación (src/state)
  |     +-- Zustand: settings, library, playlists, history, session (memoria)
  |
  +-- Almacenamiento local (src/core/storage)
  |     +-- localStorage  → StorageAdapter (preferencias, biblioteca, playlists, historial)
  |     +-- IndexedDB     → búfer efímero opcional (nunca el archivo completo)
  |     +-- Cache Storage → app shell de la PWA (Service Worker)
  |
  +-- Motor P2P (src/core/streaming)
  |     +-- StreamingEngine / StreamingSession (abstracción)
  |     +-- HtmlMediaEngine (archivos locales y URLs)
  |     +-- WebTorrentStreamingEngine (WebTorrent en navegador: WebRTC DataChannels
  |         + trackers WebSocket; estrategia secuencial, piezas críticas, ventana con
  |         throttling, reinicio por límite de memoria)
  |
  +-- Motor de reproducción
  |     +-- HTMLVideoElement, Blob URLs (archivos locales, URLs)
  |     +-- Stream HTTP con rangos servido por el Service Worker (P2P): el <video>
  |         pide /webtorrent/<infoHash>/<archivo> y el worker lo responde con las
  |         piezas que el cliente WebTorrent de la pestaña le entrega por MessageChannel
  |     +-- HLS: nativo (<video src=.m3u8>) o hls.js sobre MediaSource Extensions
  |         (variantes, pistas de audio y subtítulos declaradas por la playlist)
  |
  +-- Búfer temporal (src/core/buffer)
  |     +-- EphemeralBufferStore: NoPersistence (defecto) | Memory | IndexedDb
  |     +-- computeWindowPolicy: piezas prioritarias / normales / expiradas
  |
  +-- Limpieza de sesión (src/core/cleanup)
  |     +-- SessionCleanup: stop, cambio de fuente, seek lejano, límite de memoria,
  |         pagehide, beforeunload, visibilitychange
  |
  +-- Worker (src/workers): parsing de M3U/JSON/.torrent y disponibilidad de piezas,
  |     con fallback automático al hilo principal
  |
  +-- Service Worker (vite-plugin-pwa / Workbox + public/webtorrent-sw.js)
        +-- App shell y recursos estáticos
        +-- Handler de streaming WebTorrent (importScripts); no cachea nada
        +-- No almacena torrents ni vídeos completos (sin runtime caching)
```

## Capas

### `src/core` — lógica pura

Sin React. Todo es testeable con Vitest sin DOM salvo donde se indica.

| Módulo                  | Responsabilidad                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `schemas/`              | Esquemas Zod versionados: `MediaItem`, `Playlist` (v1), `Settings`, `HistoryEntry`, bundle de exportación. Son la única definición de datos aceptados.                                                                                                                                                                                                                                                                                                                                                                         |
| `storage/`              | `StorageAdapter` (localStorage o memoria como fallback), `readJson`/`writeJson` con validación, wrapper mínimo de IndexedDB.                                                                                                                                                                                                                                                                                                                                                                                                   |
| `buffer/`               | Contrato `EphemeralBufferStore` y sus tres implementaciones; política de ventanas.                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `streaming/`            | Contratos `StreamingEngine`, `StreamingSession`, `StreamingMetrics`; detección de capacidades; `HtmlMediaEngine`; `resolveEngine()` que decide qué motor sirve cada tipo de fuente y explica por qué no hay motor.                                                                                                                                                                                                                                                                                                             |
| `streaming/webtorrent/` | `WebTorrentStreamingEngine` (sesión P2P), `windowPolicy` (cálculo puro de ventana, piezas críticas, throttling, piezas expiradas, archivo por defecto), `EphemeralChunkStore` (adaptador abstract-chunk-store → `EphemeralBufferStore`), `trackers` (lista pública por defecto y validación), `loadWebTorrent` (carga diferida del bundle, cliente compartido, registro del Service Worker de streaming), `types` (tipos estructurales del subconjunto de API usado, implementados también por el cliente falso de los tests). |
| `streaming/hls/`        | `HlsStreamingEngine` (HLS nativo o hls.js), `qualityPolicy` (niveles permitidos por resolución/bitrate/preset, tope automático, nivel inicial, configuración de hls.js a partir de la ventana de búfer), `loadHls` (carga diferida), `types` (subconjunto estructural de hls.js).                                                                                                                                                                                                                                              |
| `subtitles/`            | Detección SRT/VTT, conversión SRT → WebVTT en el navegador (solo `<i>`, `<b>`, `<u>`, `<v>`), object URLs.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `import/`               | Parsers seguros: magnet (btih hex/base32), `.torrent` (bencode propio, hash SHA-1 con WebCrypto), playlist JSON.                                                                                                                                                                                                                                                                                                                                                                                                               |
| `security/`             | Sanitización de texto y validación de esquemas URL.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `media/`                | Detección de codecs con `canPlayType`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `tv/`                   | Detección de plataformas TV por user agent y navegación espacial con teclas de flecha.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `cleanup/`              | Registro central de tareas de limpieza y enlace con el ciclo de vida de la página.                                                                                                                                                                                                                                                                                                                                                                                                                                             |

### `src/workers` — parsing y métricas fuera del hilo principal

`parse.worker.ts` ejecuta `runJob` para `parse-m3u`, `parse-json-playlist`, `parse-torrent` (bencode + SHA-1) y `availability` (bitfields de peers). `ParseWorkerClient` crea el worker bajo demanda, aplica un tiempo máximo por trabajo y, si el navegador no soporta Workers de módulo o el worker falla, ejecuta el mismo `runJob` en el hilo principal: la funcionalidad es idéntica, solo cambia dónde se calcula. El modo activo se muestra en Diagnóstico.

### `src/state` — stores Zustand

Cada store carga su estado validado desde `StorageAdapter` al iniciar, valida de nuevo en cada mutación y persiste. Si la escritura falla (cuota, modo privado, políticas), el store sigue funcionando en memoria y expone `persisted: false` para que la interfaz lo avise. Datos corruptos o incompatibles se descartan y se usan los valores por defecto: la aplicación funciona aunque el usuario borre todos los datos del navegador.

`sessionStore` es solo memoria: guarda los objetos `File` seleccionados por el usuario en esta pestaña (no se pueden persistir) y la cola de reproducción.

### `src/features` — pantallas

Hash routing (`/#/ruta`) para que cualquier hosting estático sirva recargas y enlaces profundos sin configuración. Las pantallas se cargan con `React.lazy` (code splitting por ruta).

| Ruta                                                                   | Pantalla                             |
| ---------------------------------------------------------------------- | ------------------------------------ |
| `/`                                                                    | Biblioteca local                     |
| `/import`                                                              | Importación de fuentes y listas      |
| `/playlists`, `/playlists/:id`                                         | Playlists y detalle                  |
| `/player/:id?playlist=…`                                               | Reproductor                          |
| `/history`                                                             | Historial local                      |
| `/settings`, `/settings/playback`, `/settings/storage`, `/settings/tv` | Ajustes                              |
| `/diagnostics`                                                         | Diagnóstico de capacidades           |
| `/about`                                                               | Limitaciones, licencias y privacidad |

## Contratos principales

```ts
interface EphemeralBufferStore {
  write(chunk: BufferChunk): Promise<void>;
  read(range: MediaRange): Promise<BufferChunk | null>;
  removeBefore(timestamp: number): Promise<void>;
  removeOutsideWindow(window: BufferWindow): Promise<void>;
  clear(): Promise<void>;
  getUsage(): Promise<StorageUsage>;
}

interface StreamingEngine {
  capabilities(): Promise<StreamingCapabilities>;
  createSession(source: StreamingSource): Promise<StreamingSession>;
}

interface StreamingSession {
  metadata(): Promise<MediaMetadata>;
  start(options: StartPlaybackOptions): Promise<void>;
  pause(): Promise<void>;
  seek(positionSeconds: number): Promise<void>;
  stop(): Promise<void>;
  destroy(): Promise<void>;
  metrics(): StreamingMetrics;
  clearTemporaryData(): Promise<void>;
}
```

El modo predeterminado del búfer es `NoPersistenceBufferStore`: la aplicación no guarda una segunda copia de las piezas; la librería de streaming y el navegador siguen necesitando tenerlas en memoria para reproducirlas.

## Ciclo de una reproducción

1. `PlayerPage` resuelve el elemento (biblioteca o cola de playlist) y llama a `resolveEngine(sourceType)`.
2. Si no hay motor disponible (WebRTC, Service Worker o contexto seguro ausentes…), se muestra la interfaz de capacidad con las causas. No se simula nada.
3. Con motor, `usePlaybackSession` crea el `EphemeralBufferStore` configurado, registra una tarea en `SessionCleanup`, crea la sesión y la arranca sobre el `<video>`.
4. Las métricas se muestrean una vez por segundo (throttling) y el uso del búfer cada dos.
5. Un seek más allá de la ventana futura ejecuta `removeOutsideWindow` y una limpieza `far-seek`.
6. Stop, cambio de elemento, desmontaje, `pagehide`, `beforeunload` y `visibilitychange→hidden` destruyen la sesión, revocan las object URLs y vacían el búfer. La limpieza es best effort: si el navegador mata el proceso no hay garantías.

## Sesión WebTorrent paso a paso

1. `createSession` comprueba capacidades (WebRTC DataChannel, Service Worker, contexto seguro).
2. `metadata()` carga el bundle de WebTorrent (chunk diferido de ~220 KB), crea el cliente compartido de la pestaña (sin DHT, LSD, uTP ni UPnP: no existen en navegador) y añade el torrent con los trackers WebSocket configurados, `strategy: 'sequential'` y el store de piezas efímero. Resuelve cuando llegan los metadatos (lista de archivos). Si no llegan en 90 s, falla con «sin peers accesibles».
3. `start()` asegura el Service Worker de streaming (`navigator.serviceWorker.ready` en producción; en desarrollo registra `webtorrent-sw.js` por su cuenta), crea el `BrowserServer` de WebTorrent, selecciona solo el archivo elegido (`file.select`, el resto `deselect`), marca críticas las primeras piezas y asigna `video.src = file.streamURL`.
4. Cada segundo: `computeWindow` traduce la posición del vídeo a piezas (duración real o bitrate asumido), marca críticas las piezas del búfer inicial a partir del playhead, y si el navegador ya tiene más de `aheadSeconds` almacenados, limita la descarga a 64 KB/s (`client.throttleDownload`) hasta que el búfer baje. Un seek fuerza la re-priorización: el navegador cancela la petición de rango anterior y WebTorrent descarta esa selección.
5. Si `torrent.downloaded` supera el límite de memoria y la opción está activa, la sesión destruye el torrent (liberando todas las piezas) y lo vuelve a añadir desde la posición actual. Es la única forma honesta de liberar memoria: WebTorrent asume que toda pieza verificada sigue disponible, por lo que no se eliminan piezas sueltas por debajo del motor.
6. `stop()`/`destroy()`: se vacía el `<video>`, se destruye el torrent con su store, se vacía el `EphemeralBufferStore`, se restablece el throttling y se desregistran los listeners. `SessionCleanup` ejecuta lo mismo en `pagehide`, `beforeunload` y `visibilitychange`.

Métricas: peers (`torrent.numPeers`), velocidad de descarga y subida, disponibilidad (muestreo de hasta 500 piezas del archivo frente a los bitfields de los peers, cacheado 5 s), segundos almacenados por el navegador, bytes en el store, bitrate aproximado (tamaño del archivo / duración), resolución del `<video>`, avisos (sin peers tras el tiempo configurado, errores del protocolo, autoplay bloqueado, reinicios por memoria).

## Pistas y variantes

`StreamingSession` expone de forma opcional `variants()/selectVariant()`, `audioTracks()/selectAudioTrack()` y `subtitleTracks()/selectSubtitleTrack()`. Cada motor rellena solo lo que existe de verdad:

| Motor                  | Variantes                                                                                                            | Audio                                      | Subtítulos                                                                             |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------- |
| HTML5 (archivos, URLs) | ninguna (fallback: elementos de la playlist con el mismo título y `qualityLabel`)                                    | `AudioTrackList` si el navegador lo expone | archivo local .srt/.vtt                                                                |
| WebTorrent             | ninguna (mismo fallback)                                                                                             | —                                          | archivos .srt/.vtt dentro del torrent (≤ 2 MB, convertidos localmente) + archivo local |
| HLS con hls.js         | niveles declarados por la playlist + «Auto», limitados por los ajustes de calidad (`autoLevelCapping`, `startLevel`) | pistas alternativas declaradas             | pistas declaradas (renderizadas por hls.js) + archivo local                            |
| HLS nativo             | las decide el navegador                                                                                              | `AudioTrackList` si existe                 | archivo local                                                                          |

`TrackSelectors` (reproductor) consume esa API y pide al usuario un archivo local cuando no hay nada declarado. Las conversiones y object URLs se liberan al cambiar de pista o de elemento.

## Decisiones

- **Vite + React + TypeScript** en lugar de Next.js: exportación estática trivial, sin riesgo de introducir rutas de servidor.
- **Hash routing** en lugar de history routing: evita 404 en recargas en hosting puramente estático.
- **Zod en los límites**: importación, almacenamiento y configuración pasan siempre por esquemas `strict()`.
- **IndexedDB solo como búfer efímero**: nunca para el archivo completo ni como "base de datos".
- **Sin Dexie**: un wrapper de 60 líneas cubre el uso actual y evita una dependencia.
- **Service Worker único**: las peticiones de una página siempre van al worker que la controla, así que el handler de streaming se importa dentro del worker de Workbox (`importScripts`) en lugar de registrarse en otro scope. Se reimplementa en `public/webtorrent-sw.js` (protocolo idéntico al `sw.min.js` de WebTorrent) para no llamar a `skipWaiting()` y conservar el aviso de actualización.
- **Nunca OPFS**: el store por defecto de WebTorrent en Chromium es el Origin Private File System (disco). OVtorrent siempre inyecta su propio store efímero (RAM o IndexedDB local) para no escribir vídeos en disco.
- **Ventana por throttling, no por borrado de piezas**: ver «Sesión WebTorrent paso a paso».
- **HLS nativo primero**: si el `<video>` entiende `.m3u8` (Safari, algunos TV boxes) no se carga hls.js (≈ 190 KB gzip). hls.js se importa bajo demanda solo cuando hace falta MediaSource; la ventana de búfer se traduce a `maxBufferLength`/`backBufferLength`.
- **Memoria**: las listas largas se virtualizan (`VirtualList`, sin dependencias), el sondeo de métricas se pausa con la pestaña oculta, y en dispositivos con poca RAM se reduce la ventana y el límite automáticamente (opt-out).
- **Panel TV simplificado**: en modo TV el reproductor muestra solo los controles esenciales y el resto tras «Más»; el foco va al botón de reproducir (configurable).
- **CSP inyectada solo en build**: el servidor de desarrollo necesita scripts inline para React Fast Refresh.
