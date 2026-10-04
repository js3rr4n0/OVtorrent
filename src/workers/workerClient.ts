import { hasWebWorkers } from '../core/streaming/capabilities';
import { runJob } from './jobs';
import type { WorkerJob, WorkerRequest, WorkerResponse, WorkerResultFor } from './protocol';

interface Pending {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const JOB_TIMEOUT_MS = 30_000;

/**
 * Lazy client for the parsing/metrics worker. Falls back to the main thread
 * when Workers are unavailable or the worker fails to start, so every
 * feature keeps working on constrained TV browsers.
 */
export class ParseWorkerClient {
  private worker: Worker | null = null;
  private failed = false;
  private seq = 0;
  private pending = new Map<number, Pending>();
  private readonly create: (() => Worker) | null;

  constructor(create?: () => Worker) {
    this.create =
      create ??
      (hasWebWorkers()
        ? () =>
            new Worker(new URL('./parse.worker.ts', import.meta.url), {
              type: 'module',
              name: 'ovtorrent-parse',
            })
        : null);
  }

  /** Where jobs run right now. */
  mode(): 'worker' | 'main-thread' {
    return this.create && !this.failed ? 'worker' : 'main-thread';
  }

  private ensureWorker(): Worker | null {
    if (this.worker) return this.worker;
    if (!this.create || this.failed) return null;
    try {
      const w = this.create();
      w.addEventListener('message', (e: MessageEvent<WorkerResponse>) => this.onMessage(e.data));
      w.addEventListener('error', () => this.fail(new Error('El worker falló')));
      this.worker = w;
      return w;
    } catch {
      this.failed = true;
      return null;
    }
  }

  private onMessage(res: WorkerResponse) {
    const p = this.pending.get(res.id);
    if (!p) return;
    this.pending.delete(res.id);
    clearTimeout(p.timer);
    if (res.ok) p.resolve(res.result);
    else p.reject(new Error(res.error));
  }

  private fail(err: Error) {
    this.failed = true;
    this.worker?.terminate();
    this.worker = null;
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      this.pending.delete(id);
      p.reject(err);
    }
  }

  async run<J extends WorkerJob>(
    job: J,
    transfer: Transferable[] = [],
  ): Promise<WorkerResultFor<J>> {
    const w = this.ensureWorker();
    if (!w) return runJob(job);
    const id = ++this.seq;
    try {
      return await new Promise<WorkerResultFor<J>>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pending.delete(id);
          reject(new Error('El worker no respondió a tiempo'));
        }, JOB_TIMEOUT_MS);
        this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
        w.postMessage({ id, job } satisfies WorkerRequest, transfer);
      });
    } catch (err) {
      // A broken worker must never break the feature: retry on the main thread once.
      if (this.failed || (err instanceof Error && /worker/i.test(err.message))) {
        this.fail(err instanceof Error ? err : new Error(String(err)));
        return runJob(job);
      }
      throw err;
    }
  }

  terminate() {
    this.worker?.terminate();
    this.worker = null;
  }
}

export const parseWorker = new ParseWorkerClient();
