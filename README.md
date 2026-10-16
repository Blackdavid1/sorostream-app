# Project

## Modal Stack

The modal system is built around a single-active-modal invariant: **only one modal may be open at a time**. This is enforced by `modalStack.ts`, which, whenever a new modal is pushed, asks every other registered modal to close. Understanding this contract is essential when adding a new modal component.

### The `pushModal` / `removeModal` contract

- **`pushModal(modal)`** — Registers a modal as the active one. When called, the stack notifies all other registered modals to close (via their `onClose` handler). The newly pushed modal becomes the top modal.
- **`removeModal(modal)`** — Unregisters a modal from the stack. Call this when the modal is dismissed so the stack no longer tracks it.
- **`onClose`** — Every modal registered with the stack must provide an `onClose` callback. The stack invokes it to request that the modal close itself. `onClose` must actually dismiss the modal (e.g. update local state / call the parent's close handler) and then call `removeModal` for that modal. It must not throw or leave the modal mounted.

Because pushing a modal closes all others, you should never rely on two modals being open simultaneously. If a flow appears to need stacked modals, model it as a single modal with internal steps instead.

### Integrating a new modal

A minimal, correct integration looks like this:

```tsx
import { useEffect } from 'react';
import { pushModal, removeModal } from './modalStack';

function MyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;

    const modal = {
      // The stack calls this to ask the modal to close itself.
      onClose: () => onClose(),
    };

    pushModal(modal);
    return () => removeModal(modal);
  }, [open, onClose]);

  if (!open) return null;
  return <div role="dialog">…</div>;
}
```

Key points:

1. Register with `pushModal` when the modal opens, and always clean up with `removeModal` (the `useEffect` cleanup above handles both unmount and close).
2. Provide an `onClose` that genuinely closes the modal; the stack uses it to enforce the single-active-modal invariant.
3. Do not call `pushModal` for a modal that is already registered.

### Relationship to `useFocusTrap`

`useFocusTrap` uses `isTopModal` to decide whether a given modal is currently the top of the stack, and only traps focus when it is. This is the same invariant described above: since only one modal is active at a time, only the top modal should capture focus. When integrating a new modal, make sure it participates in the stack (via `pushModal`/`removeModal`) so that `isTopModal` reports correctly and focus trapping stays consistent with the single-active-modal behavior.
