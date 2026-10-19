import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { rpcClient, computeBackoffDelay } from './rpcClient';

describe('rpcClient backoff jitter', () => {
  const BASE_SEQUENCE = [2000, 4000, 8000, 16000, 32000, 60000];

  it('includes a bounded randomized jitter on top of the exponential base', () => {
    for (let attempt = 0; attempt < BASE_SEQUENCE.length; attempt++) {
      const base = BASE_SEQUENCE[attempt];
      const delay = computeBackoffDelay(attempt);
      // Jitter must never reduce the delay below the documented base and must
      // stay within a bounded window above it so worst-case latency is not
      // meaningfully increased over the documented sequence.
      expect(delay).toBeGreaterThanOrEqual(base);
      expect(delay).toBeLessThanOrEqual(base * 1.25);
    }
  });

  it('produces varying delays across repeated runs for the same attempt', () => {
    const attempt = 2;
    const base = BASE_SEQUENCE[attempt];
    const samples = new Set<number>();
    for (let i = 0; i < 50; i++) {
      const delay = computeBackoffDelay(attempt);
      expect(delay).toBeGreaterThanOrEqual(base);
      expect(delay).toBeLessThanOrEqual(base * 1.25);
      samples.add(delay);
    }
    // With jitter, consecutive samples should not all be identical.
    expect(samples.size).toBeGreaterThan(1);
  });

  it('caps the base delay at 60 seconds before applying jitter', () => {
    const delay = computeBackoffDelay(10);
    expect(delay).toBeGreaterThanOrEqual(60000);
    expect(delay).toBeLessThanOrEqual(60000 * 1.25);
  });
});

describe('rpcClient retry behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('retries rate-limited calls with jittered backoff delays', async () => {
    const delays: number[] = [];
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    setTimeoutSpy.mockImplementation(((fn: () => void, ms?: number) => {
      if (typeof ms === 'number' && ms > 0) {
        delays.push(ms);
      }
      fn();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: { get: () => null },
        json: async () => ({}),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: { get: () => null },
        json: async () => ({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ result: 'ok' }),
      });
    vi.stubGlobal('fetch', fetchMock);

    await rpcClient('https://example.invalid', 'getSlot', []);

    expect(delays.length).toBeGreaterThanOrEqual(2);
    // Each retry delay must fall within the jittered bounds of its base.
    delays.forEach((delay, index) => {
      const base = BASE_SEQUENCE[index];
      expect(delay).toBeGreaterThanOrEqual(base);
      expect(delay).toBeLessThanOrEqual(base * 1.25);
    });
  });
});
