/**
 * Minimal spatial (D-pad) navigation: Arrow keys move focus to the nearest
 * focusable element in that direction. Works with any keyboard/remote that
 * emits standard key events. Enter activates natively; Back/Escape/Backspace
 * are handled by the router layer.
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), video[controls], [tabindex]:not([tabindex="-1"]):not([disabled])';

export type Direction = 'up' | 'down' | 'left' | 'right';

export function directionFromKey(key: string): Direction | null {
  switch (key) {
    case 'ArrowUp':
      return 'up';
    case 'ArrowDown':
      return 'down';
    case 'ArrowLeft':
      return 'left';
    case 'ArrowRight':
      return 'right';
    default:
      return null;
  }
}

export function isBackKey(key: string): boolean {
  return (
    key === 'Escape' ||
    key === 'Backspace' ||
    key === 'GoBack' ||
    key === 'BrowserBack' ||
    key === 'XF86Back'
  );
}

function isVisible(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).visibility !== 'hidden';
}

export function getFocusables(root: ParentNode = document): HTMLElement[] {
  const all = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)];
  const visible = all.filter(isVisible);
  // Engines without layout (or pages before first paint) report zero-size
  // rects; fall back to DOM order so navigation never gets stuck.
  return visible.length > 0 ? visible : all;
}

interface Rect {
  x: number;
  y: number;
}

function center(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** Pure function used by tests: picks the best candidate for a direction. */
export function pickNext(
  current: { x: number; y: number },
  candidates: Array<{ x: number; y: number; el: HTMLElement }>,
  dir: Direction,
): HTMLElement | null {
  let best: { el: HTMLElement; score: number } | null = null;
  for (const c of candidates) {
    const dx = c.x - current.x;
    const dy = c.y - current.y;
    let primary: number;
    let secondary: number;
    switch (dir) {
      case 'up':
        primary = -dy;
        secondary = Math.abs(dx);
        break;
      case 'down':
        primary = dy;
        secondary = Math.abs(dx);
        break;
      case 'left':
        primary = -dx;
        secondary = Math.abs(dy);
        break;
      case 'right':
      default:
        primary = dx;
        secondary = Math.abs(dy);
        break;
    }
    if (primary <= 1) continue; // must be strictly in that direction
    const score = primary + secondary * 2.5;
    if (!best || score < best.score) best = { el: c.el, score };
  }
  return best?.el ?? null;
}

export function moveFocus(dir: Direction, root: ParentNode = document): boolean {
  const active = document.activeElement as HTMLElement | null;
  const focusables = getFocusables(root);
  if (focusables.length === 0) return false;
  if (!active || active === document.body || !focusables.includes(active)) {
    focusables[0]?.focus();
    return true;
  }
  const from = center(active);
  const next = pickNext(
    from,
    focusables.filter((el) => el !== active).map((el) => ({ ...center(el), el })),
    dir,
  );
  if (next) {
    next.focus();
    next.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    return true;
  }
  // No candidate in that direction (edge of a row/column): advance in DOM
  // order so a remote can always reach every control.
  const idx = focusables.indexOf(active);
  const fallback = dir === 'down' || dir === 'right' ? focusables[idx + 1] : focusables[idx - 1];
  if (fallback) {
    fallback.focus();
    fallback.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    return true;
  }
  return false;
}

/** Elements that consume arrow keys themselves (sliders, text inputs, video). */
export function elementHandlesArrows(el: Element | null, dir: Direction): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type;
    if (type === 'range') return dir === 'left' || dir === 'right';
    if (['text', 'url', 'search', 'number', 'email', 'password'].includes(type))
      return dir === 'left' || dir === 'right';
  }
  if (tag === 'TEXTAREA') return true;
  if (tag === 'SELECT') return dir === 'up' || dir === 'down';
  return false;
}
