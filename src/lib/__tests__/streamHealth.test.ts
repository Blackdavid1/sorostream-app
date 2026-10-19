import { describe, it, expect } from "vitest";
import {
  getStreamHealth,
  getStreamHealthDetails,
  EXPIRING_SOON_THRESHOLD_MS,
  type HealthStreamInput,
} from "../streamHealth";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal HealthStreamInput with sensible defaults. */
function makeStream(
  overrides: Partial<HealthStreamInput> & { endOffsetMs?: number } = {},
): HealthStreamInput {
  const { endOffsetMs = EXPIRING_SOON_THRESHOLD_MS * 2, ...rest } = overrides;
  return {
    status: "Active",
    endTime: new Date(NOW + endOffsetMs).toISOString(),
    ...rest,
  };
}

const NOW = 1_700_000_000_000; // fixed timestamp (ms) for all tests

// ---------------------------------------------------------------------------
// 1. All status variants — basic smoke tests
// ---------------------------------------------------------------------------

describe("getStreamHealth — status variants", () => {
  it("returns 'Active' for a running stream with endTime far in the future", () => {
    const stream = makeStream({ endOffsetMs: EXPIRING_SOON_THRESHOLD_MS * 3 });
    expect(getStreamHealth(stream, NOW)).toBe("Active");
  });

  it("returns 'Expiring Soon' for a stream ending within 24 hours", () => {
    // 1 second before the threshold boundary
    const stream = makeStream({ endOffsetMs: EXPIRING_SOON_THRESHOLD_MS - 1000 });
    expect(getStreamHealth(stream, NOW)).toBe("Expiring Soon");
  });

  it("returns 'Expired' for a stream whose endTime has already passed", () => {
    const stream = makeStream({ endOffsetMs: -1000 }); // 1 second in the past
    expect(getStreamHealth(stream, NOW)).toBe("Expired");
  });

  it("returns 'Expired' when status is 'Ended' regardless of endTime", () => {
    // endTime is in the future, but status says Ended
    const stream = makeStream({ status: "Ended", endOffsetMs: 86400000 });
    expect(getStreamHealth(stream, NOW)).toBe("Expired");
  });

  it("returns 'Paused' for a paused stream", () => {
    const stream = makeStream({ status: "Paused" });
    expect(getStreamHealth(stream, NOW)).toBe("Paused");
  });

  it("returns 'Cancelled' for a cancelled stream", () => {
    const stream = makeStream({ status: "Cancelled" });
    expect(getStreamHealth(stream, NOW)).toBe("Cancelled");
  });
});

// ---------------------------------------------------------------------------
// 2. Boundary conditions — time-based transitions
// ---------------------------------------------------------------------------

describe("getStreamHealth — boundary conditions", () => {
  it("returns 'Active' when endTime is exactly at EXPIRING_SOON_THRESHOLD_MS from now", () => {
    // At exactly the threshold the stream has 24 h remaining — NOT expiring soon yet
    const stream: HealthStreamInput = {
      status: "Active",
      endTime: new Date(NOW + EXPIRING_SOON_THRESHOLD_MS).toISOString(),
    };
    // endMs - now === threshold → NOT <= threshold
    expect(getStreamHealth(stream, NOW)).toBe("Active");
  });

  it("returns 'Expiring Soon' when endTime is 1 ms inside the threshold", () => {
    const stream: HealthStreamInput = {
      status: "Active",
      endTime: new Date(NOW + EXPIRING_SOON_THRESHOLD_MS - 1).toISOString(),
    };
    expect(getStreamHealth(stream, NOW)).toBe("Expiring Soon");
  });

  it("returns 'Expired' when endTime equals now (stream ends exactly at this moment)", () => {
    const stream: HealthStreamInput = {
      status: "Active",
      endTime: new Date(NOW).toISOString(),
    };
    // now >= endMs (equal), so Expired
    expect(getStreamHealth(stream, NOW)).toBe("Expired");
  });

  it("returns 'Active' when endTime is 1 ms in the future beyond the threshold", () => {
    const stream: HealthStreamInput = {
      status: "Active",
      endTime: new Date(NOW + EXPIRING_SOON_THRESHOLD_MS + 1).toISOString(),
    };
    expect(getStreamHealth(stream, NOW)).toBe("Active");
  });

  it("returns 'Expired' for endTime 1 second before now", () => {
    const stream: HealthStreamInput = {
      status: "Active",
      endTime: new Date(NOW - 1000).toISOString(),
    };
    expect(getStreamHealth(stream, NOW)).toBe("Expired");
  });

  it("returns 'Expired' for an unparseable endTime string", () => {
    const stream: HealthStreamInput = {
      status: "Active",
      endTime: "not-a-date",
    };
    expect(getStreamHealth(stream, NOW)).toBe("Expired");
  });
});

// ---------------------------------------------------------------------------
// 3. Paused overrides time-based calculations
// ---------------------------------------------------------------------------

describe("getStreamHealth — Paused overrides time-based status", () => {
  it("returns 'Paused' even when endTime is already past", () => {
    const stream: HealthStreamInput = {
      status: "Paused",
      endTime: new Date(NOW - 1000).toISOString(), // ended 1 second ago
    };
    expect(getStreamHealth(stream, NOW)).toBe("Paused");
  });

  it("returns 'Paused' even when stream would otherwise be 'Expiring Soon'", () => {
    const stream: HealthStreamInput = {
      status: "Paused",
      endTime: new Date(NOW + 3600_000).toISOString(), // 1 hour → expiring soon
    };
    expect(getStreamHealth(stream, NOW)).toBe("Paused");
  });

  it("returns 'Paused' even when endTime is far in the future (would be Active)", () => {
    const stream: HealthStreamInput = {
      status: "Paused",
      endTime: new Date(NOW + EXPIRING_SOON_THRESHOLD_MS * 10).toISOString(),
    };
    expect(getStreamHealth(stream, NOW)).toBe("Paused");
  });
});

// ---------------------------------------------------------------------------
// 4. Cancelled overrides everything — including Paused
// ---------------------------------------------------------------------------

describe("getStreamHealth — Cancelled overrides all statuses", () => {
  it("returns 'Cancelled' when status is Cancelled and endTime is in the future", () => {
    const stream: HealthStreamInput = {
      status: "Cancelled",
      endTime: new Date(NOW + EXPIRING_SOON_THRESHOLD_MS * 5).toISOString(),
    };
    expect(getStreamHealth(stream, NOW)).toBe("Cancelled");
  });

  it("returns 'Cancelled' when status is Cancelled and endTime is in the past", () => {
    const stream: HealthStreamInput = {
      status: "Cancelled",
      endTime: new Date(NOW - 86400_000).toISOString(), // 1 day ago
    };
    expect(getStreamHealth(stream, NOW)).toBe("Cancelled");
  });

  it("returns 'Cancelled' when status is Cancelled and endTime is unparseable", () => {
    const stream: HealthStreamInput = {
      status: "Cancelled",
      endTime: "garbage",
    };
    expect(getStreamHealth(stream, NOW)).toBe("Cancelled");
  });
});

// ---------------------------------------------------------------------------
// 5. Optional cliffTime field — does not affect status computation (pass-through)
// ---------------------------------------------------------------------------

describe("getStreamHealth — streams with cliff metadata", () => {
  it("still returns 'Active' when cliff is in the future", () => {
    const stream: HealthStreamInput = {
      status: "Active",
      endTime: new Date(NOW + EXPIRING_SOON_THRESHOLD_MS * 4).toISOString(),
      cliffTime: new Date(NOW + 3600_000).toISOString(), // 1 hour from now
    };
    expect(getStreamHealth(stream, NOW)).toBe("Active");
  });

  it("still returns 'Expiring Soon' with a past cliff date", () => {
    const stream: HealthStreamInput = {
      status: "Active",
      endTime: new Date(NOW + 3600_000).toISOString(), // 1 hour → expiring soon
      cliffTime: new Date(NOW - 3600_000).toISOString(), // cliff already passed
    };
    expect(getStreamHealth(stream, NOW)).toBe("Expiring Soon");
  });
});

// ---------------------------------------------------------------------------
// 6. Default `now` parameter uses real clock
// ---------------------------------------------------------------------------

describe("getStreamHealth — real-clock default", () => {
  it("uses Date.now() when `now` is omitted and correctly classifies an active stream", () => {
    const farFuture = new Date(Date.now() + EXPIRING_SOON_THRESHOLD_MS * 5).toISOString();
    const stream: HealthStreamInput = { status: "Active", endTime: farFuture };
    expect(getStreamHealth(stream)).toBe("Active");
  });

  it("uses Date.now() when `now` is omitted and classifies a past-ended stream as Expired", () => {
    const past = new Date(Date.now() - 10_000).toISOString();
    const stream: HealthStreamInput = { status: "Active", endTime: past };
    expect(getStreamHealth(stream)).toBe("Expired");
  });
});

// ---------------------------------------------------------------------------
// 7. Expired streams with and without an unclaimed balance (#717)
// ---------------------------------------------------------------------------

describe("getStreamHealthDetails — unclaimed balance on Expired streams", () => {
  const ended: HealthStreamInput = {
    status: "Active",
    endTime: new Date(NOW - 1000).toISOString(),
  };

  it("distinguishes an expired stream with funds left from a fully claimed one", () => {
    const withFunds = getStreamHealthDetails(ended, 5_000_000, NOW);
    const claimed = getStreamHealthDetails(ended, 0, NOW);

    expect(withFunds.status).toBe("Expired");
    expect(claimed.status).toBe("Expired");
    expect(withFunds.hasUnclaimedBalance).toBe(true);
    expect(claimed.hasUnclaimedBalance).toBe(false);
  });

  it("accepts the string amounts returned by claimableNow", () => {
    expect(getStreamHealthDetails(ended, "1", NOW).hasUnclaimedBalance).toBe(true);
    expect(getStreamHealthDetails(ended, "0", NOW).hasUnclaimedBalance).toBe(false);
    expect(getStreamHealthDetails(ended, "not-a-number", NOW).hasUnclaimedBalance).toBe(false);
  });

  it("treats an 'Ended' status the same way", () => {
    const stream = makeStream({ status: "Ended" });
    expect(getStreamHealthDetails(stream, 10, NOW)).toEqual({
      status: "Expired",
      hasUnclaimedBalance: true,
    });
  });

  it("keeps the priority order and only flags Expired streams", () => {
    const cases: Array<[HealthStreamInput, string]> = [
      [{ status: "Cancelled", endTime: new Date(NOW - 1000).toISOString() }, "Cancelled"],
      [{ status: "Paused", endTime: new Date(NOW - 1000).toISOString() }, "Paused"],
      [makeStream({ endOffsetMs: 3600_000 }), "Expiring Soon"],
      [makeStream({ endOffsetMs: EXPIRING_SOON_THRESHOLD_MS * 3 }), "Active"],
    ];
    for (const [stream, status] of cases) {
      const details = getStreamHealthDetails(stream, 10, NOW);
      expect(details.status).toBe(status);
      expect(details.status).toBe(getStreamHealth(stream, NOW));
      expect(details.hasUnclaimedBalance).toBe(false);
    }
  });
});
