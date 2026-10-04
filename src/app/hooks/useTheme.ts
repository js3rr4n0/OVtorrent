import { useEffect } from 'react';
import { useSettingsStore } from '@/state/settingsStore';

export function useTheme() {
  const theme = useSettingsStore((s) => s.settings.theme);
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const prefersDark =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches;
      const dark = theme === 'dark' || (theme === 'system' && prefersDark);
      root.classList.toggle('dark', dark);
    };
    apply();
    if (theme !== 'system' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener?.('change', apply);
    return () => mq.removeEventListener?.('change', apply);
  }, [theme]);
}
