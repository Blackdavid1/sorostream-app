import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUnsavedChangesWarning } from './useUnsavedChangesWarning';

describe('useUnsavedChangesWarning', () => {
  let addSpy: ReturnType<typeof vi.spyOn>;
  let removeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    addSpy = vi.spyOn(window, 'addEventListener');
    removeSpy = vi.spyOn(window, 'removeEventListener');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const getBeforeUnloadHandler = () => {
    const call = addSpy.mock.calls.find(([event]) => event === 'beforeunload');
    return call?.[1] as ((event: BeforeUnloadEvent) => void) | undefined;
  };

  const createBeforeUnloadEvent = () => {
    const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    Object.defineProperty(event, 'returnValue', {
      writable: true,
      value: undefined,
    });
    return event;
  };

  it('does not warn after a successful save flips isDirty to false', () => {
    const { rerender } = renderHook(
      ({ isDirty }: { isDirty: boolean }) => useUnsavedChangesWarning(isDirty),
      { initialProps: { isDirty: true } },
    );

    // Dirty state registers a beforeunload listener.
    expect(getBeforeUnloadHandler()).toBeTypeOf('function');

    // Simulate a successful save.
    rerender({ isDirty: false });

    // The listener should have been removed on cleanup.
    expect(removeSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));

    // Triggering a navigation/unload event should not prompt.
    const event = createBeforeUnloadEvent();
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(event.returnValue).toBeUndefined();
  });

  it('warns when navigation happens while isDirty remains true', () => {
    renderHook(() => useUnsavedChangesWarning(true));

    const handler = getBeforeUnloadHandler();
    expect(handler).toBeTypeOf('function');

    const event = createBeforeUnloadEvent();
    handler?.(event);

    expect(event.defaultPrevented).toBe(true);
    expect(event.returnValue).toBe('');
  });
});
