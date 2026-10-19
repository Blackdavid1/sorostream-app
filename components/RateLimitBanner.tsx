"use client";

import { useRateLimit } from "@/src/context/RateLimitContext";

/**
 * Prominent, full-width banner shown whenever the Soroban RPC rate-limits our
 * requests. It surfaces a live retry countdown so the user understands the app
 * is waiting on the network rather than failing silently. Hidden otherwise.
 */
export default function RateLimitBanner() {
  const { active, secondsLeft } = useRateLimit();

  // Guard against a transient render where the countdown has reached zero but
  // `active` has not yet flipped to false. Treating a zero countdown as
  // inactive keeps the banner from flashing a "0s" frame before it disappears.
  if (!active || secondsLeft <= 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="w-full bg-amber-900/80 border-b border-amber-700 text-amber-100 text-sm text-center py-2 px-4 flex items-center justify-center gap-2"
    >
      <span className="font-semibold">⏳ Rate limited</span>
      <span>
        The Soroban RPC is throttling requests — retrying in{" "}
        <span className="font-mono font-semibold tabular-nums">{secondsLeft}s</span>…
      </span>
    </div>
  );
}
