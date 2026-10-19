/**
 * Modal stack — single-active-modal invariant
 * ============================================
 *
 * This module enforces that **only one modal may be open at a time**. When a
 * new modal is pushed onto the stack, every other registered modal is asked to
 * close, so the newly pushed modal becomes the sole active modal.
 *
 * Integration contract
 * --------------------
 * A modal component integrates with the stack as follows:
 *
 * 1. Call `pushModal(id)` when the modal opens (e.g. in an effect keyed on the
 *    `isOpen` prop, or when the open action fires). This registers the modal
 *    and, per the invariant, closes any other currently open modal.
 * 2. Call `removeModal(id)` when the modal closes or unmounts, so it no longer
 *    participates in the stack.
 * 3. Provide an `onClose` callback that actually closes the modal (updates the
 *    open state / unmounts it). The stack invokes `onClose` on every other
 *    registered modal when a new one is pushed; if `onClose` does not close the
 *    modal, the single-active-modal invariant is violated.
 *
 * Minimal example
 * ---------------
 * ```tsx
 * function MyModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
 *   const id = useId();
 *
 *   useEffect(() => {
 *     if (!isOpen) return;
 *     pushModal(id, onClose);
 *     return () => removeModal(id);
 *   }, [isOpen, id, onClose]);
 *
 *   if (!isOpen) return null;
 *   return <div role="dialog">...</div>;
 * }
 * ```
 *
 * Focus trapping
 * --------------
 * `useFocusTrap` relies on `isTopModal(id)` to decide whether a modal should
 * trap focus. Because the stack guarantees a single active modal, only the
 * top-most (and therefore only) modal traps focus. Keep this in sync: any
 * change to the single-active-modal invariant must preserve the assumption that
 * `isTopModal` is true for exactly one modal at a time.
 */

type ModalEntry = {
  id: string;
  onClose: () => void;
};

const stack: ModalEntry[] = [];

/**
 * Register a modal and make it the single active modal.
 *
 * Enforces the single-active-modal invariant by asking every other registered
 * modal to close via its `onClose` callback before the new modal is pushed.
 */
export function pushModal(id: string, onClose: () => void): void {
  for (const entry of stack) {
    if (entry.id !== id) {
      entry.onClose();
    }
  }
  stack.push({ id, onClose });
}

/**
 * Unregister a modal from the stack.
 *
 * Call this when the modal closes or unmounts so it no longer participates in
 * the single-active-modal invariant.
 */
export function removeModal(id: string): void {
  const index = stack.findIndex((entry) => entry.id === id);
  if (index !== -1) {
    stack.splice(index, 1);
  }
}

/**
 * Whether the given modal is the top-most (active) modal.
 *
 * Used by `useFocusTrap` to decide whether a modal should trap focus. Under the
 * single-active-modal invariant this is true for exactly one modal at a time.
 */
export function isTopModal(id: string): boolean {
  return stack.length > 0 && stack[stack.length - 1].id === id;
}
