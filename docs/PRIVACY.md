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

- **Fase 1 (actual):** ninguna conexión salvo la descarga de la propia aplicación y, si reproduces una URL remota que hayas introducido, la conexión directa a ese servidor, que verá tu IP.
- **Fase 2 (WebTorrent):** el navegador se conectará a trackers WebSocket públicos (son dependencias del protocolo WebTorrent, no servicios de OVtorrent) y a otros peers mediante WebRTC. **Los peers de una red P2P pueden conocer la IP pública necesaria para establecer la conexión.** La aplicación no opera un servidor propio para ocultar la IP. Si decides usar una VPN externa, no forma parte de la aplicación.

## Permisos

La aplicación no solicita permisos innecesarios. Pantalla completa y Picture-in-picture se piden solo al pulsar sus botones. El portapapeles solo se usa si pides copiar el informe de diagnóstico.
