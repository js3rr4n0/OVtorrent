#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { createBridge } from './bridge.mjs';
import { DEFAULT_WS_TRACKERS, normalizeCode } from './protocol.mjs';

const { values } = parseArgs({
  options: {
    code: { type: 'string', short: 'c' },
    dir: { type: 'string', short: 'd', default: './ovtorrent-downloads' },
    tracker: { type: 'string', short: 't', multiple: true },
    name: { type: 'string', short: 'n', default: 'ovtorrent-bridge' },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help) {
  console.log(`ovtorrent-bridge — puente autoalojado para OVtorrent

Uso: node src/cli.mjs --code <código> [--dir carpeta] [--tracker wss://...]

  --code, -c     Código de emparejamiento (mín. 6 caracteres). Introdúcelo en
                 OVtorrent → Ajustes → Calidad y búfer → Puente. Si se omite,
                 se genera uno aleatorio.
  --dir, -d      Carpeta donde se descargan los torrents (por defecto ./ovtorrent-downloads).
  --tracker, -t  Tracker WebSocket adicional (repetible).
  --name, -n     Nombre que verá el navegador.

El puente se conecta a peers BitTorrent clásicos (TCP/uTP/DHT) y sirve el
contenido al navegador por WebRTC. No usa servidores propios: los trackers
WebSocket públicos solo presentan a los dos peers.`);
  process.exit(0);
}

const code = normalizeCode(values.code) || randomBytes(4).toString('hex');
const trackers = [...DEFAULT_WS_TRACKERS, ...(values.tracker ?? [])];
const log = (line) => console.log(`[${new Date().toLocaleTimeString()}] ${line}`);

const bridge = await createBridge({ code, dir: values.dir, trackers, name: values.name, log });
console.log(
  `\nOVtorrent bridge listo.\n  Código de emparejamiento: ${code}\n  Carpeta de descargas:     ${values.dir}\n  Trackers WebSocket:       ${trackers.join(', ')}\n\nEn el navegador: Ajustes → Calidad y búfer → Puente → introduce el código.\nDespués pega cualquier magnet y pulsa reproducir.\n`,
);

const shutdown = async () => {
  log('cerrando…');
  await bridge.destroy();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
