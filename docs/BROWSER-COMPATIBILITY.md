# Compatibilidad con navegadores

La aplicación se compila para `es2020` y se ha probado en Chromium (Playwright). Todas las capacidades se **detectan** en tiempo de ejecución (`src/core/streaming/capabilities.ts`); nunca se asume soporte.

## APIs requeridas y su uso

| API                                                  | Uso                                                                | Si falta                                                                                 |
| ---------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| ES2020, módulos ES                                   | Toda la app                                                        | No arranca (navegadores muy antiguos).                                                   |
| `localStorage`                                       | Preferencias, biblioteca, playlists, historial                     | Funciona solo en memoria; se avisa.                                                      |
| `IndexedDB`                                          | Búfer efímero opcional                                             | Se usa memoria.                                                                          |
| `crypto.randomUUID` / `crypto.subtle`                | IDs y hash de `.torrent`                                           | Fallback a generador propio de UUID; el hash SHA-1 requiere WebCrypto (contexto seguro). |
| `HTMLVideoElement`, Blob URLs                        | Reproducción Fase 1                                                | Sin reproducción.                                                                        |
| Service Worker + Cache Storage                       | PWA / offline de la interfaz y entrega del stream P2P al `<video>` | Sin offline, sin instalación y sin P2P; se informa.                                      |
| `RTCPeerConnection` + DataChannel                    | WebTorrent                                                         | Sin P2P; se informa.                                                                     |
| `MediaSource` / `ManagedMediaSource`                 | HLS mediante hls.js cuando no hay soporte nativo                   | Sin HLS salvo soporte nativo. No afecta al P2P.                                          |
| `video.canPlayType('application/vnd.apple.mpegurl')` | HLS nativo (Safari, algunos TV)                                    | Se usa hls.js si hay MSE.                                                                |
| `AudioTrackList`                                     | Pistas de audio alternativas en archivos/URLs                      | Solo las pistas que gestione hls.js en HLS.                                              |
| `document.pictureInPictureEnabled`                   | Botón PiP                                                          | Botón oculto.                                                                            |
| `document.fullscreenEnabled`                         | Pantalla completa                                                  | Botón deshabilitado.                                                                     |
| `navigator.storage.estimate`                         | Diagnóstico                                                        | «n/d».                                                                                   |
| `navigator.connection`, `deviceMemory`               | Diagnóstico                                                        | «no expuesta».                                                                           |
| `showOpenFilePicker` (File System Access)            | Carpetas locales (pendiente)                                       | Solo `<input type="file">`.                                                              |

## Navegadores

| Navegador                     | Estado esperado                                                                                                                                                                                                                    |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chrome / Edge / Chromium ≥ 90 | Completo.                                                                                                                                                                                                                          |
| Firefox ≥ 90                  | Completo salvo File System Access API y `deviceMemory`.                                                                                                                                                                            |
| Safari ≥ 15.4 (macOS/iOS)     | Interfaz completa; PWA instalable desde «Compartir». HLS nativo (la variante la decide el navegador). MSE en iOS solo a partir de iOS 17 (`ManagedMediaSource`, que hls.js usa con `preferManagedMediaSource`). WebRTC disponible. |
| Samsung Internet              | Similar a Chromium.                                                                                                                                                                                                                |
| Navegadores de TV             | Ver `TV-COMPATIBILITY.md`; verificar con `/#/diagnostics`.                                                                                                                                                                         |

## Codecs

Detección mediante `canPlayType` para MP4 H.264/AAC, WebM VP8/VP9/Opus, HEVC, AV1, HLS nativo, MKV, AAC, MP3, Opus y WebVTT. «maybe» significa que el navegador no garantiza el soporte. MKV solo funciona si el navegador acepta el contenedor y los codecs internos son reproducibles; no se promete conversión automática.

## Políticas del navegador que afectan

- **Autoplay**: puede bloquear `video.play()` sin interacción; el reproductor lo detecta y pide pulsar play.
- **Contexto seguro**: Service Worker, WebRTC, PiP y WebCrypto requieren HTTPS o `localhost`.
- **Safari**: el `BrowserServer` de WebTorrent depende de `ReadableStream` en respuestas del Service Worker; en versiones antiguas de Safari el stream P2P puede no funcionar. Se detecta en tiempo de ejecución y se informa.
- **Limpieza de almacenamiento**: Safari y navegadores con «protección contra rastreo» pueden borrar `localStorage`/IndexedDB tras días sin uso.
- **Límites de memoria**: pestañas en TV boxes pueden ser terminadas con búferes grandes; usa presets conservadores.
