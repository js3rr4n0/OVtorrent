import { bridgeClient } from '@/core/streaming/webtorrent/bridge/BridgeClient';
import { getSharedClient } from '@/core/streaming/webtorrent/loadWebTorrent';
import { trackersFor } from '@/core/streaming/webtorrent/WebTorrentStreamingEngine';
import { hasRTCDataChannel, hasWebRTC } from '@/core/streaming/capabilities';
import { normalizeCode, MIN_CODE_LENGTH } from '@/core/streaming/webtorrent/bridge/protocol';
import { useSettingsStore } from '@/state/settingsStore';

let activeCode: string | null = null;

/**
 * Pairs the browser with the self-hosted bridge whenever a code is configured.
 * The WebTorrent bundle is loaded lazily only in that case.
 */
export function startBridgePairing(): () => void {
  const apply = async () => {
    const settings = useSettingsStore.getState().settings;
    const code = normalizeCode(settings.p2p.bridgeCode ?? '');
    const wanted =
      code.length >= MIN_CODE_LENGTH && hasWebRTC() && hasRTCDataChannel() ? code : null;
    if (wanted === activeCode) return;
    activeCode = wanted;
    if (!wanted) {
      await bridgeClient.disconnect();
      return;
    }
    try {
      const client = await getSharedClient({ maxConns: settings.buffer.maxPeers, webSeeds: true });
      await bridgeClient.connect(client, wanted, trackersFor(settings));
    } catch (err) {
      console.warn('[ovtorrent] no se pudo emparejar con el puente', err);
    }
  };
  void apply();
  const unsubscribe = useSettingsStore.subscribe(() => void apply());
  return () => {
    unsubscribe();
    activeCode = null;
    void bridgeClient.disconnect();
  };
}
