# Puente OVtorrent (opcional, autoalojado)

## Por qué existe

Un navegador solo puede conectar con peers **WebRTC** descubiertos a través de trackers **WebSocket**. Los torrents habituales viven en enjambres BitTorrent clásicos (TCP/uTP, trackers UDP/HTTP, DHT) que son invisibles desde la web. Por eso un magnet con 29 seeders puede no tener ni un solo peer accesible para OVtorrent.

El puente resuelve exactamente eso: es un programa pequeño, gratuito y de código abierto que **tú** ejecutas en tu PC, NAS o Raspberry. Habla BitTorrent clásico con el enjambre y sirve el contenido al navegador por WebRTC. Con el puente emparejado, en el navegador basta con **pegar un magnet y pulsar reproducir**.

> Transparencia respecto a las restricciones del proyecto: la aplicación web sigue siendo 100 % estática y funciona sin el puente para fuentes con peers web, archivos locales, URLs y HLS. El puente es un **componente opcional** fuera del navegador, sin servidores de terceros, sin cuentas y sin pagos. Se añadió a petición expresa del usuario y se documenta como tal.

## Requisitos

- Node.js ≥ 20 en la máquina que hará de puente (el mismo PC, un NAS, una Raspberry…). No hace falta que sea la misma máquina donde está el navegador.
- Conexión a Internet en esa máquina. Si el navegador está en otra red, el puente y el navegador se encuentran igualmente a través de los trackers WebSocket públicos y WebRTC (STUN); en redes muy restrictivas sin UDP saliente puede no establecerse la conexión.

## Puesta en marcha sin terminal (doble clic)

1. Instala Node.js LTS desde <https://nodejs.org> (solo la primera vez).
2. Descarga el repositorio (botón **Code → Download ZIP** en GitHub) y descomprímelo.
3. Entra en la carpeta `bridge/` y haz doble clic en:
   - **Windows**: `iniciar-puente.cmd`
   - **macOS / Linux**: `iniciar-puente.sh` (si el sistema lo abre como texto, dale permiso de ejecución o lánzalo desde la carpeta con `./iniciar-puente.sh`).
4. La primera vez instala sus dependencias y te pide un código de emparejamiento (mínimo 6 caracteres). Lo guarda en `codigo.txt` junto al script para no volver a pedirlo.
5. Deja la ventana abierta y, en OVtorrent, ve a **Ajustes → Calidad y búfer → Puente**, introduce el mismo código y pega el magnet.

## Puesta en marcha desde la terminal

```bash
git clone https://github.com/js3rr4n0/OVtorrent
cd OVtorrent/bridge
npm install
npm start -- --code mi-codigo-secreto
```

El puente imprime el código y queda a la espera. Opciones:

| Opción            | Descripción                                                                                                                                                                      |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--code`, `-c`    | Código de emparejamiento (mínimo 6 caracteres). Si se omite, se genera uno aleatorio. Trátalo como una contraseña: cualquiera que lo conozca puede pedirle torrents a tu puente. |
| `--dir`, `-d`     | Carpeta de descargas (por defecto `./ovtorrent-downloads`). El puente descarga el torrent completo a disco, como cualquier cliente BitTorrent, y lo conserva.                    |
| `--tracker`, `-t` | Tracker WebSocket adicional (repetible). Por defecto usa los mismos públicos que la aplicación.                                                                                  |
| `--name`, `-n`    | Nombre que verá el navegador.                                                                                                                                                    |

En el navegador: **Ajustes → Calidad y búfer → Puente OVtorrent**, introduce el mismo código. El estado pasa a «conectado» en unos segundos. Desde ese momento, cada magnet que reproduzcas se envía automáticamente al puente; el aviso de conexión del reproductor muestra «Puente: descargando N % · peers clásicos M» y el vídeo arranca en cuanto el puente tiene las primeras piezas (descarga secuencial).

## Cómo funciona

1. Puente y navegador calculan el mismo _info hash_ de encuentro: `sha1("ovtorrent-bridge-v1:" + código)`. Ambos se anuncian con él a los trackers WebSocket. Es un torrent sin contenido: solo sirve para que se encuentren.
2. Cuando conectan por WebRTC, intercambian mensajes JSON mediante la extensión BitTorrent `ovt_bridge` (`hello`, `add`, `list`, `status`, `added`, `error`).
3. Al reproducir un magnet, el navegador envía `add`. El puente lo añade a su cliente híbrido (TCP/uTP/DHT para el enjambre clásico y WebRTC para el navegador) y lo anuncia también a los trackers WebSocket.
4. El puente nunca genera ofertas WebRTC: solo responde a las del navegador (evita el «glare» cuando ambos se anuncian a la vez). Cuando el puente ha anunciado el torrent a los trackers WebSocket avisa con `added`, el navegador vuelve a anunciarse con ofertas nuevas y la conexión se establece. La sesión normal del navegador recibe entonces las piezas por WebRTC; el puente informa del progreso cada 2 s.

Nada pasa por servidores de OVtorrent: los trackers WebSocket públicos solo presentan a los peers, igual que para cualquier torrent web.

## Privacidad y seguridad

- El puente es un cliente BitTorrent completo: los peers clásicos y los trackers UDP/HTTP verán la IP pública de la máquina donde corre. El navegador solo habla con el puente (y con otros peers web, si los hay).
- El código de emparejamiento autoriza a pedir descargas; usa uno largo y no lo compartas. El puente valida cada magnet y limita el tamaño de los mensajes.
- Las descargas quedan en la carpeta elegida; bórralas cuando quieras. El navegador sigue sin guardar vídeos completos.
- Todo el código del puente está en `bridge/` (MIT). Dependencias: `webtorrent` (MIT) y `node-datachannel` (MPL-2.0, WebRTC para Node.js).

## Limitaciones

- El puente **no transcodifica**: un archivo AV1/HEVC/Atmos/MKV que el navegador no pueda decodificar seguirá sin reproducirse. Comprueba la compatibilidad en Diagnóstico.
- La velocidad en el navegador depende de lo que el puente consiga del enjambre clásico y del enlace WebRTC entre ambos.
- Si el puente se apaga, el navegador vuelve a depender de peers web.

## Pruebas

- `cd bridge && npm test`: protocolo de emparejamiento y mensajes.
- `npm run test:e2e -- e2e/bridge.spec.ts`: prueba completa sin red externa: tracker local HTTP+WebSocket, sembrador Node clásico (solo TCP), puente Node con WebRTC y navegador que pega el magnet y reproduce.
