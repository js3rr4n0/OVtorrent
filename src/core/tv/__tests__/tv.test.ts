import { describe, expect, it } from 'vitest';
import { detectTv } from '../detect';
import { directionFromKey, isBackKey, pickNext } from '../spatialNavigation';

describe('detectTv', () => {
  it('detects common TV user agents', () => {
    expect(detectTv('Mozilla/5.0 (Linux; Android 9; BRAVIA 4K UR2) AppleWebKit/537.36').isTv).toBe(
      true,
    );
    expect(detectTv('Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit').platform).toBe(
      'Samsung Tizen',
    );
    expect(detectTv('Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit').isTv).toBe(true);
    expect(detectTv('Mozilla/5.0 (Linux; Android 11; AFTKA Build) AppleWebKit').platform).toBe(
      'Amazon Fire TV',
    );
  });
  it('does not flag desktop browsers', () => {
    expect(detectTv('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120').isTv).toBe(false);
  });
});

describe('spatial navigation', () => {
  const el = (x: number, y: number) => ({ x, y, el: { x, y } as unknown as HTMLElement });
  it('maps keys to directions and back keys', () => {
    expect(directionFromKey('ArrowLeft')).toBe('left');
    expect(directionFromKey('Enter')).toBeNull();
    expect(isBackKey('Escape')).toBe(true);
    expect(isBackKey('Backspace')).toBe(true);
    expect(isBackKey('a')).toBe(false);
  });
  it('picks the nearest element in the requested direction', () => {
    const candidates = [el(0, 100), el(100, 0), el(100, 50), el(-50, 0)];
    expect(pickNext({ x: 0, y: 0 }, candidates, 'down')).toBe(candidates[0]!.el);
    expect(pickNext({ x: 0, y: 0 }, candidates, 'right')).toBe(candidates[1]!.el);
    expect(pickNext({ x: 0, y: 0 }, candidates, 'left')).toBe(candidates[3]!.el);
    expect(pickNext({ x: 0, y: 0 }, candidates, 'up')).toBeNull();
  });
});
