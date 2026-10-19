"use client";

import { useEffect, useRef, useState } from "react";
import { claimableNow } from "@/src/lib/sorostream";

/** How often the claimable tooltip refreshes while stream details are visible. */
export const CLAIMABLE_REFRESH_MS = 5_000;

type ClaimableStream = Parameters<typeof claimableNow>[0];

/**
 * Returns the stream's current claimable amount (in stroops) and recomputes
 * it every `intervalMs` while `active` is true.
 *
 * Pass `active = false` (e.g. when the details modal is closed) to stop the
 * timer entirely so no updates happen in the background.
 */
export function useLiveClaimable(
  stream: ClaimableStream,
  active: boolean,
  intervalMs: number = CLAIMABLE_REFRESH_MS,
): number {
  const [claimable, setClaimable] = useState(() => Number(claimableNow(stream)));
  // Read the latest stream through a ref so parent re-renders with a new
  // object identity don't restart the timer.
  const streamRef = useRef(stream);
  streamRef.current = stream;
  // Track the live interval so rapid active toggling can never leave two running.
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const stop = () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    stop();
    if (!active) return;
    // Refresh immediately so a re-opened modal never shows a stale value.
    setClaimable(Number(claimableNow(streamRef.current)));
    intervalRef.current = setInterval(() => {
      setClaimable(Number(claimableNow(streamRef.current)));
    }, intervalMs);
    return stop;
  }, [active, intervalMs]);

  return claimable;
}
