import { useEffect } from 'react';
import { AppRouter } from './app/router';
import { sessionCleanup } from './core/cleanup/SessionCleanup';

export default function App() {
  useEffect(() => {
    sessionCleanup.attachLifecycle();
    return () => sessionCleanup.detachLifecycle();
  }, []);
  return <AppRouter />;
}
