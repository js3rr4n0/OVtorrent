/**
 * Central registry of temporary resources (sessions, object URLs, buffers).
 * It runs cleanup on stop, source change, memory pressure, far seeks and on
 * page lifecycle events (pagehide, beforeunload, visibilitychange→hidden).
 *
 * Perfect cleanup cannot be promised when the browser kills the process
 * abruptly; this is best effort by design.
 */
export type CleanupReason =
  | 'stop'
  | 'source-change'
  | 'session-end'
  | 'memory-limit'
  | 'far-seek'
  | 'item-change'
  | 'pagehide'
  | 'beforeunload'
  | 'hidden'
  | 'manual';

type CleanupTask = (reason: CleanupReason) => void | Promise<void>;

export class SessionCleanup {
  private tasks = new Map<string, CleanupTask>();
  private detach: (() => void) | null = null;
  private log: Array<{ at: number; reason: CleanupReason; tasks: number }> = [];

  register(id: string, task: CleanupTask): () => void {
    this.tasks.set(id, task);
    return () => this.tasks.delete(id);
  }

  async run(reason: CleanupReason): Promise<void> {
    const entries = [...this.tasks.entries()];
    this.log.push({ at: Date.now(), reason, tasks: entries.length });
    if (this.log.length > 50) this.log.shift();
    await Promise.allSettled(entries.map(([, task]) => Promise.resolve().then(() => task(reason))));
  }

  /** Synchronous best-effort pass for unload handlers (no awaiting allowed there). */
  runSync(reason: CleanupReason): void {
    for (const [, task] of this.tasks) {
      try {
        void task(reason);
      } catch {
        /* ignore */
      }
    }
  }

  attachLifecycle(target: Window = window): void {
    if (this.detach) return;
    const onPageHide = () => this.runSync('pagehide');
    const onBeforeUnload = () => this.runSync('beforeunload');
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') this.runSync('hidden');
    };
    target.addEventListener('pagehide', onPageHide);
    target.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('visibilitychange', onVisibility);
    this.detach = () => {
      target.removeEventListener('pagehide', onPageHide);
      target.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onVisibility);
      this.detach = null;
    };
  }

  detachLifecycle(): void {
    this.detach?.();
  }

  history() {
    return [...this.log];
  }

  size() {
    return this.tasks.size;
  }
}

export const sessionCleanup = new SessionCleanup();
