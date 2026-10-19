import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("@/src/lib/network", () => ({
  useNetwork: () => ({ rpcUrl: "https://rpc.test" }),
}));

import {
  averageLatency,
  deriveStatus,
  pushSample,
  useRpcHealth,
  SAMPLE_WINDOW,
  type HealthSample,
} from "../useRpcHealth";

const THRESHOLD = 2_000;
const ok = (latencyMs: number): HealthSample => ({ latencyMs, ok: true, rateLimited: false });
const rateLimited = (latencyMs: number): HealthSample => ({ latencyMs, ok: false, rateLimited: true });
const failed = (latencyMs: number): HealthSample => ({ latencyMs, ok: false, rateLimited: false });

describe("useRpcHealth sample helpers (#710)", () => {
  it("records a rate-limited poll instead of skipping it", () => {
    const samples = pushSample([ok(100)], rateLimited(50));
    expect(samples).toHaveLength(2);
    expect(samples[1].rateLimited).toBe(true);
  });

  it("keeps only the newest SAMPLE_WINDOW samples", () => {
    let samples: HealthSample[] = [];
    for (let i = 0; i < SAMPLE_WINDOW + 3; i++) samples = pushSample(samples, ok(i));
    expect(samples).toHaveLength(SAMPLE_WINDOW);
    expect(samples[samples.length - 1].latencyMs).toBe(SAMPLE_WINDOW + 2);
  });

  it("counts failed and rate-limited samples in the average at no less than the threshold", () => {
    // A fast 429 must not make the average look faster.
    expect(averageLatency([ok(100), rateLimited(20)], THRESHOLD)).toBe(Math.round((100 + THRESHOLD) / 2));
    // A slow timeout counts at its real duration.
    expect(averageLatency([ok(100), failed(8_000)], THRESHOLD)).toBe(Math.round((100 + 8_000) / 2));
    expect(averageLatency([], THRESHOLD)).toBeNull();
  });

  it("a rate-limited poll makes the status degraded, not healthy or skipped", () => {
    expect(deriveStatus([ok(100), ok(100), rateLimited(30)], THRESHOLD)).toBe("degraded");
  });

  it("rate-limited samples keep pulling the status toward degraded after they pass", () => {
    const samples = [rateLimited(10), rateLimited(10), rateLimited(10), ok(1_500)];
    // avg = (2000 * 3 + 1500) / 4 = 1875 → still healthy
    expect(deriveStatus(samples, THRESHOLD)).toBe("healthy");
    // avg = (2000 * 3 + 1900 + 2500) / 5 = 2080 → degraded, even though the
    // newest poll alone succeeded
    const worse = [rateLimited(10), rateLimited(10), rateLimited(10), ok(1_900), ok(2_500)];
    expect(deriveStatus(worse, THRESHOLD)).toBe("degraded");
  });

  it("a hard failure is unreachable; an empty window is unknown", () => {
    expect(deriveStatus([ok(100), failed(8_000)], THRESHOLD)).toBe("unreachable");
    expect(deriveStatus([], THRESHOLD)).toBe("unknown");
  });
});

describe("useRpcHealth hook (#710)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports degraded with a latency sample when the health check is rate-limited", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 429 } as Response),
    );

    const { result } = renderHook(() => useRpcHealth());

    await waitFor(() => expect(result.current.status).toBe("degraded"));
    expect(result.current.latencyMs).not.toBeNull();
    expect(result.current.lastChecked).toBeInstanceOf(Date);
    expect(result.current.showBanner).toBe(false);
  });

  it("reports unreachable when the request fails outright", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network down")));

    const { result } = renderHook(() => useRpcHealth());

    await waitFor(() => expect(result.current.status).toBe("unreachable"));
  });
});
