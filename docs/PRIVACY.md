# Política de privacidad local

OVtorrent es **local-first** y **privacy-by-default**. No tiene servidor propio, cuentas ni perfil remoto. Este documento se reproduce dentro de la aplicación en `/about`.

## Qué datos se guardan en el navegador

Todo en el almacenamiento local del navegador (`localStorage`), bajo claves con prefijo `ovtorrent:`:

- Preferencias y tema visual.
- Configuración del reproductor, de calidad y de búfer.
- Playlists, historial de reproducción (posición y fecha), favoritos.
- Metadatos introducidos por ti (títulos, etiquetas, descripciones).
- Configuración del modo TV y último estado de navegación.

Opcionalmente, si eliges «IndexedDB efímero» como almacén de búfer, piezas temporales del elemento que se está reproduciendo, limitadas por la ventana configurada y eliminadas al detener.

Los archivos locales que seleccionas **no** se copian: solo se guarda su nombre y deberás volver a seleccionarlos en otra sesión.

## Qué no se guarda ni se envía

- Archivos torrent completos ni vídeos completos (deliberadamente).
- Datos personales.
- Tu IP en ningún servidor de la aplicación (no existe tal servidor).
- Historial remoto, playlists en servicios externos, magnet links en servicios externos.
- Telemetría, analítica, métricas enviadas a terceros, tracking pixels, cookies de terceros, SDKs de marketing, anuncios, minería.

## Cómo borrar los datos

En **Ajustes → Almacenamiento y limpieza** puedes:

- Eliminar toda la información local.
- Eliminar solo el historial, solo las playlists o solo la caché temporal.
- Restablecer la configuración.

Borrar los datos del sitio desde el navegador tiene el mismo efecto y la aplicación sigue funcionando con valores por defecto. El navegador o el sistema operativo también pueden limpiar este almacenamiento por su cuenta.

## Qué conexiones realiza el navegador

- **Archivos locales:** ninguna conexión.
- **URLs remotas:** si reproduces una URL que hayas introducido, el navegador se conecta directamente a ese servidor, que verá tu IP.
- **Magnets / torrents (WebTorrent):** al reproducir, el navegador se conecta a los trackers WebSocket configurados (por defecto `wss://tracker.openwebtorrent.com`, `wss://tracker.webtorrent.dev`, `wss://tracker.files.fm:7073/announce` y `wss://tracker.novage.com.ua`, dependencias públicas del protocolo WebTorrent, no servicios de OVtorrent; puedes desactivarlos o sustituirlos en Ajustes → Calidad y búfer → P2P) y a otros peers mediante WebRTC. Para establecer la conexión WebRTC, la librería consulta servidores STUN públicos (`stun.l.google.com`, `global.stun.twilio.com`). **Los trackers, los servidores STUN y los peers de una red P2P pueden conocer tu IP pública.** Mientras reproduces, también compartes las piezas que ya tienes con otros peers (puede desactivarse en los mismos ajustes). La aplicación no opera un servidor propio para ocultar la IP. Si decides usar una VPN externa, no forma parte de la aplicación.
- **Puente (opcional):** si configuras un código de emparejamiento, el navegador se anuncia a los trackers WebSocket con un hash de encuentro derivado del código y envía al puente, por WebRTC, los magnets que reproduces. El puente corre en tu propia máquina y es quien habla con el enjambre clásico (ver `BRIDGE.md`).
- **HLS:** al reproducir, el navegador descarga la playlist y los segmentos directamente del servidor indicado, que verá tu IP. Descargar una lista M3U por URL desde Importar también contacta con ese servidor (una sola vez, previa confirmación).
- Nada de lo anterior ocurre hasta que pulsas reproducir (o descargar una lista). La importación de magnets, `.torrent`, archivos y texto pegado es puramente local.

## Permisos

La aplicación no solicita permisos innecesarios. Pantalla completa y Picture-in-picture se piden solo al pulsar sus botones. El portapapeles solo se usa si pides copiar el informe de diagnóstico.
