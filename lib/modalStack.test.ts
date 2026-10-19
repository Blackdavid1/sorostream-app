import { describe, it, expect, beforeEach } from 'vitest';
import { pushModal, removeModal, isTopModal } from './modalStack';

describe('modalStack', () => {
  beforeEach(() => {
    // Ensure the stack is empty before each test by removing any lingering modals.
    // removeModal is a no-op for ids that are not present.
    for (let i = 0; i < 10; i += 1) {
      removeModal(`cleanup-${i}`);
    }
  });

  it('returns to its prior state when a modal is pushed and popped in the same synchronous call', () => {
    const before = isTopModal('existing');
    expect(before).toBe(false);

    pushModal('transient');
    expect(isTopModal('transient')).toBe(true);

    removeModal('transient');
    expect(isTopModal('transient')).toBe(false);
  });

  it('does not affect an unrelated modal already on the stack', () => {
    pushModal('stable');
    expect(isTopModal('stable')).toBe(true);

    pushModal('transient');
    expect(isTopModal('transient')).toBe(true);
    expect(isTopModal('stable')).toBe(false);

    removeModal('transient');
    expect(isTopModal('transient')).toBe(false);
    expect(isTopModal('stable')).toBe(true);

    removeModal('stable');
    expect(isTopModal('stable')).toBe(false);
  });

  it('reports isTopModal correctly throughout a push/pop sequence', () => {
    pushModal('base');
    expect(isTopModal('base')).toBe(true);

    pushModal('flash');
    expect(isTopModal('flash')).toBe(true);
    expect(isTopModal('base')).toBe(false);

    removeModal('flash');
    expect(isTopModal('flash')).toBe(false);
    expect(isTopModal('base')).toBe(true);

    removeModal('base');
    expect(isTopModal('base')).toBe(false);
  });
});
