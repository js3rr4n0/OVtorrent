# Limitaciones del streaming

Estas limitaciones son inherentes a una aplicación P2P que se ejecuta exclusivamente en el navegador. Se muestran también dentro de la aplicación (`/about`, `/diagnostics` y en los avisos del reproductor).

## BitTorrent y datos

- BitTorrent **requiere transferir piezas al dispositivo** para reproducirlas. OVtorrent no «evita descargar»: mantiene un búfer temporal limitado y limpia lo que queda fuera de la ventana.
- No se puede reproducir una pieza que no esté disponible en ningún peer.
- La velocidad de reproducción depende de la velocidad efectiva de los peers; pocos peers pueden causar pausas.
- El navegador o la librería P2P pueden aplicar cachés internas que no siempre controla la aplicación.

## WebTorrent en navegador (Fase 2)

- Un navegador solo puede conectarse a peers compatibles con **WebRTC/WebTorrent**. No puede abrir sockets TCP/UDP, por lo que **no se comunica con la mayoría de los peers BitTorrent tradicionales**. Habrá menos peers que en un cliente nativo y muchos torrents no tendrán peers accesibles.
- El descubrimiento de peers depende de trackers **WebSocket** (`ws://`, `wss://`) públicos. Son una dependencia del protocolo, no un servicio de OVtorrent; se encapsulan en configuración y se documentan como tales. No se implementa tracker privado ni servidor de señalización propio.
- Cuando una plataforma no permita conectar con la fuente, la aplicación mostrará: «Esta fuente no tiene peers compatibles con el transporte web disponible en este navegador».
- Al importar magnets y `.torrent`, OVtorrent avisa si no declaran trackers WebSocket.

## Codecs, resolución y bitrate

- El soporte depende de WebRTC, MediaSource Extensions, codecs y políticas del navegador.
- No se garantiza reproducción 4K en todos los TV boxes.
- **No hay transcodificación**: un archivo único 4K no puede convertirse a 1080p o 720p. La aplicación no usa servicios cloud de transcodificación ni incluye un transcodificador local porque debe ser 100 % web.
- Los controles de resolución y bitrate solo pueden **elegir entre variantes existentes**: varias versiones (480p/720p/1080p/4K) con el mismo título en una playlist, o variantes declaradas en una playlist HLS multivariant (Fase 3) si el navegador lo permite.
- Si un formato no es compatible, se explica el motivo y no se promete conversión automática.

## Almacenamiento y limpieza

- El almacenamiento local puede ser limpiado por el navegador o el sistema operativo.
- Los navegadores aplican límites de memoria y almacenamiento.
- La eliminación exacta de cada pieza puede no estar bajo control total de la aplicación.
- Cerrar la pestaña puede impedir ejecutar una limpieza final perfecta: la limpieza mediante `pagehide`, `beforeunload` y `visibilitychange` es best effort.

## Conectividad

- La PWA necesita conexión a Internet para descubrir peers y recibir contenido P2P.
- La interfaz y la configuración funcionan offline; el streaming no.

## Fase 1 (actual)

- Los magnets y `.torrent` se importan, validan y organizan, pero **no se reproducen** hasta integrar el motor WebTorrent en la Fase 2. El reproductor lo indica explícitamente.
- Archivos locales y URLs http(s) se reproducen con el elemento `<video>` nativo.
