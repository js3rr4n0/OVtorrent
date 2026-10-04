# Pruebas

## Principio

**No se depende de torrents públicos ni de red en ningún test.** Toda la lógica de streaming se prueba contra adapters falsos (`src/test/fakes`):

- `FakeStreamingEngine` / `FakeStreamingSession`: simulan capacidades, peers, errores de codec y el ciclo de vida de una sesión.
- `FakeBufferStore`: registra llamadas y aplica la política de ventanas en memoria.
- `FakeMediaAdapter`: simula un elemento multimedia (tiempo, duración, `canPlayType`).
- `FakeStorageAdapter`: adapter en memoria que puede simular fallos de escritura (cuota).
- `FakeWebTorrentClient` / `FakeTorrent`: implementan los tipos estructurales de `streaming/webtorrent/types.ts` (add, select/deselect, critical, throttle, servidor, peers con bitfield, recepción de piezas en el store inyectado, destrucción).
- `createFakeHls` / `FakeHlsInstance`: implementan el subconjunto estructural de hls.js (configuración, eventos, niveles, pistas, errores).
- `FakeWorker` (en `src/workers/__tests__`): doble en proceso del Worker, con variante rota para probar el fallback.

`fake-indexeddb` sustituye IndexedDB en jsdom para probar `IndexedDbBufferStore`.

## Unitarias e integración (Vitest + React Testing Library)

```bash
npm run test          # una pasada
npm run test:watch
```

Cobertura actual (`src/**/__tests__`):

| Área                    | Casos                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Importación de magnet   | hex, base32, v2 rechazado, HTML en `dn`, trackers WebSocket                                                                                                                                                                                                                                                                                                                    |
| Validación de torrent   | bencode multi/single file, hash SHA-1, trackers, entradas corruptas y sobredimensionadas                                                                                                                                                                                                                                                                                       |
| Importación JSON        | válido, JSON roto, errores por campo, claves prohibidas, `javascript:`, versión, límites y confirmación                                                                                                                                                                                                                                                                        |
| Seguridad               | esquemas URL, credenciales, sanitización de texto y etiquetas                                                                                                                                                                                                                                                                                                                  |
| Búfer                   | memoria (ventana, expulsión por límite), IndexedDB, sin persistencia, política de ventanas                                                                                                                                                                                                                                                                                     |
| Stores                  | ajustes (persistencia, datos corruptos, fallo de escritura), biblioteca, playlists (crear/editar/duplicar/reordenar/borrar), historial                                                                                                                                                                                                                                         |
| Exportación/importación | bundle completo, claves prohibidas, borrados parciales y total                                                                                                                                                                                                                                                                                                                 |
| Streaming               | ausencia de WebRTC/MediaSource, resolución de motor, errores de peer y codec con fakes, motor HTML5 (object URLs, stop libera recursos)                                                                                                                                                                                                                                        |
| WebTorrent              | capacidades, rechazo de fuentes no P2P, metadatos y archivo por defecto, selección del archivo elegido y piezas críticas, índice explícito y subida desactivable, aviso de falta de peers con reloj simulado, throttling al llenar la ventana y liberación tras seek, reinicio por límite de memoria, disponibilidad y métricas, timeout de metadatos, store efímero inyectado |
| Política de ventana     | archivo por defecto, rangos de piezas, ventana/críticas/expiradas/throttle, validación de trackers                                                                                                                                                                                                                                                                             |
| M3U/M3U8                | listas de medios con títulos, duraciones, magnets y rutas relativas; detección de HLS master/segmentos; tipos de fuente; rechazo de esquemas peligrosos; límites y confirmación; HLS requiere URL                                                                                                                                                                              |
| Subtítulos              | detección SRT/VTT, conversión con normalización de tiempos y limpieza de etiquetas, cues vacíos, paso directo de WebVTT                                                                                                                                                                                                                                                        |
| HLS                     | política de calidad (resolución, preset, bitrate, tope automático, nivel inicial, configuración), motor sobre hls.js (adjuntar, límites al parsear el manifest, variantes/audio/subtítulos, métricas, reintentos de red y recuperación de media, mensaje final), ausencia de MSE, ruta nativa sin cargar hls.js                                                                |
| Worker                  | trabajos de parsing y disponibilidad, cliente con worker falso, fallback al hilo principal cuando el worker falla o no existe, propagación de errores                                                                                                                                                                                                                          |
| Memoria                 | plan de búfer en dispositivos normales y con poca RAM, opt-out                                                                                                                                                                                                                                                                                                                 |
| Compatibilidad          | sondas MediaCapabilities sin API, con respuestas simuladas y con errores; autoprueba WebRTC sin API y con `RTCPeerConnection` falso                                                                                                                                                                                                                                            |
| Fase 4 (UI)             | exportación selectiva y vista previa, recorrido de carpetas con límites, lista virtualizada                                                                                                                                                                                                                                                                                    |
| Auditoría de seguridad  | patrones prohibidos, CSP, `index.html`, licencias de producción, Service Worker de streaming                                                                                                                                                                                                                                                                                   |
| Limpieza                | razones, ciclo de vida (`pagehide`, `beforeunload`, `hidden`), aislamiento de fallos                                                                                                                                                                                                                                                                                           |
| TV                      | detección por user agent, navegación espacial, teclas de retroceso                                                                                                                                                                                                                                                                                                             |
| Pantallas               | biblioteca, importación de magnet y JSON, playlists, ajustes de calidad/búfer, almacenamiento (restablecimiento), reproductor (magnet sin motor, archivo sin seleccionar, URL con controles), diagnóstico, navegación por teclado/D-pad                                                                                                                                        |

## End-to-end (Playwright)

```bash
npm run build
npm run test:e2e
```

`playwright.config.ts` levanta `npm run preview` y ejecuta en Chromium:

- `e2e/app.spec.ts`: carga con hash routing y sin peticiones a terceros, recarga en rutas profundas, importación y persistencia de magnet con arranque del motor WebTorrent, creación y exportación de playlist, navegación D-pad en modo TV, borrado total de datos, funcionamiento offline de la interfaz, pantalla de diagnóstico, importación M3U como biblioteca y playlist, subtítulos SRT locales convertidos a WebVTT en el reproductor y panel simplificado en modo TV.
- `e2e/a11y.spec.ts`: auditoría axe-core (WCAG 2.0/2.1 A/AA y buenas prácticas) en todas las rutas, en modo TV y en el reproductor; las violaciones graves o críticas hacen fallar la suite.
- `e2e/bridge.spec.ts`: **pegar un magnet y reproducir** con enjambre clásico: tracker local HTTP+WebSocket, sembrador Node solo TCP, puente Node con WebRTC emparejado por código; el navegador configura el código, pega el magnet (solo tracker HTTP), el puente lo descarga por TCP y lo sirve por WebRTC, y el vídeo reproduce. Se comprueban ambos transportes en los logs del puente.
- `e2e/p2p.spec.ts`: **streaming P2P real** sin red ni torrents públicos. El test arranca un tracker WebSocket local (`bittorrent-tracker/server`), un segundo contexto de navegador graba un clip VP8 con `MediaRecorder` y lo siembra con el bundle de WebTorrent, y la aplicación importa el magnet (solo con el tracker local), conecta por WebRTC, recibe el stream a través del Service Worker (respuesta 206 con rangos), reproduce más de un segundo, muestra 1 peer y libera el `<video>` al detener. Además comprueba que el Service Worker acota los rangos abiertos (`bytes=0-` → `206` con `Content-Range: bytes 0-65535/total` tras configurar 64 KiB) y que la reproducción avanza a través de muchos rangos pequeños. Un segundo escenario graba un clip de ruido de más de 18 MB, fija el límite de memoria en 16 MB y verifica que el torrent se sustituye en el sitio («Reinicios por memoria en esta sesión: 1») y el vídeo sigue avanzando sin errores de red ni de reproducción.

Si Playwright no encuentra su Chromium, define `PLAYWRIGHT_CHROMIUM_PATH` con la ruta a un ejecutable de Chromium.

## Calidad estática

```bash
npm run lint       # ESLint (incluye no-eval / no-new-func)
npm run typecheck  # TypeScript strict
npm run format:check
```

## Pendiente por fase
