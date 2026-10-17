import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { balanceCache, MAX_AGE_MS } from './balanceCache';

describe('balanceCache snapshot expiry at MAX_AGE_MS boundary', () => {
  const NOW = new Date('2024-06-01T00:00:00.000Z').getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    balanceCache.clear();
  });

  afterEach(() => {
    balanceCache.clear();
    vi.useRealTimers();
  });

  it('treats a snapshot exactly MAX_AGE_MS old as expired (boundary is exclusive)', () => {
    // Boundary behavior: a snapshot is considered expired once its age is
    // >= MAX_AGE_MS. A snapshot exactly MAX_AGE_MS old is therefore expired.
    balanceCache.set('acct-boundary', { balance: '100', timestamp: NOW - MAX_AGE_MS });

    expect(balanceCache.get('acct-boundary')).toBeUndefined();
  });

  it('excludes a snapshot one millisecond past MAX_AGE_MS', () => {
    balanceCache.set('acct-past', { balance: '100', timestamp: NOW - MAX_AGE_MS - 1 });

    expect(balanceCache.get('acct-past')).toBeUndefined();
  });

  it('includes a snapshot one millisecond under MAX_AGE_MS', () => {
    const snapshot = { balance: '100', timestamp: NOW - MAX_AGE_MS + 1 };
    balanceCache.set('acct-under', snapshot);

    expect(balanceCache.get('acct-under')).toEqual(snapshot);
  });
});
