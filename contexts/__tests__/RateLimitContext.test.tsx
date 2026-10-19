import React from 'react';
import { render, act } from '@testing-library/react';
import { RateLimitProvider, useRateLimit } from '../RateLimitContext';

// Helper component that exposes the context value to the test via a ref-like
// callback so we can inspect every render.
function RateLimitConsumer({
  onRender,
}: {
  onRender: (value: ReturnType<typeof useRateLimit>) => void;
}) {
  const value = useRateLimit();
  onRender(value);
  return null;
}

describe('RateLimitContext countdown atomicity', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('clears active exactly when the countdown reaches zero without an intermediate secondsLeft===0 && active===true render', () => {
    const renders: Array<{ active: boolean; secondsLeft: number }> = [];

    const { unmount } = render(
      <RateLimitProvider>
        <RateLimitConsumer
          onRender={(value) => {
            renders.push({
              active: value.active,
              secondsLeft: value.secondsLeft,
            });
          }}
        />
      </RateLimitProvider>,
    );

    // Drive the countdown down to its final tick. We advance one second at a
    // time so we can observe each intermediate render.
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    // Keep ticking until the countdown completes (active becomes false).
    // Guard against an infinite loop in case the implementation never clears.
    let guard = 0;
    while (
      renders.length > 0 &&
      renders[renders.length - 1].active &&
      guard < 120
    ) {
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      guard += 1;
    }

    // The countdown must have completed.
    expect(renders[renders.length - 1].active).toBe(false);

    // No intermediate render may expose secondsLeft === 0 while active is
    // still true. The transition must be atomic.
    const invalidRenders = renders.filter(
      (r) => r.secondsLeft === 0 && r.active === true,
    );
    expect(invalidRenders).toEqual([]);

    // active must become false exactly when the countdown completes: the
    // first render where active is false must have secondsLeft === 0.
    const firstInactiveIndex = renders.findIndex((r) => r.active === false);
    expect(firstInactiveIndex).toBeGreaterThanOrEqual(0);
    expect(renders[firstInactiveIndex].secondsLeft).toBe(0);

    unmount();
  });
});
