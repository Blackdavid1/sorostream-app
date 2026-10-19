import { useEffect, useRef } from 'react';
import { isTopModal } from '../lib/modalStack';

/**
 * useFocusTrap
 *
 * Traps keyboard focus inside the referenced element while it is the top-most
 * modal in the modal stack.
 *
 * ## Modal stack contract (see `lib/modalStack.ts`)
 *
 * The modal stack enforces a **single-active-modal invariant**: only one modal
 * may be open at a time. When a new modal is pushed via `pushModal`, every
 * other registered modal is asked to close (its `onClose` is invoked), so the
 * newly pushed modal becomes the sole active modal.
 *
 * Integration contract for a new modal component:
 *
 * 1. Call `pushModal(id, onClose)` when the modal opens (e.g. in an effect or
 *    on the open action). `onClose` must actually close the modal — it is how
 *    the stack dismisses every non-top modal when another one is pushed.
 * 2. Call `removeModal(id)` when the modal unmounts/closes so the stack does
 *    not retain a stale entry.
 * 3. Use `isTopModal(id)` to decide whether the modal should capture focus or
 *    handle keyboard interactions. Only the top modal is interactive.
 *
 * Minimal example:
 *
 * ```tsx
 * function MyModal({ id, onClose }: { id: string; onClose: () => void }) {
 *   const ref = useFocusTrap<HTMLDivElement>(id);
 *
 *   useEffect(() => {
 *     pushModal(id, onClose);
 *     return () => removeModal(id);
 *   }, [id, onClose]);
 *
 *   return <div ref={ref} role="dialog" aria-modal="true">...</div>;
 * }
 * ```
 *
 * `useFocusTrap` relies on `isTopModal` so that focus trapping stays consistent
 * with the single-active-modal invariant: only the top modal traps focus, and
 * when a new modal is pushed the previous one stops trapping focus as it is
 * closed by the stack.
 */
export function useFocusTrap<T extends HTMLElement>(modalId: string) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    if (!isTopModal(modalId)) {
      return;
    }

    const element = ref.current;
    if (!element) {
      return;
    }

    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusableSelector =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const getFocusable = () =>
      Array.from(element.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (node) => !node.hasAttribute('disabled') && node.offsetParent !== null,
      );

    const focusables = getFocusable();
    if (focusables.length > 0) {
      focusables[0].focus();
    } else {
      element.focus();
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') {
        return;
      }

      const currentFocusables = getFocusable();
      if (currentFocusables.length === 0) {
        event.preventDefault();
        return;
      }

      const first = currentFocusables[0];
      const last = currentFocusables[currentFocusables.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    element.addEventListener('keydown', handleKeyDown);

    return () => {
      element.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    };
  }, [modalId]);

  return ref;
}
