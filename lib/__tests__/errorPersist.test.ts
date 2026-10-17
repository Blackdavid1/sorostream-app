import {
  persistError,
  getPersistedError,
  clearPersistedError,
} from "../errorPersist";

describe("errorPersist", () => {
  beforeEach(() => {
    clearPersistedError("stream-a");
    clearPersistedError("stream-b");
  });

  it("tracks errors for two stream ids independently when switching quickly", () => {
    persistError("stream-a", "stream A failed");
    expect(getPersistedError("stream-a")).toBe("stream A failed");
    expect(getPersistedError("stream-b")).toBeUndefined();

    // Navigate to stream B: A's error must not leak into B.
    expect(getPersistedError("stream-b")).toBeUndefined();

    // Navigate back to stream A: A's error is still shown.
    expect(getPersistedError("stream-a")).toBe("stream A failed");
  });

  it("clears each stream independently on its own successful retry", () => {
    persistError("stream-a", "stream A failed");
    persistError("stream-b", "stream B failed");

    clearPersistedError("stream-a");
    expect(getPersistedError("stream-a")).toBeUndefined();
    expect(getPersistedError("stream-b")).toBe("stream B failed");

    clearPersistedError("stream-b");
    expect(getPersistedError("stream-b")).toBeUndefined();
    expect(getPersistedError("stream-a")).toBeUndefined();
  });
});
