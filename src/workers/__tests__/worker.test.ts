import { describe, expect, it } from 'vitest';
import { runJob } from '../jobs';
import { bitAt, computeAvailability, type WorkerRequest, type WorkerResponse } from '../protocol';
import { ParseWorkerClient } from '../workerClient';

const HASH = 'dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c';

/** Minimal in-process Worker double that executes jobs through runJob. */
class FakeWorker extends EventTarget {
  static created = 0;
  constructor(private readonly broken = false) {
    super();
    FakeWorker.created++;
  }
  postMessage(req: WorkerRequest) {
    if (this.broken) {
      queueMicrotask(() => this.dispatchEvent(new Event('error')));
      return;
    }
    runJob(req.job)
      .then((result) => this.emit({ id: req.id, ok: true, result }))
      .catch((e: Error) => this.emit({ id: req.id, ok: false, error: e.message }));
  }
  private emit(data: WorkerResponse) {
    this.dispatchEvent(new MessageEvent('message', { data }));
  }
  terminate() {}
}

describe('worker jobs', () => {
  it('parses M3U, JSON playlists and torrents and answers ping', async () => {
    const m3u = await runJob({
      kind: 'parse-m3u',
      text: '#EXTM3U\n#EXTINF:1,A\nhttps://a.org/a.mp4',
    });
    expect(m3u.ok).toBe(true);
    const json = await runJob({
      kind: 'parse-json-playlist',
      text: JSON.stringify({
        version: 1,
        name: 'L',
        items: [
          {
            id: crypto.randomUUID(),
            sourceType: 'magnet',
            source: `magnet:?xt=urn:btih:${HASH}`,
            title: 'x',
          },
        ],
      }),
    });
    expect(json.ok).toBe(true);
    const ping = await runJob({ kind: 'ping' });
    expect(ping.pong).toBe(true);
    await expect(
      runJob({
        kind: 'parse-torrent',
        buffer: new TextEncoder().encode('nope').buffer as ArrayBuffer,
      }),
    ).rejects.toThrow();
  });

  it('computes availability from bitfields', () => {
    const have = new Uint8Array([0b10000000]); // piece 0
    const peer = new Uint8Array([0b01100000]); // pieces 1, 2
    expect(bitAt(have, 0)).toBe(true);
    expect(bitAt(have, 1)).toBe(false);
    expect(
      computeAvailability({
        kind: 'availability',
        have,
        peers: [peer],
        start: 0,
        end: 3,
        maxSamples: 500,
      }),
    ).toEqual({ availability: 0.75, sampled: 4 });
    expect(
      Number.isNaN(
        computeAvailability({
          kind: 'availability',
          have: new Uint8Array(1),
          peers: [],
          start: 0,
          end: 3,
          maxSamples: 500,
        }).availability,
      ),
    ).toBe(true);
    expect(
      computeAvailability({
        kind: 'availability',
        have,
        peers: [],
        start: 0,
        end: 7,
        maxSamples: 2,
      }).sampled,
    ).toBe(2);
  });
});

describe('ParseWorkerClient', () => {
  it('runs jobs through the worker and reports its mode', async () => {
    const client = new ParseWorkerClient(() => new FakeWorker() as unknown as Worker);
    expect(client.mode()).toBe('worker');
    const r = await client.run({ kind: 'ping' });
    expect(r.pong).toBe(true);
    const m3u = await client.run({ kind: 'parse-m3u', text: '#EXTM3U\nhttps://a.org/a.mp4' });
    expect(m3u.items).toHaveLength(1);
  });

  it('falls back to the main thread when the worker breaks or is unavailable', async () => {
    const broken = new ParseWorkerClient(() => new FakeWorker(true) as unknown as Worker);
    const r = await broken.run({ kind: 'ping' });
    expect(r.pong).toBe(true);
    expect(broken.mode()).toBe('main-thread');
    const none = new ParseWorkerClient(() => {
      throw new Error('no workers');
    });
    expect((await none.run({ kind: 'ping' })).pong).toBe(true);
    expect(none.mode()).toBe('main-thread');
  });

  it('propagates job errors from the worker', async () => {
    const client = new ParseWorkerClient(() => new FakeWorker() as unknown as Worker);
    await expect(
      client.run({
        kind: 'parse-torrent',
        buffer: new TextEncoder().encode('nope').buffer as ArrayBuffer,
      }),
    ).rejects.toThrow(/bencode/);
    expect(client.mode()).toBe('worker');
  });
});
