# Compatibilidad con TV y TV boxes

OVtorrent incluye un **modo TV completamente web**. No existe aplicación nativa ni dependencia de ninguna tienda.

## Activación

- **Automática**: detección por user agent (`src/core/tv/detect.ts`): Android TV, Google TV, Fire TV, Tizen, webOS, Bravia, Roku, Chromecast, consolas y patrones genéricos «TV», más la heurística `pointer: none` + `hover: none`.
- **Manual**: Ajustes → Modo TV → «Siempre activado». La detección por user agent es una heurística y puede fallar en ambos sentidos.

## Qué cambia en modo TV

- Navegación con D-pad / flechas, Enter, Escape/Back/Backspace.
- Foco visible reforzado, objetivos ≥ 48 px, texto grande, alto contraste opcional, sin hover.
- Panel de reproducción simplificado (controles esenciales, el resto tras «Más»), foco automático en reproducir y opción de ocultar los diagnósticos.
- Menú lateral accesible con el mando (en pantallas pequeñas, barra superior desplazable).

## Lo que **no** podemos afirmar

No todos los TV boxes soportan WebRTC, MediaSource Extensions, PWA instalable o todos los codecs. Antes de dar por hecho que un dispositivo sirve, abre `/#/diagnostics` en el propio dispositivo y revisa:

| Capacidad                       | Impacto si falta                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------- |
| WebRTC DataChannel              | Sin streaming P2P. Solo archivos locales/URLs.                                        |
| MediaSource Extensions          | Necesario para HLS mediante hls.js cuando no hay HLS nativo; el P2P no depende de él. |
| H.264/AAC                       | La mayoría de MP4 no se reproducirá.                                                  |
| HEVC / AV1                      | Contenido 4K en esos codecs no se reproducirá; no hay transcodificación.              |
| Service Worker                  | Sin offline, sin instalación y sin streaming P2P.                                     |
| Memoria (`deviceMemory` ≤ 2 GB) | Usar preset «Ahorro de datos» y almacén «Sin persistencia».                           |

## Recomendaciones por plataforma (orientativas)

- **Android TV / Google TV / Fire TV**: navegadores basados en Chromium suelen exponer WebRTC y MSE. Instala la PWA desde el navegador si éste lo permite. Los mandos envían teclas estándar.
- **Tizen / webOS**: el navegador integrado varía mucho entre generaciones; HEVC y AV1 dependen del hardware. Prueba primero con un MP4 H.264 local.
- **Apple TV**: no tiene navegador; no aplicable.
- **Chromecast con Google TV**: similar a Android TV.

## Rendimiento en dispositivos modestos

- Code splitting por ruta y carga diferida de pantallas.
- Métricas a 1 Hz y uso de búfer cada 2 s.
- Límites configurables de memoria, peers y solicitudes concurrentes.
- Sin librerías grandes innecesarias; sin almacenar el vídeo completo.

## Teclas reconocidas

`ArrowUp/Down/Left/Right`, `Enter`, `Escape`, `Backspace`, `GoBack`, `BrowserBack`, `XF86Back`, `MediaPlayPause`, `MediaTrackNext`, `MediaTrackPrevious`, ` ` (espacio), `f`, `m`.
