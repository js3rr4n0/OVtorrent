import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { detectTv } from '@/core/tv/detect';
import {
  directionFromKey,
  elementHandlesArrows,
  isBackKey,
  moveFocus,
} from '@/core/tv/spatialNavigation';
import { useSettingsStore } from '@/state/settingsStore';

export function useTvDetection() {
  return useMemo(() => detectTv(), []);
}

/** Resolves whether TV mode is active (auto-detect or manual) and wires D-pad navigation. */
export function useTvMode() {
  const tv = useSettingsStore((s) => s.settings.tv);
  const detection = useTvDetection();
  const active = tv.mode === 'on' || (tv.mode === 'auto' && detection.isTv);
  const navigate = useNavigate();

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('tv-mode', active);
    root.classList.toggle('high-contrast', active && tv.highContrast);
    root.classList.toggle('large-text', active && tv.largeText);
    root.style.fontSize = active && !tv.largeText ? '1rem' : '';
  }, [active, tv.highContrast, tv.largeText]);

  useEffect(() => {
    // Keyboard/D-pad navigation is always wired (keyboard users benefit too),
    // but arrow-key spatial focus is only enabled in TV mode to avoid
    // hijacking normal desktop behaviour.
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (isBackKey(e.key)) {
        if (
          target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'SELECT')
        ) {
          if (e.key === 'Backspace') return;
        }
        if (document.querySelector('[role="dialog"]')) return;
        e.preventDefault();
        if (window.history.length > 1) navigate(-1);
        else navigate('/');
        return;
      }
      if (!active) return;
      const dir = directionFromKey(e.key);
      if (!dir) return;
      if (elementHandlesArrows(target, dir)) return;
      if (moveFocus(dir)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, navigate]);

  return { active, detection };
}
