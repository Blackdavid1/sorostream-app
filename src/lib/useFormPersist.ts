"use client";

import { useCallback, useEffect, useRef } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** All fields the create-stream wizard persists to sessionStorage. */
export interface CreateStreamDraft {
  recipient: string;
  amount: string;
  duration: number;
  selectedToken: string;
  customTokenAddress: string;
  endDate: string;
  cliffDate: string;
}

/** The key under which the draft is stored in sessionStorage. */
export const FORM_DRAFT_KEY = "sorostream_create_stream_draft";

// ---------------------------------------------------------------------------
// Low-level helpers (pure functions — easy to unit-test independently)
// ---------------------------------------------------------------------------

/**
 * Read and parse a draft from sessionStorage.
 * Returns `null` on any error (missing key, malformed JSON, wrong shape).
 */
export function readDraft(): CreateStreamDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(FORM_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CreateStreamDraft>;
    // Validate that at least the required string keys exist so we never
    // restore a stale draft from a different schema version.
    if (
      typeof parsed.recipient !== "string" ||
      typeof parsed.amount !== "string" ||
      typeof parsed.duration !== "number" ||
      typeof parsed.selectedToken !== "string"
    ) {
      clearDraft();
      return null;
    }
    return {
      recipient: parsed.recipient ?? "",
      amount: parsed.amount ?? "",
      duration: parsed.duration ?? 0,
      selectedToken: parsed.selectedToken ?? "USDC",
      customTokenAddress: parsed.customTokenAddress ?? "",
      endDate: parsed.endDate ?? "",
      cliffDate: parsed.cliffDate ?? "",
    };
  } catch {
    return null;
  }
}

/** Persist `draft` to sessionStorage. Silently ignores errors (private/incognito). */
export function writeDraft(draft: CreateStreamDraft): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(FORM_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // sessionStorage may be unavailable (private mode quota, security policy)
  }
}

/** Remove the persisted draft from sessionStorage. */
export function clearDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(FORM_DRAFT_KEY);
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

export interface UseFormPersistReturn {
  /**
   * Save the current form state to sessionStorage.
   * Call this inside every field's onChange handler.
   */
  saveDraft: (draft: CreateStreamDraft) => void;
  /**
   * Wipe the persisted draft.
   * Call on successful stream creation and on explicit "Reset" actions.
   */
  clearDraft: () => void;
}

/**
 * `useFormPersist` manages create-stream form draft persistence via
 * sessionStorage.
 *
 * Usage pattern:
 *
 * ```tsx
 * const draft = readDraft(); // read once before useState initialisation
 *
 * const [recipient, setRecipient] = useState(draft?.recipient ?? initialRecipient);
 * // … other fields …
 *
 * const { saveDraft, clearDraft } = useFormPersist();
 *
 * // In every onChange:
 * onChange={(v) => {
 *   setRecipient(v);
 *   saveDraft({ recipient: v, amount, duration, … });
 * }}
 *
 * // On successful create:
 * clearDraft();
 * router.push(…);
 * ```
 *
 * The hook debounces writes by 150 ms so rapid keystrokes don't saturate
 * sessionStorage with synchronous calls on every keystroke. Once `clearDraft`
 * is called, any write debounced before the clear is discarded when its timer
 * fires, so a cleared draft can never be resurrected by an in-flight write;
 * saves made after the clear (a fresh editing session) persist as usual.
 */
export function useFormPersist(): UseFormPersistReturn {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generationRef = useRef(0);

  // Cancel any pending debounced write on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const saveDraft = useCallback((draft: CreateStreamDraft) => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    const generation = generationRef.current;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (generation !== generationRef.current) return;
      writeDraft(draft);
    }, 150);
  }, []);

  const clearDraftCb = useCallback(() => {
    generationRef.current += 1;
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    clearDraft();
  }, []);

  return { saveDraft, clearDraft: clearDraftCb };
}
