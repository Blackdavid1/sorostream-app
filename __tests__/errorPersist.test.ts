import {
  persistError,
  clearError,
  getPersistedError,
  resetErrorPersist,
} from "../lib/errorPersist";

describe("errorPersist", () => {
  beforeEach(() => {
    resetErrorPersist();
  });

  it("tracks errors independently per stream id", () => {
    persistError("stream-a", "A failed");
    expect(getPersistedError("stream-a")).toBe("A failed");
    expect(getPersistedError("stream-b")).toBeUndefined();
  });

  it("keeps stream A's error when navigating to B and back to A", () => {
    persistError("stream-a", "A failed");

    // Navigate to stream B: A's error must not leak into B.
    expect(getPersistedError("stream-b")).toBeUndefined();

    // Navigate back to stream A: its error is still shown.
    expect(getPersistedError("stream-a")).toBe("A failed");
  });

  it("does not cross-contaminate when both streams error quickly", () => {
    persistError("stream-a", "A failed");
    persistError("stream-b", "B failed");

    expect(getPersistedError("stream-a")).toBe("A failed");
    expect(getPersistedError("stream-b")).toBe("B failed");
  });

  it("clears each stream independently on its own successful retry", () => {
    persistError("stream-a", "A failed");
    persistError("stream-b", "B failed");

    // A retries successfully: only A clears.
    clearError("stream-a");
    expect(getPersistedError("stream-a")).toBeUndefined();
    expect(getPersistedError("stream-b")).toBe("B failed");

    // B retries successfully: B clears too.
    clearError("stream-b");
    expect(getPersistedError("stream-b")).toBeUndefined();
  });

  it("clearing a stream that has no error is a no-op for other streams", () => {
    persistError("stream-a", "A failed");

    clearError("stream-b");
    expect(getPersistedError("stream-a")).toBe("A failed");
    expect(getPersistedError("stream-b")).toBeUndefined();
  });
});
