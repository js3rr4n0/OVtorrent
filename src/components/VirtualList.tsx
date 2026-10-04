import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Dependency-free windowed list: renders only the rows near the viewport.
 * Used for long libraries/playlists so TV boxes do not keep hundreds of DOM
 * rows alive. Falls back to rendering everything for short lists so keyboard
 * navigation and tests behave exactly like a plain list.
 */
export function VirtualList<T>({
  items,
  rowHeight,
  threshold = 80,
  overscan = 6,
  maxHeight = '70vh',
  renderRow,
  getKey,
  as: Tag = 'ul',
  ...rest
}: {
  items: T[];
  rowHeight: number;
  threshold?: number;
  overscan?: number;
  maxHeight?: string;
  renderRow: (item: T, index: number) => ReactNode;
  getKey: (item: T, index: number) => string;
  as?: 'ul' | 'ol';
} & Omit<React.HTMLAttributes<HTMLElement>, 'children'>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState({ start: 0, end: Math.min(items.length, 40) });
  const virtual = items.length > threshold;

  useEffect(() => {
    if (!virtual) return;
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const start = Math.max(0, Math.floor(el.scrollTop / rowHeight) - overscan);
      const visible = Math.ceil(el.clientHeight / rowHeight) + overscan * 2;
      setRange({ start, end: Math.min(items.length, start + visible) });
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro?.disconnect();
    };
  }, [virtual, items.length, rowHeight, overscan]);

  // Keep the focused row visible when navigating with keyboard/D-pad.
  useEffect(() => {
    if (!virtual) return;
    const el = containerRef.current;
    if (!el) return;
    const onFocus = (e: FocusEvent) => {
      const row = (e.target as HTMLElement).closest('[data-index]') as HTMLElement | null;
      if (row) row.scrollIntoView({ block: 'nearest' });
    };
    el.addEventListener('focusin', onFocus);
    return () => el.removeEventListener('focusin', onFocus);
  }, [virtual]);

  if (!virtual) {
    return (
      <Tag {...rest}>
        {items.map((item, i) => (
          <li key={getKey(item, i)} data-index={i} className="contents">
            {renderRow(item, i)}
          </li>
        ))}
      </Tag>
    );
  }

  const slice = items.slice(range.start, range.end);
  return (
    <div ref={containerRef} style={{ maxHeight, overflowY: 'auto' }} className="relative">
      <Tag {...rest} style={{ height: items.length * rowHeight, position: 'relative' }}>
        {slice.map((item, i) => {
          const index = range.start + i;
          return (
            <li
              key={getKey(item, index)}
              data-index={index}
              style={{
                position: 'absolute',
                top: index * rowHeight,
                left: 0,
                right: 0,
                height: rowHeight,
              }}
              className="contents"
            >
              {renderRow(item, index)}
            </li>
          );
        })}
      </Tag>
      <p className="ovt-muted mt-1 text-xs" role="status">
        Mostrando {range.start + 1}–{range.end} de {items.length} (lista virtualizada)
      </p>
    </div>
  );
}
