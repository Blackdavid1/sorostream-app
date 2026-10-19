import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RateLimitProvider, useRateLimit } from './RateLimitContext';

function Consumer() {
  const { active, secondsLeft } = useRateLimit();
  return (
    <div>
      <span data-testid="active">{String(active)}</span>
      <span data-testid="secondsLeft">{String(secondsLeft)}</span>
    </div>
  );
}

function renderProvider() {
  return render(
    <RateLimitProvider>
      <Consumer />
    </RateLimitProvider>,
  );
}

describe('RateLimitContext', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts down per second before reaching zero', () => {
    renderProvider();

    act(() => {
      window.dispatchEvent(
        new CustomEvent('rate-limit', { detail: { retryAfter: 3 } }),
      );
    });

    expect(screen.getByTestId('active').textContent).toBe('true');
    expect(screen.getByTestId('secondsLeft').textContent).toBe('3');

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId('secondsLeft').textContent).toBe('2');

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId('secondsLeft').textContent).toBe('1');
  });

  it('flips active to false in the same update that secondsLeft reaches zero', () => {
    const renders: Array<{ active: boolean; secondsLeft: number }> = [];

    function RecordingConsumer() {
      const { active, secondsLeft } = useRateLimit();
      renders.push({ active, secondsLeft });
      return null;
    }

    render(
      <RateLimitProvider>
        <RecordingConsumer />
      </RateLimitProvider>,
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent('rate-limit', { detail: { retryAfter: 2 } }),
      );
    });

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    const flashing = renders.filter(
      (r) => r.active === true && r.secondsLeft === 0,
    );
    expect(flashing).toHaveLength(0);

    const last = renders[renders.length - 1];
    expect(last).toEqual({ active: false, secondsLeft: 0 });
  });
});
