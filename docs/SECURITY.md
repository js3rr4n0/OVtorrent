# Seguridad

## Principios

- Ninguna entrada se ejecuta. Nada importado se interpreta como HTML, JavaScript ni URL ejecutable.
- No se usa `eval` ni `new Function` (regla de ESLint `no-eval`, `no-new-func`, `no-implied-eval`).
- No se cargan scripts externos dinámicos. Todas las dependencias se empaquetan en build.
- No hay secretos: no existen claves API ni tokens en el código ni en el build.

## Validación de entradas

Todo lo que entra pasa por esquemas Zod `strict()` (`src/core/schemas`):

- **Playlists JSON**: versión literal `1`, campos conocidos únicamente, máximo 500 elementos, títulos ≤ 200 caracteres, descripciones ≤ 1000, etiquetas ≤ 20 × 32, archivo ≤ 2 MB. Se rechazan claves peligrosas (`script`, `onload`, `__proto__`, `constructor`, `prototype`…) en cualquier nivel.
- **Magnet links**: deben empezar por `magnet:?`, contener `urn:btih:` con hash hex de 40 o base32 de 32 caracteres; longitud ≤ 4096. Se normalizan antes de guardarse. Los magnets BitTorrent v2 (`btmh`) se rechazan con explicación.
- **Archivos `.torrent`**: decodificador bencode propio con límites (≤ 4 MB, ≤ 2000 archivos); solo se extraen nombre, lista de archivos, trackers y hash. El archivo no se guarda.
- **URLs**: solo `http:`, `https:` y `blob:`. Se bloquean `javascript:`, `vbscript:`, `file:`, `about:` y `data:` (no es necesario para fuentes multimedia). Se rechazan credenciales embebidas. Las URLs externas requieren confirmación del usuario (configurable).
- **Metadatos**: sin `<` ni `>` ni caracteres de control. React escapa todas las cadenas; además `sanitizeText` las limpia antes de guardar.
- **Listas M3U/M3U8**: ≤ 2 MB, ≤ 500 entradas, títulos sanitizados, solo `http(s)` y magnets (los esquemas peligrosos se rechazan línea a línea), URLs relativas solo con URL base explícita. Descargar una lista por URL requiere confirmación y usa `credentials: 'omit'`.
- **Subtítulos**: ≤ 2 MB; en la conversión SRT → WebVTT se eliminan todas las etiquetas salvo `<i>`, `<b>`, `<u>` y `<v>` y se escapan `&`, `<`, `>`. Los subtítulos del torrent se descargan al búfer efímero y se convierten localmente.
- **HLS**: hls.js se empaqueta en el build (chunk diferido); nunca se carga desde CDN. Las listas y segmentos se piden sin credenciales.
- **Bundle de exportación/importación**: mismo tratamiento; ≤ 10 MB.

## Confirmaciones

- Importar listas con más de 50 elementos.
- Añadir URLs externas.
- Borrar toda la biblioteca, el historial, las playlists o la caché.

## Límites de recursos

- Biblioteca ≤ 5000 elementos, 200 playlists, 500 entradas de historial.
- Búfer en memoria entre 16 MB y 512 MB (por defecto 256 MB), con expulsión de las piezas más antiguas.
- Métricas muestreadas a 1 Hz.

## Content Security Policy

Inyectada en `index.html` solo en build (`vite.config.ts`):

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self';
media-src 'self' blob: https: http:;
connect-src 'self' blob: https: wss: ws:;
worker-src 'self' blob:;
object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

- `blob:` permite las object URLs del reproductor y MediaSource.
- `media-src https: http:` permite URLs introducidas por el usuario.
- `connect-src wss: ws: https:` permite los trackers WebTorrent (WebSocket). `ws:` sin cifrar solo tiene sentido para trackers en red local; los públicos usan `wss:`. Los DataChannels WebRTC no están gobernados por CSP.
- `media-src 'self'` cubre el stream P2P, que se sirve desde el propio origen (`/webtorrent/<infoHash>/<archivo>`) por el Service Worker.
- `style-src 'unsafe-inline'` es necesario por los estilos inline que React aplica a algunos elementos; no afecta a scripts.

Además: `<meta name="referrer" content="no-referrer">`.

## Service Worker

Solo precachea el app shell (`js`, `css`, `html`, `svg`, `png`, `webmanifest`). No hay runtime caching: nunca almacena vídeos, torrents ni respuestas de terceros.

El handler de streaming (`public/webtorrent-sw.js`, importado por el worker de Workbox) solo atiende URLs bajo `<scope>webtorrent/`. No accede a la red: pide los datos a la ventana que ejecuta el cliente WebTorrent mediante `MessageChannel` y los transmite como `ReadableStream`. Las respuestas llevan `Cache-Control: no-store`.

## P2P

- Los trackers introducidos por el usuario se validan (`ws://` o `wss://`, ≤ 512 caracteres, máximo 20).
- Las piezas se verifican por hash SHA-1 dentro de WebTorrent antes de servirse al reproductor.
- El bundle de WebTorrent se carga solo cuando se reproduce un magnet (chunk diferido del propio build, nunca desde un CDN).
- Nunca se usa el Origin Private File System: las piezas viven en RAM o en IndexedDB local y se borran al detener.

## Reportar vulnerabilidades

Abre un issue marcado como _security_ en el repositorio o contacta con los mantenedores. No incluyas exploits públicos hasta que exista una corrección.
