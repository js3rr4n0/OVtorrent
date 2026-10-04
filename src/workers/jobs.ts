import { importPlaylistJson } from '../core/import/json';
import { importM3u } from '../core/import/m3u';
import { parseTorrentFile } from '../core/import/torrentFile';
import { computeAvailability, type WorkerJob, type WorkerResultFor } from './protocol';

/** Executes a job. Runs inside the worker or, as a fallback, on the main thread. */
export async function runJob<J extends WorkerJob>(job: J): Promise<WorkerResultFor<J>> {
  switch (job.kind) {
    case 'parse-m3u':
      return importM3u(job.text, {
        sourceUrl: job.sourceUrl,
        fallbackTitle: job.fallbackTitle,
      }) as WorkerResultFor<J>;
    case 'parse-json-playlist':
      return importPlaylistJson(job.text) as WorkerResultFor<J>;
    case 'parse-torrent':
      return (await parseTorrentFile(job.buffer)) as WorkerResultFor<J>;
    case 'availability':
      return computeAvailability(job) as WorkerResultFor<J>;
    case 'ping':
      return { pong: true, at: Date.now() } as WorkerResultFor<J>;
    default:
      throw new Error('Trabajo desconocido');
  }
}
