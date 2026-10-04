/// <reference lib="webworker" />
import { runJob } from './jobs';
import type { WorkerRequest, WorkerResponse } from './protocol';

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const { id, job } = event.data;
  runJob(job)
    .then((result) => scope.postMessage({ id, ok: true, result } satisfies WorkerResponse))
    .catch((err: unknown) =>
      scope.postMessage({
        id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      } satisfies WorkerResponse),
    );
});
