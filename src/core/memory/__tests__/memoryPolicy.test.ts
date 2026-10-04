import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/core/schemas/settings';
import { LOW_MEMORY_BUFFER_BYTES, planBuffer } from '../memoryPolicy';

describe('planBuffer', () => {
  it('keeps the user plan on normal devices', () => {
    const plan = planBuffer(DEFAULT_SETTINGS, { lowMemory: false, deviceMemoryGb: 8 });
    expect(plan.window.aheadSeconds).toBe(90);
    expect(plan.memoryLimitBytes).toBe(DEFAULT_SETTINGS.buffer.memoryLimitBytes);
    expect(plan.adjustedReason).toBeUndefined();
  });
  it('reduces the window and limit on low-memory devices and explains it', () => {
    const plan = planBuffer(DEFAULT_SETTINGS, { lowMemory: true, deviceMemoryGb: 1 });
    expect(plan.window).toEqual({ initialSeconds: 15, aheadSeconds: 45, behindSeconds: 5 });
    expect(plan.memoryLimitBytes).toBe(LOW_MEMORY_BUFFER_BYTES);
    expect(plan.adjustedReason).toMatch(/1 GB/);
  });
  it('respects the opt-out', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      buffer: { ...DEFAULT_SETTINGS.buffer, autoLowMemory: false },
    };
    expect(
      planBuffer(settings, { lowMemory: true, deviceMemoryGb: 1 }).adjustedReason,
    ).toBeUndefined();
  });
});
