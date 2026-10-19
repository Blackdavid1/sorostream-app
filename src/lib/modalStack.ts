/**
 * Global modal stack (#647).
 *
 * Only one modal may be open at a time: when a new modal registers, every
 * modal already on the stack is asked to close via its `onClose` callback.
 * Modals without an `onClose` stay on the stack but are no longer topmost,
 * so only the topmost modal handles keyboard focus trapping.
 *
 * A modal that has already started closing (e.g. it is playing a close
 * animation and is still mounted) can be flagged with `markModalClosing`.
 * A later `pushModal` will not call its `onClose` again (#711).
 */
export interface ModalEntry {
  id: number;
  onClose?: () => void;
  /** True once the modal has started closing; its onClose must not fire again. */
  closing: boolean;
}

let nextId = 1;
const stack: ModalEntry[] = [];

export function pushModal(onClose?: () => void): number {
  const id = nextId++;
  const others = stack.splice(0, stack.length);
  stack.push({ id, onClose, closing: false });
  // Close previously open modals outside the current call stack so React
  // state updates don't happen during another component's effect.
  const kept: ModalEntry[] = [];
  others.forEach((m) => {
    if (m.closing) {
      // Already closing: keep it below the new modal until it unmounts and
      // calls removeModal, but don't fire onClose a second time.
      kept.push(m);
    } else if (m.onClose) {
      m.closing = true;
      queueMicrotask(m.onClose);
    } else {
      kept.push(m);
    }
  });
  stack.unshift(...kept);
  return id;
}

/**
 * Flag a modal as closing so a subsequent `pushModal` doesn't call its
 * `onClose` again. Call this when the modal starts its own close sequence.
 */
export function markModalClosing(id: number): void {
  const entry = stack.find((m) => m.id === id);
  if (entry) entry.closing = true;
}

export function isModalClosing(id: number): boolean {
  return stack.find((m) => m.id === id)?.closing ?? false;
}

export function removeModal(id: number): void {
  const idx = stack.findIndex((m) => m.id === id);
  if (idx !== -1) stack.splice(idx, 1);
}

export function isTopModal(id: number): boolean {
  return stack.length > 0 && stack[stack.length - 1].id === id;
}

export function openModalCount(): number {
  return stack.length;
}

/** Test helper — clears the stack. */
export function resetModalStack(): void {
  stack.splice(0, stack.length);
}
