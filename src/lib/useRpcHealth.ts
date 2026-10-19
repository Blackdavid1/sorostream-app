"use client";
/**
 * useRpcHealth — polls the active RPC endpoint every 30 seconds
 * and exposes the current health status, latency, and last-checked timestamp.
 *
 * Status thresholds are configurable via env vars:
 *   NEXT_PUBLIC_RPC_DEGRADED_MS  — latency (ms) above which status → "degraded"  (default: 2000)
 *   NEXT_PUBLIC_RPC_UNREACHABLE_BANNER_S — seconds unreachable before banner shows (default: 60)
 *
 * `latencyMs` is a rolling average over the last SAMPLE_WINDOW polls. Every
 * poll counts, including rate-limited (429) and failed ones.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { useNetwork } from "@/src/lib/network";

export type RpcStatus = "unknown" | "healthy" | "degraded" | "unreachable";

export interface RpcHealthState {
  status: RpcStatus;
  latencyMs: number | null;
  lastChecked: Date | null;
  showBanner: boolean;
}

const POLL_INTERVAL_MS = 30_000;

/** Number of recent polls used for the rolling latency average. */
export const SAMPLE_WINDOW = 5;

export interface HealthSample {
  /** Round-trip time of the poll in ms. */
  latencyMs: number;
  /** True when the endpoint answered with a 2xx response. */
  ok: boolean;
  /** True when the endpoint answered 429 Too Many Requests. */
  rateLimited: boolean;
}

/** Append a sample, keeping only the newest `windowSize` entries. */
export function pushSample(
  samples: readonly HealthSample[],
  sample: HealthSample,
  windowSize: number = SAMPLE_WINDOW,
): HealthSample[] {
  return [...samples, sample].slice(-windowSize);
}

/**
 * Rolling average latency over the sample window.
 *
 * Failed samples (rate-limited or unreachable) are counted too, at no less
 * than the degraded threshold. Otherwise a fast 429 or a dropped poll would
 * pull the average toward only the successful, faster requests (#710).
 */
export function averageLatency(
  samples: readonly HealthSample[],
  degradedThresholdMs: number,
): number | null {
  if (samples.length === 0) return null;
  const total = samples.reduce(
    (sum, s) => sum + (s.ok ? s.latencyMs : Math.max(s.latencyMs, degradedThresholdMs)),
    0,
  );
  return Math.round(total / samples.length);
}

/**
 * Status from the newest sample and the rolling average:
 * - unreachable: the newest poll failed outright (network error, timeout, non-429 error)
 * - degraded: the newest poll was rate-limited, or the average is over the threshold
 * - healthy: otherwise
 */
export function deriveStatus(
  samples: readonly HealthSample[],
  degradedThresholdMs: number,
): RpcStatus {
  const latest = samples[samples.length - 1];
  if (!latest) return "unknown";
  if (!latest.ok && !latest.rateLimited) return "unreachable";
  if (latest.rateLimited) return "degraded";
  const avg = averageLatency(samples, degradedThresholdMs) ?? 0;
  return avg > degradedThresholdMs ? "degraded" : "healthy";
}

function getDegradedThreshold(): number {
  const raw = process.env.NEXT_PUBLIC_RPC_DEGRADED_MS;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 2_000;
}

function getBannerThreshold(): number {
  const raw = process.env.NEXT_PUBLIC_RPC_UNREACHABLE_BANNER_S;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60;
}

/**
 * Periodically ping the active RPC endpoint and report its health.
 *
 * @returns {RpcHealthState} Status, rolling average latency in ms, last check time and whether to show the warning banner.
 */
export function useRpcHealth(): RpcHealthState {
  const { rpcUrl } = useNetwork();
  const [status, setStatus] = useState<RpcStatus>("unknown");
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [showBanner, setShowBanner] = useState(false);

  /** Timestamp (ms) when the RPC first became unreachable in the current run. */
  const unreachableSinceRef = useRef<number | null>(null);
  /** Recent poll results for the rolling average; reset when rpcUrl changes. */
  const samplesRef = useRef<HealthSample[]>([]);

  const checkHealth = useCallback(async () => {
    const degradedThreshold = getDegradedThreshold();
    const bannerThresholdMs = getBannerThreshold() * 1_000;

    const start = performance.now();
    let sample: HealthSample;
    try {
      // Use a lightweight JSON-RPC ping (getHealth) to probe the endpoint.
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth", params: [] }),
        signal: AbortSignal.timeout(8_000),
      });
      const elapsed = Math.round(performance.now() - start);
      sample = { latencyMs: elapsed, ok: res.ok, rateLimited: res.status === 429 };
    } catch {
      const elapsed = Math.round(performance.now() - start);
      sample = { latencyMs: elapsed, ok: false, rateLimited: false };
    }

    // Every poll is recorded, including rate-limited ones (#710).
    samplesRef.current = pushSample(samplesRef.current, sample);
    const nextStatus = deriveStatus(samplesRef.current, degradedThreshold);

    setLatencyMs(averageLatency(samplesRef.current, degradedThreshold));
    setLastChecked(new Date());
    setStatus(nextStatus);

    if (nextStatus === "unreachable") {
      // Track how long we've been unreachable
      if (unreachableSinceRef.current === null) {
        unreachableSinceRef.current = Date.now();
      }
      const unreachableDurationMs = Date.now() - unreachableSinceRef.current;
      setShowBanner(unreachableDurationMs >= bannerThresholdMs);
    } else {
      // The endpoint answered (possibly with a 429), so it is reachable.
      unreachableSinceRef.current = null;
      setShowBanner(false);
    }
  }, [rpcUrl]);

  // Run immediately on mount and whenever rpcUrl changes, then poll.
  useEffect(() => {
    samplesRef.current = [];
    unreachableSinceRef.current = null;
    void checkHealth();
    const interval = setInterval(() => void checkHealth(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [checkHealth]);

  return { status, latencyMs, lastChecked, showBanner };
}
