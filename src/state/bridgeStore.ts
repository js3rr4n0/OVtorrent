import { useSyncExternalStore } from 'react';
import { bridgeClient, type BridgeState } from '@/core/streaming/webtorrent/bridge/BridgeClient';

/** React binding for the bridge client state. */
export function useBridgeState(): BridgeState {
  return useSyncExternalStore(
    (cb) => bridgeClient.subscribe(() => cb()),
    () => bridgeClient.getState(),
    () => bridgeClient.getState(),
  );
}
