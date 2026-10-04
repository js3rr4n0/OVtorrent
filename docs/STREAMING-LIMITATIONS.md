# Limitaciones del streaming

Estas limitaciones son inherentes a una aplicación P2P que se ejecuta exclusivamente en el navegador. Se muestran también dentro de la aplicación (`/about`, `/diagnostics` y en los avisos del reproductor).

## BitTorrent y datos

- BitTorrent **requiere transferir piezas al dispositivo** para reproducirlas. OVtorrent no «evita descargar»: mantiene un búfer temporal limitado y limpia lo que queda fuera de la ventana.
- No se puede reproducir una pieza que no esté disponible en ningún peer.
- La velocidad de reproducción depende de la velocidad efectiva de los peers; pocos peers pueden causar pausas.
- El navegador o la librería P2P pueden aplicar cachés internas que no siempre controla la aplicación.

## WebTorrent en navegador

- Un navegador solo puede conectarse a peers compatibles con **WebRTC/WebTorrent**. No puede abrir sockets TCP/UDP, por lo que **no se comunica con la mayoría de los peers BitTorrent tradicionales**. Habrá menos peers que en un cliente nativo y muchos torrents no tendrán peers accesibles.
- El descubrimiento de peers depende de trackers **WebSocket** (`ws://`, `wss://`) públicos. Son una dependencia del protocolo, no un servicio de OVtorrent; se encapsulan en configuración y se documentan como tales. No se implementa tracker privado ni servidor de señalización propio.
- Cuando una plataforma no permita conectar con la fuente, la aplicación mostrará: «Esta fuente no tiene peers compatibles con el transporte web disponible en este navegador».
- Al importar magnets y `.torrent`, OVtorrent avisa si no declaran trackers WebSocket.

## Codecs, resolución y bitrate

- El soporte depende de WebRTC, MediaSource Extensions, codecs y políticas del navegador.
- No se garantiza reproducción 4K en todos los TV boxes.
- **No hay transcodificación**: un archivo único 4K no puede convertirse a 1080p o 720p. La aplicación no usa servicios cloud de transcodificación ni incluye un transcodificador local porque debe ser 100 % web.
- Los controles de resolución y bitrate solo pueden **elegir entre variantes existentes**: varias versiones (480p/720p/1080p/4K) con el mismo título en una playlist, o variantes declaradas en una playlist HLS multivariant. Con HLS nativo (Safari) la variante la decide el navegador y los ajustes de calidad solo informan.
- Si un formato no es compatible, se explica el motivo y no se promete conversión automática.

## Almacenamiento y limpieza

- El almacenamiento local puede ser limpiado por el navegador o el sistema operativo.
- Los navegadores aplican límites de memoria y almacenamiento.
- La eliminación exacta de cada pieza puede no estar bajo control total de la aplicación.
- Cerrar la pestaña puede impedir ejecutar una limpieza final perfecta: la limpieza mediante `pagehide`, `beforeunload` y `visibilitychange` es best effort.

## Conectividad

- La PWA necesita conexión a Internet para descubrir peers y recibir contenido P2P.
- La interfaz y la configuración funcionan offline; el streaming no.

## Por qué un magnet «popular» puede no reproducirse

La mayoría de los magnets que circulan solo declaran trackers `udp://` o `http://` y sus peers son clientes BitTorrent clásicos (TCP/uTP). Desde un navegador:

- los trackers UDP/HTTP se ignoran (no existe forma de hablarles desde la web); la aplicación lo indica una sola vez en el estado de conexión en lugar de un aviso por tracker;
- se anuncian los trackers WebSocket configurados (por defecto `tracker.openwebtorrent.com`, `tracker.webtorrent.dev`, `tracker.files.fm` y `tracker.novage.com.ua`), que solo conocen peers **WebRTC**;
- si ningún peer WebRTC tiene el torrent, no llegan ni los metadatos: el reproductor muestra «Esta fuente no tiene peers compatibles con el transporte web disponible en este navegador» y el estado de trackers.

Qué puede hacer el usuario (sin que la aplicación añada servidores ni proxies): ejecutar el **puente autoalojado** incluido en `bridge/` (ver `BRIDGE.md`) en un PC o NAS propio y emparejarlo con un código; a partir de ahí basta con pegar el magnet y reproducir. Alternativa manual: abrir el mismo magnet en un cliente híbrido como WebTorrent Desktop en otro dispositivo. Esos clientes se conectan tanto a peers clásicos como a peers WebRTC y actúan de puente para el navegador. OVtorrent no incluye ni recomienda proxies, relays ni servicios de pago para ocultar esta limitación.

## Cómo funciona la ventana temporal con WebTorrent

- El archivo elegido se descarga con estrategia **secuencial** y las piezas del búfer inicial a partir del playhead se marcan críticas en cada tick y en cada seek.
- Cuando el navegador ya tiene más segundos almacenados que la ventana futura, la descarga se **limita a 64 KB/s** hasta que el búfer baje: la aplicación no pide al enjambre datos muy por delante de la reproducción. No es una cancelación pieza a pieza: WebTorrent sigue atendiendo las peticiones de rango del elemento `<video>`.
- Las piezas ya descargadas **no se eliminan individualmente**: WebTorrent asume que toda pieza verificada sigue disponible. Cuando lo descargado supera el límite de memoria configurado, la sesión se reinicia desde la posición actual (opción activada por defecto) y libera todas las piezas. Es un corte breve con reconexión a peers.
- Un seek lejano hace que el navegador cancele la petición de rango anterior; WebTorrent descarta esa selección y las nuevas piezas pasan a ser críticas.
- Los contenedores que el navegador no puede reproducir progresivamente (MKV con codecs no soportados, MP4 con el índice `moov` al final…) pueden no reproducirse aunque haya peers. No hay transcodificación ni remuxado.
- El bitrate mostrado es una aproximación (tamaño del archivo ÷ duración).

## HLS

- Requiere soporte nativo (`<video>` con `.m3u8`) o MediaSource Extensions para hls.js. Sin ninguno de los dos, se informa.
- El servidor debe permitir CORS para las listas y los segmentos; el contenido con DRM (FairPlay, Widevine) no es compatible.
- Las pistas de audio alternativas y los subtítulos solo aparecen si la playlist los declara; el audio multicanal depende de los codecs del dispositivo (p. ej. E-AC-3 no está disponible en todos los navegadores).
- hls.js recupera errores de red y de decodificación hasta 3 veces y después se detiene con un mensaje claro.

## Requisitos del navegador para P2P

WebRTC con DataChannels, Service Worker activo y contexto seguro (HTTPS o `localhost`). Sin cualquiera de ellos, el reproductor explica la causa y no simula la reproducción. MediaSource Extensions **no** es necesario para el streaming P2P: el vídeo se entrega como una respuesta HTTP con rangos servida por el Service Worker.
