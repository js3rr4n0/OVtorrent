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
  |     +-- HtmlMediaEngine (Fase 1: archivos locales y URLs)
  |     +-- WebTorrentStreamingEngine (Fase 2: WebTorrent en navegador + WebRTC DataChannels)
  |
  +-- Motor de reproducción
  |     +-- HTMLVideoElement, Blob URLs (Fase 1)
  |     +-- MediaSource Extensions (Fase 2/3)
  |
  +-- Búfer temporal (src/core/buffer)
  |     +-- EphemeralBufferStore: NoPersistence (defecto) | Memory | IndexedDb
  |     +-- computeWindowPolicy: piezas prioritarias / normales / expiradas
  |
  +-- Limpieza de sesión (src/core/cleanup)
  |     +-- SessionCleanup: stop, cambio de fuente, seek lejano, límite de memoria,
  |         pagehide, beforeunload, visibilitychange
  |
  +-- Worker opcional (Fase 4: parsing de playlists, cálculos de piezas, métricas)
  |
  +-- Service Worker (vite-plugin-pwa / Workbox)
        +-- App shell y recursos estáticos
        +-- No almacena torrents ni vídeos completos (sin runtime caching)
```

## Capas

### `src/core` — lógica pura

Sin React. Todo es testeable con Vitest sin DOM salvo donde se indica.

| Módulo       | Responsabilidad                                                                                                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `schemas/`   | Esquemas Zod versionados: `MediaItem`, `Playlist` (v1), `Settings`, `HistoryEntry`, bundle de exportación. Son la única definición de datos aceptados.                                                             |
| `storage/`   | `StorageAdapter` (localStorage o memoria como fallback), `readJson`/`writeJson` con validación, wrapper mínimo de IndexedDB.                                                                                       |
| `buffer/`    | Contrato `EphemeralBufferStore` y sus tres implementaciones; política de ventanas.                                                                                                                                 |
| `streaming/` | Contratos `StreamingEngine`, `StreamingSession`, `StreamingMetrics`; detección de capacidades; `HtmlMediaEngine`; `resolveEngine()` que decide qué motor sirve cada tipo de fuente y explica por qué no hay motor. |
| `import/`    | Parsers seguros: magnet (btih hex/base32), `.torrent` (bencode propio, hash SHA-1 con WebCrypto), playlist JSON.                                                                                                   |
| `security/`  | Sanitización de texto y validación de esquemas URL.                                                                                                                                                                |
| `media/`     | Detección de codecs con `canPlayType`.                                                                                                                                                                             |
| `tv/`        | Detección de plataformas TV por user agent y navegación espacial con teclas de flecha.                                                                                                                             |
| `cleanup/`   | Registro central de tareas de limpieza y enlace con el ciclo de vida de la página.                                                                                                                                 |

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
2. Si no hay motor disponible (magnet en Fase 1, WebRTC ausente…), se muestra la interfaz de capacidad con las causas. No se simula nada.
3. Con motor, `usePlaybackSession` crea el `EphemeralBufferStore` configurado, registra una tarea en `SessionCleanup`, crea la sesión y la arranca sobre el `<video>`.
4. Las métricas se muestrean una vez por segundo (throttling) y el uso del búfer cada dos.
5. Un seek más allá de la ventana futura ejecuta `removeOutsideWindow` y una limpieza `far-seek`.
6. Stop, cambio de elemento, desmontaje, `pagehide`, `beforeunload` y `visibilitychange→hidden` destruyen la sesión, revocan las object URLs y vacían el búfer. La limpieza es best effort: si el navegador mata el proceso no hay garantías.

## Decisiones

- **Vite + React + TypeScript** en lugar de Next.js: exportación estática trivial, sin riesgo de introducir rutas de servidor.
- **Hash routing** en lugar de history routing: evita 404 en recargas en hosting puramente estático.
- **Zod en los límites**: importación, almacenamiento y configuración pasan siempre por esquemas `strict()`.
- **IndexedDB solo como búfer efímero**: nunca para el archivo completo ni como "base de datos".
- **Sin Dexie**: un wrapper de 60 líneas cubre el uso actual y evita una dependencia.
- **CSP inyectada solo en build**: el servidor de desarrollo necesita scripts inline para React Fast Refresh.
