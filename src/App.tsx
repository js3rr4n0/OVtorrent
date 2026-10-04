import { useEffect } from 'react';
import { AppRouter } from './app/router';
import { sessionCleanup } from './core/cleanup/SessionCleanup';
import { startBridgePairing } from './app/bridgeBoot';

export default function App() {
  useEffect(() => {
    sessionCleanup.attachLifecycle();
    const stopBridge = startBridgePairing();
    return () => {
      sessionCleanup.detachLifecycle();
      stopBridge();
    };
  }, []);
  return <AppRouter />;
}
