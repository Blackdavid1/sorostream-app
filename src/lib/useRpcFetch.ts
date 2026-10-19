"use client";
/**
 * useRpcFetch — React hook that wraps rpcFetch with toast notifications.
 *
 * On a 429 rate-limit it shows:
 *   "Rate limited — retrying in Xs"
 * The message updates every second as the countdown progresses.
 * On successful retry the toast is dismissed and a brief success notice shown.
 */
import { useCallback, useRef } from "react";
import { rpcFetch, type RpcClientOptions } from "./rpcClient";
import { useToast } from "./toast";

const RATE_LIMIT_TOAST_KEY = "rpc-rate-limit";

/**
 * The caller currently driving the shared rate-limit toast. Only one
 * countdown may update the toast at a time; other callers wait silently.
 */
let toastOwner: symbol | null = null;

/**
 * Wrap RPC calls with retry handling and rate-limit toast notifications.
 *
 * @returns {<T>(fn: () => Promise<T>) => Promise<T>} A function that executes the given RPC call.
 */
export function useRpcFetch() {
  const { upsertPersistentToast, removeToast, addToast } = useToast();
  const activeToastId = useRef<number | null>(null);

  const fetch = useCallback(
    <T>(fn: () => Promise<T>): Promise<T> => {
      const caller = Symbol("rpc-caller");
      const release = () => {
        if (toastOwner === caller) toastOwner = null;
      };
      const opts: RpcClientOptions = {
        onRateLimit(secondsLeft, attempt) {
          if (toastOwner === null) toastOwner = caller;
          if (toastOwner !== caller) return;
          const msg =
            secondsLeft > 0
              ? `Rate limited — retrying in ${secondsLeft}s`
              : "Rate limited — retrying…";
          const id = upsertPersistentToast(
            `${RATE_LIMIT_TOAST_KEY}-${attempt}`,
            msg,
            "warning",
          );
          activeToastId.current = id;
        },
        onRetrySuccess() {
          if (toastOwner !== caller) return;
          release();
          if (activeToastId.current !== null) {
            removeToast(activeToastId.current);
            activeToastId.current = null;
          }
          addToast("Request succeeded after rate-limit retry", "success");
        },
      };

      return rpcFetch(fn, opts).finally(release);
    },
    [upsertPersistentToast, removeToast, addToast],
  );

  return fetch;
}
