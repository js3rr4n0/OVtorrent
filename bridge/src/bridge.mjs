import { mkdirSync } from 'node:fs';
import { createBridgeExtension, sendTo } from './extension.mjs';
import {
  DEFAULT_WS_TRACKERS,
  isValidMagnet,
  pairingInfoHash,
  pairingMagnet,
  PROTOCOL_VERSION,
} from './protocol.mjs';

/**
 * The bridge: a hybrid WebTorrent client (TCP/uTP/DHT + WebRTC) running on
 * the user's own machine. Browsers paired with the same code ask it to fetch
 * magnets; it downloads them from the classic swarm and seeds them to the
 * browser over WebRTC through the same public WebSocket trackers.
 */
export async function createBridge(options) {
  const {
    code,
    dir,
    trackers = DEFAULT_WS_TRACKERS,
    log = () => {},
    name = 'ovtorrent-bridge',
    createClient,
  } = options;
  const infoHash = pairingInfoHash(code);
  mkdirSync(dir, { recursive: true });

  const client = await (createClient ? createClient() : defaultClient());
  const peers = new Set();
  const status = () => ({
    t: 'status',
    v: PROTOCOL_VERSION,
    name,
    torrents: client.torrents
      .filter((t) => t.infoHash !== infoHash)
      .map((t) => ({
        infoHash: t.infoHash,
        name: t.name || t.infoHash,
        progress: t.progress,
        numPeers: t.numPeers,
        downloadSpeed: t.downloadSpeed,
        uploadSpeed: t.uploadSpeed,
        done: t.done,
        ready: t.ready,
      })),
  });
  const broadcast = (message) => {
    for (const wire of peers) sendTo(wire, message);
  };

  const addMagnet = (magnet) =>
    new Promise((resolve) => {
      if (!isValidMagnet(magnet)) return resolve({ ok: false, message: 'magnet no válido' });
      const existing = client.torrents.find((t) => magnet.toLowerCase().includes(t.infoHash));
      if (existing) return resolve({ ok: true, infoHash: existing.infoHash, existing: true });
      const torrent = client.add(magnet, { path: dir, announce: trackers, strategy: 'sequential' });
      torrent.on('infoHash', () => log(`añadido ${torrent.infoHash}`));
      torrent.once('trackerAnnounce', () => {
        log(`anunciado ${torrent.infoHash.slice(0, 8)} a los trackers WebSocket`);
        broadcast({ t: 'added', infoHash: torrent.infoHash });
      });
      torrent.on('metadata', () =>
        log(`metadatos: ${torrent.name} (${torrent.files.length} archivos)`),
      );
      torrent.on('wire', (wire, addr) =>
        log(
          `peer ${wire.type ?? 'tcp'} ${addr ?? ''} en ${torrent.infoHash.slice(0, 8)} (${torrent.numPeers})`,
        ),
      );
      torrent.on('done', () => log(`completado: ${torrent.name}`));
      torrent.on('warning', (err) =>
        log(`aviso ${torrent.infoHash?.slice(0, 8) ?? ''}: ${err.message}`),
      );
      torrent.on('error', (err) =>
        log(`error ${torrent.infoHash?.slice(0, 8) ?? ''}: ${err.message}`),
      );
      torrent.once('infoHash', () => resolve({ ok: true, infoHash: torrent.infoHash }));
    });

  const Extension = createBridgeExtension({
    onPeerReady: (wire) => {
      peers.add(wire);
      log(`navegador emparejado (${peers.size} conexiones)`);
      sendTo(wire, { t: 'hello', v: PROTOCOL_VERSION, name });
      sendTo(wire, status());
    },
    onPeerClose: (wire) => {
      peers.delete(wire);
    },
    onPeerMessage: async (wire, message) => {
      if (message.t === 'hello') {
        sendTo(wire, { t: 'hello', v: PROTOCOL_VERSION, name });
      } else if (message.t === 'add') {
        const result = await addMagnet(message.magnet);
        if (!result.ok) sendTo(wire, { t: 'error', message: result.message });
        else if (result.existing) sendTo(wire, { t: 'added', infoHash: result.infoHash });
        broadcast(status());
      } else if (message.t === 'list') {
        sendTo(wire, status());
      }
    },
  });

  const rendezvous = client.add(pairingMagnet(code, trackers), {
    path: dir,
    announce: trackers,
    private: true,
  });
  rendezvous.on('wire', (wire) => wire.use(Extension));
  rendezvous.on('warning', (err) => {
    if (!/Unsupported tracker protocol|Error connecting/i.test(err.message))
      log(`aviso rendezvous: ${err.message}`);
  });
  rendezvous.on('error', (err) => log(`error rendezvous: ${err.message}`));

  const timer = setInterval(() => {
    if (peers.size > 0) broadcast(status());
  }, 2000);

  return {
    client,
    infoHash,
    peers,
    addMagnet,
    status,
    destroy: () =>
      new Promise((resolve) => {
        clearInterval(timer);
        client.destroy(() => resolve());
      }),
  };
}

/**
 * The bridge never generates WebRTC offers: it only answers the browser's.
 * When both sides offer at the same time (the browser announces its torrent
 * while asking the bridge for it) each side ends up with two peers for the
 * same id, drops one and the surviving pair never matches ("glare"). With a
 * single offerer the handshake is deterministic; the browser re-announces
 * when the bridge reports a torrent as ready.
 */
export async function makeAnswerOnly() {
  const { default: WebSocketTracker } = await import('bittorrent-tracker/websocket-tracker');
  WebSocketTracker.prototype._generateOffers = function answerOnly(_numwant, cb) {
    cb([]);
  };
}

async function defaultClient() {
  await makeAnswerOnly();
  const { default: WebTorrent } = await import('webtorrent');
  const polyfill = await import('node-datachannel/polyfill');
  globalThis.WRTC = polyfill.default ?? polyfill;
  // uTP is disabled: in practice it only delays TCP connections to classic peers
  // (several seconds per attempt) and many seeders do not listen on uTP.
  return new WebTorrent({ tracker: { wrtc: globalThis.WRTC }, utp: false });
}
