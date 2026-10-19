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

## Federation & Stellar TOML Caching

`federation.ts` and `stellarToml.ts` both cache their resolved results in `sessionStorage` using the **same key convention**. This section documents that shared convention so a change to one module does not silently break the other.

### Shared sessionStorage key convention

Both modules derive their cache key from the same format:

```
<prefix>:<identifier>
```

- **`<prefix>`** — A module-specific, stable string prefix that namespaces the entry (e.g. the federation lookup vs. the stellar.toml lookup). The prefix is what keeps the two modules' entries from colliding in the shared `sessionStorage`.
- **`<identifier>`** — The lookup target for that module (e.g. the federation address / domain being resolved).
- **Value shape** — The stored value is the serialized resolved result for that identifier, written under the key above.

Because both modules rely on this identical `prefix:identifier` shape, **any change to the key format in one module must be mirrored in the other**, or cached entries will no longer be found (and stale entries may linger under the old key).

### TTL and invalidation

- **TTL is session-scoped only.** Cached entries live for the lifetime of the browser session (`sessionStorage` semantics). There is no time-based expiry beyond the session ending.
- **What invalidates a cached entry today:**
  - **Session end only.** When the browser session ends, `sessionStorage` is cleared and the cache is gone.
- **What does *not* invalidate a cached entry today:**
  - A **later failed verification** does not evict the cached entry. If a result was cached and a subsequent verification of the same identifier fails, the previously cached entry is left in place rather than being removed or overwritten with a failure state.
  - Other runtime events (e.g. transient network errors) likewise do not clear the cache.

### Keeping documentation and behavior consistent

This caching strategy is intentionally minimal, and the related cache-invalidation bugs/enhancements track the gaps above (notably that a later failed verification does not evict the cached entry). When changing caching behavior, key formats, or TTL logic in either module, update this section and the corresponding cache-invalidation issues together so the documented convention and the actual behavior stay in sync.
