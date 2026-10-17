import {
  persistError,
  getPersistedError,
  clearPersistedError,
} from "./errorPersist";

describe("errorPersist", () => {
  beforeEach(() => {
    clearPersistedError("stream-a");
    clearPersistedError("stream-b");
  });

  it("tracks errors for two stream ids independently when switching quickly", () => {
    persistError("stream-a", "stream A failed");

    // Navigate to stream B: it must not inherit A's error.
    expect(getPersistedError("stream-b")).toBeUndefined();

    // Navigate back to stream A: its error is still shown.
    expect(getPersistedError("stream-a")).toBe("stream A failed");
    expect(getPersistedError("stream-b")).toBeUndefined();
  });

  it("clears each stream's error independently on its own successful retry", () => {
    persistError("stream-a", "stream A failed");
    persistError("stream-b", "stream B failed");

    // Stream A retries successfully; B's error must remain untouched.
    clearPersistedError("stream-a");
    expect(getPersistedError("stream-a")).toBeUndefined();
    expect(getPersistedError("stream-b")).toBe("stream B failed");

    // Stream B retries successfully; A stays clear.
    clearPersistedError("stream-b");
    expect(getPersistedError("stream-b")).toBeUndefined();
    expect(getPersistedError("stream-a")).toBeUndefined();
  });
});
