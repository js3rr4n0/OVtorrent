# Almacenamiento local

OVtorrent usa **exclusivamente** almacenamiento local del navegador. No existe base de datos remota, backend ni sincronización. IndexedDB no es una base de datos remota ni un servidor: es almacenamiento local del navegador y aquí solo se usa como búfer efímero opcional.

## Dónde se guarda cada cosa

| Dato                                                        | Mecanismo               | Clave / nombre                             |
| ----------------------------------------------------------- | ----------------------- | ------------------------------------------ |
| Ajustes (tema, reproductor, calidad, búfer, TV, privacidad) | `localStorage`          | `ovtorrent:settings`                       |
| Biblioteca                                                  | `localStorage`          | `ovtorrent:library`                        |
| Favoritos                                                   | `localStorage`          | `ovtorrent:favorites`                      |
| Playlists                                                   | `localStorage`          | `ovtorrent:playlists`                      |
| Historial / progreso                                        | `localStorage`          | `ovtorrent:history`                        |
| Búfer efímero (opcional)                                    | IndexedDB               | base `ovtorrent-ephemeral`, store `chunks` |
| App shell de la PWA                                         | Cache Storage (Workbox) | `workbox-precache-*`                       |
| Archivos locales seleccionados, cola de reproducción        | Memoria (Zustand)       | — (se pierden al cerrar la pestaña)        |

Todo lo guardado se valida con Zod al leer. Si está corrupto o es de una versión incompatible, se descarta y se usan valores por defecto.

## Qué no se guarda por defecto

Archivo torrent completo, vídeo completo, datos personales, IP en un servidor, historial remoto, magnet links en servicios externos, telemetría, métricas enviadas a terceros.

## Modos del búfer temporal

| Modo                                  | Comportamiento                                                                                                                                                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `no-persistence` (**predeterminado**) | Las piezas del archivo en reproducción viven solo en la RAM de la pestaña (store efímero inyectado en WebTorrent) y se liberan al detener. Nunca se usa el Origin Private File System que WebTorrent elegiría por defecto.      |
| `memory`                              | Igual que el anterior; se mantiene como opción explícita y, para el motor HTML5, expulsa las piezas más antiguas al superar el límite.                                                                                          |
| `indexeddb`                           | `IndexedDbBufferStore` para dispositivos con muy poca RAM. Sigue siendo local y efímero: se vacía al detener, cambiar de fuente, cerrar la sesión y en `pagehide`. WebTorrent añade una pequeña caché LRU de 20 piezas delante. |

Con el motor WebTorrent, el **límite de memoria** no expulsa piezas sueltas (el protocolo asume que toda pieza verificada sigue disponible): cuando lo descargado lo supera, la sesión se reinicia desde la posición actual liberando todas las piezas (Ajustes → Calidad y búfer → P2P).

Política de ventanas (`computeWindowPolicy`): ventana histórica, posición actual, ventana futura, piezas prioritarias (posición actual y primer tercio de la ventana futura), piezas no prioritarias (resto de la ventana) y piezas expiradas (fuera de la ventana, eliminadas).

Limpiezas implementadas: al detener, al cambiar de fuente, al cerrar la sesión, al superar el límite de memoria, al hacer un seek lejano (más allá de la ventana futura), al cambiar de elemento y mediante `pagehide`, `beforeunload` y `visibilitychange`. No se promete limpieza perfecta si el navegador termina el proceso abruptamente.

## Presets de búfer

| Preset               | Inicial                  | Futuro | Histórico |
| -------------------- | ------------------------ | ------ | --------- |
| Ahorro de datos      | 15 s                     | 45 s   | 5 s       |
| Balanceado (defecto) | 30 s                     | 90 s   | 15 s      |
| 4K estable           | 60 s                     | 180 s  | 30 s      |
| Personalizado        | definidos por el usuario |        |           |

Estimación mostrada: `espacio ≈ bitrate (bits/s) × segundos de búfer ÷ 8`. El cálculo real varía por codec, contenedor, tamaño de pieza y overhead.

## Exportar, importar y borrar

En Ajustes → Almacenamiento: exportar toda la configuración a JSON (`ovtorrent-export`, versión 1), importar desde JSON (fusionar o reemplazar), eliminar toda la información local, solo historial, solo playlists, solo caché temporal, o restablecer configuración. Borrar los datos del sitio desde el navegador elimina playlists, preferencias e historial exactamente igual.

## Límites

Biblioteca 5000 elementos · 200 playlists · 500 elementos por playlist · 500 entradas de historial. Al alcanzar la cuota de `localStorage`, la aplicación sigue funcionando en memoria y avisa de que no se pudo guardar.
