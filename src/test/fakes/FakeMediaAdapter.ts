/** Simulates a media element for tests of time/duration driven logic. */
export class FakeMediaAdapter {
  currentTime = 0;
  duration = 0;
  paused = true;
  canPlay: Record<string, '' | 'maybe' | 'probably'> = {};
  listeners = new Map<string, Set<() => void>>();
  addEventListener(type: string, cb: () => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(cb);
  }
  removeEventListener(type: string, cb: () => void) {
    this.listeners.get(type)?.delete(cb);
  }
  dispatch(type: string) {
    for (const cb of this.listeners.get(type) ?? []) cb();
  }
  canPlayType(mime: string) {
    return this.canPlay[mime] ?? '';
  }
  async play() {
    this.paused = false;
    this.dispatch('play');
  }
  pause() {
    this.paused = true;
    this.dispatch('pause');
  }
}
