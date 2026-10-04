import { decodeMessage, encodeMessage, EXTENSION_NAME } from './protocol.mjs';

/**
 * bittorrent-protocol extension. `onPeerMessage(wire, message)` is called for
 * every valid JSON message; `send(wire, message)` sends one once the remote
 * side advertised support in its extended handshake.
 */
export function createBridgeExtension({ onPeerReady, onPeerMessage, onPeerClose }) {
  class BridgeExtension {
    constructor(wire) {
      this.wire = wire;
      this.ready = false;
      wire.once('close', () => onPeerClose?.(wire));
    }
    onHandshake() {}
    onExtendedHandshake(handshake) {
      const supported =
        handshake &&
        handshake.m &&
        Object.prototype.hasOwnProperty.call(handshake.m, EXTENSION_NAME);
      if (!supported) return;
      this.ready = true;
      onPeerReady?.(this.wire);
    }
    onMessage(buffer) {
      const message = decodeMessage(buffer);
      if (message) onPeerMessage?.(this.wire, message);
    }
  }
  BridgeExtension.prototype.name = EXTENSION_NAME;
  return BridgeExtension;
}

export function sendTo(wire, message) {
  try {
    wire.extended(EXTENSION_NAME, encodeMessage(message));
    return true;
  } catch {
    return false;
  }
}
