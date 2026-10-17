import { renderHook } from '@testing-library/react';
import { useRef } from 'react';
import { useFocusTrap } from '../useFocusTrap';

describe('useFocusTrap', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  function setupTrap() {
    const { result } = renderHook(() => {
      const ref = useRef<HTMLDivElement>(null);
      useFocusTrap(ref);
      return ref;
    });

    // Attach the container to the ref so the hook can query focusable elements.
    (result.current as { current: HTMLDivElement | null }).current = container;
    return result;
  }

  function pressKey(key: string, shiftKey = false) {
    const event = new KeyboardEvent('keydown', {
      key,
      shiftKey,
      bubbles: true,
      cancelable: true,
    });
    container.dispatchEvent(event);
    return event;
  }

  it('keeps focus on the single focusable element when pressing Tab', () => {
    const button = document.createElement('button');
    button.textContent = 'Only';
    container.appendChild(button);
    button.focus();

    setupTrap();

    pressKey('Tab');

    expect(document.activeElement).toBe(button);
  });

  it('keeps focus on the single focusable element when pressing Shift+Tab', () => {
    const button = document.createElement('button');
    button.textContent = 'Only';
    container.appendChild(button);
    button.focus();

    setupTrap();

    pressKey('Tab', true);

    expect(document.activeElement).toBe(button);
  });
});
