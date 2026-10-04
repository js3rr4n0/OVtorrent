import { describe, expect, it, vi } from 'vitest';
import { SessionCleanup } from '../SessionCleanup';

describe('SessionCleanup', () => {
  it('runs registered tasks with the reason and tracks history', async () => {
    const c = new SessionCleanup();
    const task = vi.fn();
    const off = c.register('a', task);
    await c.run('stop');
    expect(task).toHaveBeenCalledWith('stop');
    off();
    await c.run('far-seek');
    expect(task).toHaveBeenCalledTimes(1);
    expect(c.history().map((h) => h.reason)).toEqual(['stop', 'far-seek']);
  });

  it('fires synchronously on pagehide / beforeunload / hidden', () => {
    const c = new SessionCleanup();
    const task = vi.fn();
    c.register('a', task);
    c.attachLifecycle(window);
    window.dispatchEvent(new Event('pagehide'));
    window.dispatchEvent(new Event('beforeunload'));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(task.mock.calls.map((c) => c[0])).toEqual(['pagehide', 'beforeunload', 'hidden']);
    c.detachLifecycle();
    window.dispatchEvent(new Event('pagehide'));
    expect(task).toHaveBeenCalledTimes(3);
  });

  it('isolates failing tasks', async () => {
    const c = new SessionCleanup();
    c.register('bad', () => {
      throw new Error('boom');
    });
    const good = vi.fn();
    c.register('good', good);
    await c.run('manual');
    expect(good).toHaveBeenCalled();
  });
});
